import { insertRows } from "./bigquery";
import { pushGatus } from "./gatus";
import { fetchGoogleAccessToken } from "./google";
import { fetchRecentlyPlayed, refreshAccessToken } from "./spotify";

export type Bindings = {
	STATE: KVNamespace;
	GCP_PROJECT_ID: string;
	GATUS_URL: string;
	GATUS_ENDPOINT_KEY: string;
	SPOTIFY_CLIENT_ID: string;
	SPOTIFY_CLIENT_SECRET: string;
	SPOTIFY_REFRESH_TOKEN: string;
	GCP_SERVICE_ACCOUNT_KEY: string;
	GATUS_TOKEN: string;
	CF_ACCESS_CLIENT_ID: string;
	CF_ACCESS_CLIENT_SECRET: string;
};

const KV_REFRESH_TOKEN = "spotify_refresh_token";
const KV_CURSOR = "cursor_played_at";
// Spotify can surface a play a little after its played_at, so each run re-reads a short overlap.
const ROLLBACK_MS = 2 * 60 * 1000;

type RunResult = { fetched: number; afterMs: number | null };

type StoredRefreshToken = { seed: string; token: string };

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Spotify が回した refresh token は KV に持つ。secret の token を取り直して入れ替えたときは
// KV の token がその前の系列なので、seed（secret の token のハッシュ）が変わったら secret を使う
async function currentRefreshToken(env: Bindings): Promise<{ seed: string; token: string }> {
	const seed = await sha256(env.SPOTIFY_REFRESH_TOKEN);
	const raw = await env.STATE.get(KV_REFRESH_TOKEN);
	const stored = raw ? (JSON.parse(raw) as StoredRefreshToken) : null;
	return stored && stored.seed === seed ? stored : { seed, token: env.SPOTIFY_REFRESH_TOKEN };
}

async function ingest(env: Bindings, runId: string, now: Date): Promise<RunResult> {
	const refresh = await currentRefreshToken(env);
	const grant = await refreshAccessToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET, refresh.token);
	if (grant.refreshToken && grant.refreshToken !== refresh.token) {
		const next: StoredRefreshToken = { seed: refresh.seed, token: grant.refreshToken };
		await env.STATE.put(KV_REFRESH_TOKEN, JSON.stringify(next));
	}

	const cursor = await env.STATE.get(KV_CURSOR);
	const afterMs = cursor ? Math.max(0, Date.parse(cursor) - ROLLBACK_MS) : null;
	const items = await fetchRecentlyPlayed(grant.accessToken, afterMs);
	if (items.length === 0) return { fetched: 0, afterMs };

	const googleToken = await fetchGoogleAccessToken(env.GCP_SERVICE_ACCOUNT_KEY, now);
	const fetchedAt = now.toISOString();
	await insertRows(
		googleToken,
		env.GCP_PROJECT_ID,
		"spotify_raw",
		"plays",
		items.map((item) => ({
			insertId: `${item.played_at}/${item.track.id ?? ""}`,
			json: {
				played_at: item.played_at,
				track_id: item.track.id,
				item: JSON.stringify(item),
				fetched_at: fetchedAt,
				run_id: runId,
			},
		})),
	);

	const maxPlayedAt = Math.max(...items.map((item) => Date.parse(item.played_at)).filter(Number.isFinite));
	if (Number.isFinite(maxPlayedAt)) {
		await env.STATE.put(KV_CURSOR, new Date(maxPlayedAt).toISOString());
	}
	return { fetched: items.length, afterMs };
}

async function recordRun(env: Bindings, row: Record<string, unknown>, now: Date): Promise<void> {
	const googleToken = await fetchGoogleAccessToken(env.GCP_SERVICE_ACCOUNT_KEY, now);
	await insertRows(googleToken, env.GCP_PROJECT_ID, "spotify_ops", "runs", [
		{ insertId: String(row.run_id), json: row },
	]);
}

export async function run(env: Bindings, now: Date = new Date()): Promise<void> {
	const runId = crypto.randomUUID();
	const startedAt = now.toISOString();
	let outcome: "ok" | "error" = "ok";
	let error: string | null = null;
	let result: RunResult = { fetched: 0, afterMs: null };

	try {
		result = await ingest(env, runId, now);
	} catch (err) {
		outcome = "error";
		error = err instanceof Error ? err.message : String(err);
		console.error("ingest failed", { runId, error });
	}

	const durationMs = Date.now() - now.getTime();
	const sideEffects: Promise<void>[] = [
		recordRun(
			env,
			{
				run_id: runId,
				started_at: startedAt,
				finished_at: new Date().toISOString(),
				status: outcome,
				after_played_at: result.afterMs === null ? null : new Date(result.afterMs).toISOString(),
				fetched: result.fetched,
				error,
			},
			now,
		),
		pushGatus(
			env.GATUS_URL,
			env.GATUS_ENDPOINT_KEY,
			env.GATUS_TOKEN,
			{ clientId: env.CF_ACCESS_CLIENT_ID, clientSecret: env.CF_ACCESS_CLIENT_SECRET },
			{ success: outcome === "ok", error: error ?? undefined, durationMs },
		),
	];
	for (const r of await Promise.allSettled(sideEffects)) {
		if (r.status === "rejected") console.error("post-run step failed", { runId, error: String(r.reason) });
	}
}

export default {
	async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(run(env));
	},
} satisfies ExportedHandler<Bindings>;
