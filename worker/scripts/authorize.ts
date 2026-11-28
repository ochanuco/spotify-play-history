// 使い方: SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node worker/scripts/authorize.ts
// ブラウザで認可すると、user-read-recently-played の refresh token を標準出力に出す。
// Spotify の app の Redirect URIs に http://127.0.0.1:8888/callback を登録しておく（localhost は受け付けられない）
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const REDIRECT_URI = "http://127.0.0.1:8888/callback";
const clientId = process.env.SPOTIFY_CLIENT_ID;
const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
if (!clientId || !clientSecret) {
	console.error("SPOTIFY_CLIENT_ID と SPOTIFY_CLIENT_SECRET を環境変数で渡す");
	process.exit(2);
}

const state = randomBytes(16).toString("hex");
const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
authorizeUrl.search = new URLSearchParams({
	response_type: "code",
	client_id: clientId,
	scope: "user-read-recently-played",
	redirect_uri: REDIRECT_URI,
	state,
}).toString();

const server = createServer(async (req, res) => {
	const url = new URL(req.url ?? "/", REDIRECT_URI);
	if (url.pathname !== "/callback") {
		res.writeHead(404).end();
		return;
	}
	const code = url.searchParams.get("code");
	if (url.searchParams.get("state") !== state || !code) {
		res.writeHead(400).end("state が合わないか、code がない");
		return;
	}
	const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
		method: "POST",
		headers: {
			Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI }),
	});
	const body = (await tokenRes.json()) as { refresh_token?: string };
	if (!tokenRes.ok || !body.refresh_token) {
		res.writeHead(500).end("token の取得に失敗した");
		console.error(`token の取得に失敗した: ${tokenRes.status}`);
		process.exitCode = 1;
	} else {
		res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("取得した。ターミナルに戻る");
		process.stdout.write(`${body.refresh_token}\n`);
	}
	server.close();
});

server.listen(8888, "127.0.0.1", () => {
	console.error(`ブラウザで開く: ${authorizeUrl}`);
});
