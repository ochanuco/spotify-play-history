export type AccessCredentials = { clientId: string; clientSecret: string };

export type GatusReport = { success: boolean; error?: string; durationMs: number };

export function externalEndpointUrl(baseUrl: string, key: string, report: GatusReport): string {
	const url = new URL(`/api/v1/endpoints/${encodeURIComponent(key)}/external`, baseUrl);
	url.searchParams.set("success", String(report.success));
	if (!report.success && report.error) url.searchParams.set("error", report.error.slice(0, 500));
	url.searchParams.set("duration", `${Math.max(0, Math.round(report.durationMs))}ms`);
	return url.toString();
}

export async function pushGatus(
	baseUrl: string,
	key: string,
	token: string,
	access: AccessCredentials,
	report: GatusReport,
): Promise<void> {
	const res = await fetch(externalEndpointUrl(baseUrl, key, report), {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"CF-Access-Client-Id": access.clientId,
			"CF-Access-Client-Secret": access.clientSecret,
		},
	});
	if (!res.ok) {
		throw new Error(`Gatus push failed: ${res.status} ${await res.text()}`);
	}
}
