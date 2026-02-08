import { BigQuery } from "@google-cloud/bigquery";
import crypto from "crypto";

type SpotifyImage = { url: string; width?: number | null; height?: number | null };

type SpotifyItem = {
  played_at: string;
  track: {
    id: string | null;
    name: string;
    duration_ms: number;
    artists: { name: string }[];
    album: { id: string | null; name: string; images: SpotifyImage[] };
  };
  context?: { type?: string | null; uri?: string | null } | null;
};

type RecentlyPlayedResponse = {
  items: SpotifyItem[];
};

type SpotifyProfile = {
  id: string;
};

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

function pickAlbumImage(images: SpotifyImage[]): string | null {
  if (!images || images.length === 0) return null;
  const sorted = [...images].sort((a, b) => {
    const aw = a.width ?? 9999;
    const bw = b.width ?? 9999;
    return Math.abs(aw - 64) - Math.abs(bw - 64);
  });
  return sorted[0]?.url ?? null;
}

async function fetchAccessToken(): Promise<string> {
  const clientId = requireEnv("SPOTIFY_CLIENT_ID");
  const clientSecret = requireEnv("SPOTIFY_CLIENT_SECRET");
  const refreshToken = requireEnv("SPOTIFY_REFRESH_TOKEN");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to refresh token: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function fetchProfile(token: string): Promise<SpotifyProfile> {
  const res = await fetch(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch profile: ${res.status} ${text}`);
  }
  return (await res.json()) as SpotifyProfile;
}

async function fetchRecentlyPlayed(token: string, afterMs: number): Promise<RecentlyPlayedResponse> {
  const url = new URL(`${SPOTIFY_API_BASE}/me/player/recently-played`);
  url.searchParams.set("limit", "50");
  url.searchParams.set("after", String(afterMs));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch recently played: ${res.status} ${text}`);
  }
  return (await res.json()) as RecentlyPlayedResponse;
}

async function getLastPlayedAt(
  bigquery: BigQuery,
  projectId: string,
  datasetId: string,
  tableId: string
): Promise<number | null> {
  const query = `
    SELECT value
    FROM \`${projectId}.${datasetId}.${tableId}\`
    WHERE key = 'last_played_at'
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  const [rows] = await bigquery.query({ query });
  if (rows.length === 0) return null;
  const value = rows[0].value as string;
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const asNum = Number(value);
  return Number.isFinite(asNum) ? asNum : null;
}

async function upsertLastPlayedAt(
  bigquery: BigQuery,
  projectId: string,
  datasetId: string,
  tableId: string,
  valueIso: string
): Promise<void> {
  const query = `
    MERGE \`${projectId}.${datasetId}.${tableId}\` T
    USING (SELECT 'last_played_at' AS key, @value AS value, CURRENT_TIMESTAMP() AS updated_at) S
    ON T.key = S.key
    WHEN MATCHED THEN UPDATE SET value = S.value, updated_at = S.updated_at
    WHEN NOT MATCHED THEN INSERT (key, value, updated_at) VALUES (S.key, S.value, S.updated_at)
  `;

  await bigquery.query({
    query,
    params: { value: valueIso },
  });
}

export async function ingest(req: { method?: string }, res: { status: (code: number) => any; send: (body: string) => any }) {
  try {
    if (req.method && req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const projectId = requireEnv("PROJECT_ID");
    const datasetId = requireEnv("BQ_RAW_DATASET");
    const playsTableId = requireEnv("BQ_PLAYS_TABLE");
    const stateTableId = requireEnv("BQ_STATE_TABLE");

    const rollbackMs = Number(process.env.ROLLBACK_MS ?? "120000");
    const lookbackHours = Number(process.env.DEFAULT_LOOKBACK_HOURS ?? "48");

    const bigquery = new BigQuery({ projectId });

    const lastPlayedAt = await getLastPlayedAt(bigquery, projectId, datasetId, stateTableId);
    const baseMs = lastPlayedAt ?? Date.now() - lookbackHours * 60 * 60 * 1000;
    const afterMs = Math.max(0, baseMs - rollbackMs);

    const token = await fetchAccessToken();
    const profile = await fetchProfile(token);
    const data = await fetchRecentlyPlayed(token, afterMs);

    const items = data.items ?? [];
    if (items.length === 0) {
      res.status(200).send("No items");
      return;
    }

    const runId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const rows = items.map((item) => ({
      user_id: profile.id,
      played_at: item.played_at,
      track_id: item.track.id ?? "",
      track_name: item.track.name,
      artist_name: item.track.artists?.[0]?.name ?? null,
      album_id: item.track.album.id ?? null,
      album_name: item.track.album.name,
      album_image_url: pickAlbumImage(item.track.album.images),
      duration_ms: item.track.duration_ms,
      context_type: item.context?.type ?? null,
      context_uri: item.context?.uri ?? null,
      ingested_at: nowIso,
      run_id: runId,
    }));

    const table = bigquery.dataset(datasetId).table(playsTableId);
    await table.insert(rows);

    const maxPlayedAt = items
      .map((item) => Date.parse(item.played_at))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)[0];

    if (maxPlayedAt) {
      await upsertLastPlayedAt(
        bigquery,
        projectId,
        datasetId,
        stateTableId,
        new Date(maxPlayedAt).toISOString()
      );
    }

    res.status(200).send(`Inserted ${rows.length} rows`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).send(message);
  }
}
