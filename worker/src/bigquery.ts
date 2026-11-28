export type InsertRow = { insertId: string; json: Record<string, unknown> };

export async function insertRows(
	accessToken: string,
	projectId: string,
	datasetId: string,
	tableId: string,
	rows: InsertRow[],
): Promise<void> {
	if (rows.length === 0) return;
	const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${datasetId}/tables/${tableId}/insertAll`;
	const res = await fetch(url, {
		method: "POST",
		headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
		body: JSON.stringify({ kind: "bigquery#tableDataInsertAllRequest", rows }),
	});
	if (!res.ok) {
		throw new Error(`BigQuery insertAll ${datasetId}.${tableId} failed: ${res.status} ${await res.text()}`);
	}
	const body = (await res.json()) as { insertErrors?: unknown[] };
	if (body.insertErrors && body.insertErrors.length > 0) {
		throw new Error(`BigQuery insertAll ${datasetId}.${tableId} rejected rows: ${JSON.stringify(body.insertErrors).slice(0, 1000)}`);
	}
}
