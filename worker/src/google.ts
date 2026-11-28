type ServiceAccountKey = {
	client_email: string;
	private_key: string;
	token_uri?: string;
};

const SCOPE = "https://www.googleapis.com/auth/bigquery.insertdata";
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token";

function base64url(input: ArrayBuffer | string): string {
	const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
	let binary = "";
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
	const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
	const binary = atob(body);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes.buffer;
}

export async function fetchGoogleAccessToken(keyJson: string, now: Date = new Date()): Promise<string> {
	const key = JSON.parse(keyJson) as ServiceAccountKey;
	const tokenUri = key.token_uri ?? DEFAULT_TOKEN_URI;
	const iat = Math.floor(now.getTime() / 1000);

	const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const claims = base64url(
		JSON.stringify({ iss: key.client_email, scope: SCOPE, aud: tokenUri, iat, exp: iat + 3600 }),
	);
	const signingInput = `${header}.${claims}`;

	const cryptoKey = await crypto.subtle.importKey(
		"pkcs8",
		pemToPkcs8(key.private_key),
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput));

	const res = await fetch(tokenUri, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion: `${signingInput}.${base64url(signature)}`,
		}),
	});
	if (!res.ok) {
		throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
	}
	return ((await res.json()) as { access_token: string }).access_token;
}
