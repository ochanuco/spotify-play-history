import { afterEach, describe, expect, it, vi } from "vitest";
import { externalEndpointUrl } from "../src/gatus";
import { type Bindings, run } from "../src/index";

class MemoryKV {
	store = new Map<string, string>();
	async get(key: string) {
		return this.store.get(key) ?? null;
	}
	async put(key: string, value: string) {
		this.store.set(key, value);
	}
	async delete(key: string) {
		this.store.delete(key);
	}
}

async function testServiceAccountKey(): Promise<string> {
	const pair = (await crypto.subtle.generateKey(
		{ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
		true,
		["sign", "verify"],
	)) as CryptoKeyPair;
	const pkcs8 = Buffer.from((await crypto.subtle.exportKey("pkcs8", pair.privateKey)) as ArrayBuffer).toString("base64");
	return JSON.stringify({
		client_email: "ingest@chanuco.iam.gserviceaccount.com",
		private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n`,
	});
}

async function makeEnv(kv: MemoryKV): Promise<Bindings> {
	return {
		STATE: kv as unknown as KVNamespace,
		GCP_PROJECT_ID: "chanuco",
		GATUS_URL: "https://status.example",
		GATUS_ENDPOINT_KEY: "spotify_play-history",
		SPOTIFY_CLIENT_ID: "cid",
		SPOTIFY_CLIENT_SECRET: "csecret",
		SPOTIFY_REFRESH_TOKEN: "initial-refresh",
		GCP_SERVICE_ACCOUNT_KEY: await testServiceAccountKey(),
		GATUS_TOKEN: "gatus-token",
		CF_ACCESS_CLIENT_ID: "access-id",
		CF_ACCESS_CLIENT_SECRET: "access-secret",
	};
}

type Call = { url: string; init?: RequestInit };

function mockFetch(handlers: { spotifyToken: Response; recentlyPlayed?: unknown }) {
	const calls: Call[] = [];
	const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		calls.push({ url, init });
		if (url === "https://accounts.spotify.com/api/token") return handlers.spotifyToken.clone();
		if (url.startsWith("https://api.spotify.com/v1/me/player/recently-played")) {
			return Response.json(handlers.recentlyPlayed ?? { items: [] });
		}
		if (url === "https://oauth2.googleapis.com/token") return Response.json({ access_token: "google-token" });
		if (url.includes("/insertAll")) return Response.json({ kind: "bigquery#tableDataInsertAllResponse" });
		if (url.startsWith("https://status.example/")) return new Response("", { status: 200 });
		throw new Error(`unexpected fetch ${url}`);
	});
	vi.stubGlobal("fetch", fetchMock);
	return calls;
}

const item = (playedAt: string, trackId: string) => ({
	played_at: playedAt,
	track: { id: trackId, name: `track ${trackId}` },
	context: null,
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("run", () => {
	it("stores plays as raw JSON, advances the cursor, and reports success to Gatus", async () => {
		const kv = new MemoryKV();
		const calls = mockFetch({
			spotifyToken: Response.json({ access_token: "spotify-token" }),
			recentlyPlayed: { items: [item("2026-11-28T01:00:00.000Z", "a"), item("2026-11-28T01:04:00.000Z", "b")] },
		});

		await run(await makeEnv(kv), new Date("2026-11-28T01:10:00Z"));

		const plays = calls.find((c) => c.url.includes("/spotify_raw/tables/plays/insertAll"));
		const rows = JSON.parse(String(plays?.init?.body)).rows;
		expect(rows).toHaveLength(2);
		expect(rows[0].insertId).toBe("2026-11-28T01:00:00.000Z/a");
		expect(JSON.parse(rows[1].json.item)).toEqual(item("2026-11-28T01:04:00.000Z", "b"));
		expect(kv.store.get("cursor_played_at")).toBe("2026-11-28T01:04:00.000Z");

		const runs = calls.find((c) => c.url.includes("/spotify_ops/tables/runs/insertAll"));
		expect(JSON.parse(String(runs?.init?.body)).rows[0].json).toMatchObject({ status: "ok", fetched: 2, error: null });

		const gatus = calls.find((c) => c.url.startsWith("https://status.example/"));
		expect(new URL(gatus?.url ?? "").searchParams.get("success")).toBe("true");
	});

	it("re-reads two minutes before the cursor", async () => {
		const kv = new MemoryKV();
		kv.store.set("cursor_played_at", "2026-11-28T01:04:00.000Z");
		const calls = mockFetch({ spotifyToken: Response.json({ access_token: "spotify-token" }) });

		await run(await makeEnv(kv), new Date("2026-11-28T01:10:00Z"));

		const recent = calls.find((c) => c.url.includes("recently-played"));
		expect(new URL(recent?.url ?? "").searchParams.get("after")).toBe(String(Date.parse("2026-11-28T01:02:00.000Z")));
	});

	it("keeps a rotated refresh token and uses it on the next run", async () => {
		const kv = new MemoryKV();
		const calls = mockFetch({ spotifyToken: Response.json({ access_token: "t", refresh_token: "rotated" }) });

		await run(await makeEnv(kv), new Date("2026-11-28T01:10:00Z"));
		expect(JSON.parse(kv.store.get("spotify_refresh_token") ?? "{}").token).toBe("rotated");

		await run(await makeEnv(kv), new Date("2026-11-28T01:20:00Z"));
		const second = calls.filter((c) => c.url === "https://accounts.spotify.com/api/token")[1];
		expect(new URLSearchParams(String(second?.init?.body)).get("refresh_token")).toBe("rotated");
	});

	it("switches to a re-provisioned refresh token even when an older rotated one is stored", async () => {
		const kv = new MemoryKV();
		const calls = mockFetch({ spotifyToken: Response.json({ access_token: "t", refresh_token: "rotated" }) });
		await run(await makeEnv(kv), new Date("2026-11-28T01:10:00Z"));

		const env = { ...(await makeEnv(kv)), SPOTIFY_REFRESH_TOKEN: "re-authorized" };
		await run(env, new Date("2026-11-28T01:20:00Z"));
		const second = calls.filter((c) => c.url === "https://accounts.spotify.com/api/token")[1];
		expect(new URLSearchParams(String(second?.init?.body)).get("refresh_token")).toBe("re-authorized");
	});

	it("reports a revoked refresh token to Gatus and the run log", async () => {
		const kv = new MemoryKV();
		const calls = mockFetch({
			spotifyToken: Response.json({ error: "invalid_grant", error_description: "Refresh token revoked" }, { status: 400 }),
		});

		await run(await makeEnv(kv), new Date("2026-11-28T01:10:00Z"));

		const gatus = new URL(calls.find((c) => c.url.startsWith("https://status.example/"))?.url ?? "");
		expect(gatus.searchParams.get("success")).toBe("false");
		expect(gatus.searchParams.get("error")).toContain("Refresh token revoked");
		const runs = calls.find((c) => c.url.includes("/spotify_ops/tables/runs/insertAll"));
		expect(JSON.parse(String(runs?.init?.body)).rows[0].json.status).toBe("error");
		expect(calls.some((c) => c.url.includes("/spotify_raw/"))).toBe(false);
	});
});

describe("externalEndpointUrl", () => {
	it("follows Gatus's push API", () => {
		const url = new URL(
			externalEndpointUrl("https://status.chanu.co", "spotify_play-history", { success: true, durationMs: 1234 }),
		);
		expect(url.pathname).toBe("/api/v1/endpoints/spotify_play-history/external");
		expect(url.searchParams.get("success")).toBe("true");
		expect(url.searchParams.get("duration")).toBe("1234ms");
		expect(url.searchParams.has("error")).toBe(false);
	});
});
