export type RecentlyPlayedItem = {
	played_at: string;
	track: { id: string | null } & Record<string, unknown>;
	context?: unknown;
} & Record<string, unknown>;

export type TokenGrant = {
	accessToken: string;
	// Spotify may rotate the refresh token; the old one stops working once a new one is issued.
	refreshToken: string | null;
};

export async function refreshAccessToken(
	clientId: string,
	clientSecret: string,
	refreshToken: string,
): Promise<TokenGrant> {
	const res = await fetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
	});
	if (!res.ok) {
		throw new Error(`Spotify token refresh failed: ${res.status} ${await res.text()}`);
	}
	const data = (await res.json()) as { access_token: string; refresh_token?: string };
	return { accessToken: data.access_token, refreshToken: data.refresh_token ?? null };
}

export async function fetchRecentlyPlayed(accessToken: string, afterMs: number | null): Promise<RecentlyPlayedItem[]> {
	const url = new URL("https://api.spotify.com/v1/me/player/recently-played");
	url.searchParams.set("limit", "50");
	if (afterMs !== null) url.searchParams.set("after", String(afterMs));
	const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
	if (!res.ok) {
		throw new Error(`Spotify recently-played failed: ${res.status} ${await res.text()}`);
	}
	return ((await res.json()) as { items?: RecentlyPlayedItem[] }).items ?? [];
}
