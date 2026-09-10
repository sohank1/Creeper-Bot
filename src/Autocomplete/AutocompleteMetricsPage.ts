import { Application, NextFunction, Request, Response } from "express";
import { AutocompleteMetricsSnapshot, getAutocompleteMetricsSnapshot } from "./AutocompleteMetrics";

export function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function formatNumber(value: unknown): string {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number).toLocaleString("en-US") : "0";
}

export function formatDuration(value: unknown): string {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(1)} ms` : "0.0 ms";
}

export function formatDate(value: unknown): string {
    const date = new Date(String(value || ""));
    return Number.isFinite(date.getTime()) ? date.toLocaleString("en-US", { timeZone: "UTC" }) + " UTC" : "Never";
}

export function allowPublicMetrics(_request: Request, _response: Response, next: NextFunction): void {
    // These read-only operator views are intentionally public for now. Keep
    // this middleware in the route chain so private authentication can be
    // introduced later without touching every route registration.
    next();
}

function rowAverage(row: any, field: string): number {
    const requests = Math.max(1, Number(row?.requests) || 0);
    return (Number(row?.[field]) || 0) / requests;
}

function renderMetricsPage(snapshot: AutocompleteMetricsSnapshot): string {
    const rows = snapshot.rows.map((row: any) => {
        const requests = Number(row.requests) || 0;
        const zeroResults = Number(row.zeroResultRequests) || 0;
        const zeroRate = requests ? `${((zeroResults / requests) * 100).toFixed(1)}%` : "0.0%";
        const usernames = Array.isArray(row.usernames)
            ? row.usernames
            : Array.isArray(row.recentUsernames) ? row.recentUsernames : [];
        const allUsernames = usernames
            .map((value: unknown) => String(value || "").trim())
            .filter((value: string, index: number, values: string[]) => value && values.indexOf(value) === index);
        const lastUsername = String(row.lastUsername || allUsernames[allUsernames.length - 1] || "—");
        if (lastUsername !== "—" && !allUsernames.includes(lastUsername)) allUsernames.push(lastUsername);
        return `<tr data-search="${escapeHtml(`${row.surface} ${row.option} ${row.query} ${lastUsername} ${allUsernames.join(" ")}`.toLowerCase())}">
            <td><span class="pill">${escapeHtml(row.surface || "unknown")}</span></td>
            <td>${escapeHtml(row.option || "unknown")}</td>
            <td class="query"><code>${escapeHtml(row.query || "(empty query)")}</code></td>
            <td>${escapeHtml(lastUsername)}</td>
            <td class="wrap">${escapeHtml(allUsernames.join(", ") || "—")}</td>
            <td class="number">${formatNumber(requests)}</td>
            <td class="number">${formatNumber(zeroResults)} <small>${zeroRate}</small></td>
            <td class="number">${rowAverage(row, "resultCountTotal").toFixed(1)}</td>
            <td class="number">${formatDuration(rowAverage(row, "durationTotalMs"))}</td>
            <td>${escapeHtml(formatDate(row.lastSeenAt))}</td>
        </tr>`;
    }).join("");
    const totals = snapshot.totals;
    const status = snapshot.available
        ? `JSON metrics file is available. Showing all ${snapshot.rows.length} query keys for this namespace.`
        : `${snapshot.error || "Metrics are unavailable."} Autocomplete itself continues to work.`;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>Creeper Bot · Autocomplete Metrics</title>
<style>
:root{color-scheme:dark;--bg:#08111f;--panel:#101d30;--line:#263a55;--text:#edf5ff;--muted:#94a8c2;--blue:#69d5ff;--green:#75e0ae;--orange:#ffc46b}
*{box-sizing:border-box}body{margin:0;background:linear-gradient(145deg,#07101d,#0d1a2c 55%,#091422);color:var(--text);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:32px}main{max-width:1500px;margin:auto}header{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:24px}h1{font-size:clamp(26px,4vw,44px);line-height:1;margin:0 0 8px}h2{font-size:16px;margin:0 0 12px}p{color:var(--muted);margin:0}a{color:var(--blue)}.namespace{color:var(--blue);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.actions{display:flex;gap:12px;align-items:center}.button{display:inline-block;padding:10px 14px;border:1px solid var(--line);border-radius:9px;color:var(--text);text-decoration:none;background:var(--panel)}input{width:min(300px,50vw);padding:10px 12px;border:1px solid var(--line);border-radius:9px;background:#091525;color:var(--text)}.cards{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:12px;margin-bottom:22px}.card{background:rgba(16,29,48,.9);border:1px solid var(--line);border-radius:12px;padding:16px}.card label{display:block;color:var(--muted);font-size:12px}.card strong{display:block;color:var(--green);font-size:25px;margin-top:6px;font-variant-numeric:tabular-nums}.panel{background:rgba(16,29,48,.9);border:1px solid var(--line);border-radius:12px;padding:18px;overflow:auto}.status{margin-bottom:16px;color:var(--muted)}table{width:100%;border-collapse:collapse;min-width:1250px}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:middle}th{color:var(--muted);font-size:12px;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}.number{text-align:right;font-variant-numeric:tabular-nums}.query{max-width:420px;overflow-wrap:anywhere}.query code{color:var(--orange);font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#163651;color:var(--blue);font-size:12px}.wrap{overflow-wrap:anywhere;max-width:300px}.number small{color:var(--muted);font-size:11px}@media(max-width:800px){body{padding:18px}header{display:block}.actions{margin-top:16px}.cards{grid-template-columns:repeat(2,minmax(130px,1fr))}}
</style></head><body><main>
<header><div><h1>Autocomplete metrics</h1><p>All-time aggregated searches · namespace <span class="namespace">${escapeHtml(snapshot.namespace)}</span></p></div>
<div class="actions"><input id="filter" type="search" placeholder="Filter searches…"><a class="button" href="/metrics">Metrics home</a><a class="button" href="/metrics/autocomplete.json">JSON</a><a class="button" href="/metrics/autocomplete">Refresh</a></div></header>
<p class="status">${escapeHtml(status)} Usernames are shown to identify where activity happened. Last generated ${escapeHtml(formatDate(snapshot.generatedAt))}.</p>
<section class="cards">
<div class="card"><label>Search keys</label><strong>${formatNumber(totals.queries)}</strong></div>
<div class="card"><label>Autocomplete requests</label><strong>${formatNumber(totals.requests)}</strong></div>
<div class="card"><label>Successful responses</label><strong>${formatNumber(totals.successfulResponses)}</strong></div>
<div class="card"><label>Zero-result requests</label><strong>${formatNumber(totals.zeroResultRequests)}</strong></div>
<div class="card"><label>Average matches</label><strong>${totals.requests ? (Number(totals.resultCountTotal) / Number(totals.requests)).toFixed(1) : "0.0"}</strong></div>
</section>
<section class="panel"><h2>Most searched autocomplete queries</h2><p class="status">Each row is an aggregate query key. “Latest user” is the most recent username seen for that query, and “Users seen” is the full username history retained in the JSON file until that file is manually purged.</p><table><thead><tr><th>Surface</th><th>Option</th><th>Typed search</th><th>Latest user</th><th>Users seen</th><th class="number">Requests</th><th class="number">No results</th><th class="number">Avg matches</th><th class="number">Avg latency</th><th>Last seen</th></tr></thead><tbody id="rows">
${rows || `<tr><td colspan="10">No autocomplete metrics have been flushed yet.</td></tr>`}
</tbody></table></section></main>
<script>const filter=document.getElementById('filter');const rows=[...document.querySelectorAll('#rows tr[data-search]')];filter.addEventListener('input',()=>{const q=filter.value.toLowerCase().trim();rows.forEach(row=>row.hidden=q&&!row.dataset.search.includes(q));});</script>
</body></html>`;
}

async function readSnapshot(): Promise<AutocompleteMetricsSnapshot> {
    return getAutocompleteMetricsSnapshot().catch(() => ({
        available: false,
        namespace: "unknown",
        generatedAt: new Date().toISOString(),
        pendingKeys: 0,
        totals: { queries: 0, requests: 0, successfulResponses: 0, failedResponses: 0, zeroResultRequests: 0, resultCountTotal: 0, durationTotalMs: 0 },
        rows: [],
        error: "Metrics could not be read.",
    }));
}

export function registerAutocompleteMetricsRoutes(app: Application): void {
    app.get("/metrics/autocomplete.json", allowPublicMetrics, async (_request, response) => {
        const snapshot = await readSnapshot();
        response.set("Cache-Control", "no-store");
        response.set("X-Content-Type-Options", "nosniff");
        response.status(snapshot.available ? 200 : 503).json(snapshot);
    });
    app.get("/metrics/autocomplete", allowPublicMetrics, async (_request, response) => {
        const snapshot = await readSnapshot();
        response.set("Cache-Control", "no-store");
        response.set("X-Content-Type-Options", "nosniff");
        response.status(snapshot.available ? 200 : 503).type("html").send(renderMetricsPage(snapshot));
    });
}
