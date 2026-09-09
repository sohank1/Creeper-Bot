import { Application, Request, Response } from "express";
import {
    DirectorySummary,
    FileCacheSnapshot,
    FileStoreSummary,
    JsonlSnapshot,
    MissingTelemetryEvent,
    SpriteArchiveSummary,
    SpriteCacheSnapshot,
    SpriteFingerprintCacheSummary,
    SpriteTelemetryEvent,
    getFileCacheSnapshot
} from "./FileCacheMetrics";
import { allowPublicMetrics, escapeHtml, formatDate, formatDuration, formatNumber } from "./AutocompleteMetricsPage";

type MetricsPage = "overview" | "files" | "sprites" | "maps" | "missing";

function formatBytes(value: unknown): string {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

function statusLabel(status: string): string {
    if (status === "present") return "Present";
    if (status === "missing") return "Not created yet";
    return "Read error";
}

function statusPill(status: string): string {
    const className = status === "present" ? "ok" : status === "missing" ? "missing" : "bad";
    return `<span class="status-pill ${className}">${escapeHtml(statusLabel(status))}</span>`;
}

function pageNav(active: MetricsPage): string {
    const links: Array<[MetricsPage, string, string]> = [
        ["overview", "Overview", "/metrics"],
        ["files", "File stores", "/metrics/files"],
        ["sprites", "Sprites", "/metrics/sprites"],
        ["maps", "Maps", "/metrics/maps"],
        ["missing", "Missing cosmetics", "/metrics/missing-cosmetics"],
    ];
    return `<nav>${links.map(([key, label, href]) => `<a class="${key === active ? "active" : ""}" href="${href}">${label}</a>`).join("")}<a href="/metrics/autocomplete">Autocomplete</a></nav>`;
}

function shell(title: string, active: MetricsPage, content: string, generatedAt?: string): string {
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60"><title>Creeper Bot · ${escapeHtml(title)}</title>
<style>
:root{color-scheme:dark;--bg:#07101c;--panel:#101d30;--panel2:#0c1727;--line:#263a55;--text:#edf5ff;--muted:#94a8c2;--blue:#69d5ff;--green:#75e0ae;--orange:#ffc46b;--red:#ff8f8f;--purple:#c9a5ff}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#132b46 0,#07101c 42%,#050b14 100%);color:var(--text);font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:28px}main{max-width:1600px;margin:auto}header{display:flex;justify-content:space-between;gap:24px;align-items:end;margin-bottom:16px}h1{font-size:clamp(25px,4vw,42px);line-height:1.05;margin:0 0 7px}h2{font-size:17px;margin:0 0 13px}h3{font-size:14px;margin:0 0 9px}p{color:var(--muted);margin:0 0 10px}a{color:var(--blue)}nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 23px;padding:8px;background:rgba(8,18,32,.75);border:1px solid var(--line);border-radius:11px}nav a{padding:8px 11px;border-radius:8px;text-decoration:none;color:var(--muted)}nav a:hover,nav a.active{background:#173754;color:var(--text)}.actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap}.button{display:inline-block;padding:9px 12px;border:1px solid var(--line);border-radius:8px;color:var(--text);text-decoration:none;background:var(--panel)}.namespace,code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.namespace{color:var(--blue)}.status-line{color:var(--muted);margin:0 0 18px}.cards{display:grid;grid-template-columns:repeat(6,minmax(135px,1fr));gap:11px;margin:0 0 20px}.card{background:rgba(16,29,48,.91);border:1px solid var(--line);border-radius:11px;padding:14px;min-width:0}.card label{display:block;color:var(--muted);font-size:12px}.card strong{display:block;color:var(--green);font-size:23px;margin-top:5px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.card small{display:block;color:var(--muted);margin-top:5px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}.panel{background:rgba(16,29,48,.91);border:1px solid var(--line);border-radius:11px;padding:17px;overflow:auto;margin-bottom:16px}.panel p:last-child{margin-bottom:0}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:780px}th,td{text-align:left;padding:10px 9px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-size:11px;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap}td{color:var(--text)}td.number,th.number{text-align:right;font-variant-numeric:tabular-nums}.muted{color:var(--muted)}.tiny{font-size:12px}.wrap{overflow-wrap:anywhere;max-width:440px}.status-pill{display:inline-block;padding:3px 7px;border-radius:999px;font-size:11px;white-space:nowrap}.status-pill.ok{background:#123b35;color:var(--green)}.status-pill.missing{background:#3d321d;color:var(--orange)}.status-pill.bad{background:#452529;color:var(--red)}.tag{display:inline-block;color:var(--blue);background:#163651;border-radius:999px;padding:3px 7px;font-size:11px}.metric-list{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.metric-list span{background:var(--panel2);border:1px solid var(--line);border-radius:7px;padding:7px 9px;color:var(--muted)}.metric-list b{color:var(--text);font-variant-numeric:tabular-nums}.file-details{color:var(--muted);font-size:12px;line-height:1.45}.event-details{display:flex;flex-wrap:wrap;gap:5px}.event-details span{padding:3px 6px;background:var(--panel2);border:1px solid var(--line);border-radius:5px;color:var(--muted);font-size:11px}.event-details b{color:var(--text);font-weight:500}.notice{padding:11px 13px;border-left:3px solid var(--blue);background:#0d2235;color:var(--muted);border-radius:5px;margin-bottom:16px}.notice.warn{border-left-color:var(--orange);background:#2b2415}.empty{color:var(--muted);padding:15px 5px}.route-card{display:block;text-decoration:none;color:var(--text);height:100%}.route-card:hover .card{border-color:var(--blue)}.route-card .card strong{color:var(--blue)}@media(max-width:1100px){.cards{grid-template-columns:repeat(3,minmax(135px,1fr))}}@media(max-width:760px){body{padding:16px}header{display:block}.actions{margin-top:14px}.grid{grid-template-columns:1fr}.cards{grid-template-columns:repeat(2,minmax(130px,1fr))}.panel{padding:13px}}
</style></head><body><main>${pageNav(active)}${content}<p class="tiny muted">Generated ${escapeHtml(formatDate(generatedAt || new Date().toISOString()))}. Pages refresh every 60 seconds.</p></main></body></html>`;
}

function header(title: string, description: string, jsonPath: string): string {
    return `<header><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><div class="actions"><a class="button" href="${jsonPath}">JSON</a><a class="button" href="${jsonPath.replace(/\.json$/, "")}">Refresh</a></div></header>`;
}

function directoryText(directory: DirectorySummary): string {
    if (directory.status !== "present") return directory.error || statusLabel(directory.status);
    return `${formatNumber(directory.files)} files · ${formatNumber(directory.directories)} folders · ${formatBytes(directory.bytes)}${directory.truncated ? " · scan capped" : ""}`;
}

function directoryRow(label: string, directory: DirectorySummary): string {
    return `<tr><td>${escapeHtml(label)}</td><td>${statusPill(directory.status)}</td><td class="wrap"><code>${escapeHtml(directory.path)}</code></td><td class="number">${formatNumber(directory.files)}</td><td class="number">${formatBytes(directory.bytes)}</td><td>${escapeHtml(formatDate(directory.modifiedAt))}</td><td class="muted tiny">${escapeHtml(directory.error || (directory.truncated ? "Scan capped at 30,000 files." : ""))}</td></tr>`;
}

function fileDetails(details: Record<string, unknown>): string {
    const entries = Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== "");
    if (!entries.length) return "—";
    return entries.slice(0, 10).map(([key, value]) => {
        let rendered: string;
        if (typeof value === "number") rendered = key.toLowerCase().includes("bytes") ? formatBytes(value) : formatNumber(value);
        else if (typeof value === "boolean") rendered = value ? "yes" : "no";
        else if (typeof value === "object") rendered = JSON.stringify(value);
        else rendered = String(value);
        return `<span>${escapeHtml(key)}: ${escapeHtml(rendered)}</span>`;
    }).join(" · ");
}

function fileRows(files: FileStoreSummary[]): string {
    if (!files.length) return `<tr><td colspan="7" class="empty">No stores were discovered.</td></tr>`;
    return files.map(file => `<tr>
        <td>${escapeHtml(file.label)}</td><td>${statusPill(file.status)}</td>
        <td class="wrap"><code>${escapeHtml(file.path)}</code>${file.error ? `<div class="muted tiny">${escapeHtml(file.error)}</div>` : ""}</td>
        <td class="number">${formatBytes(file.sizeBytes)}</td><td>${escapeHtml(formatDate(file.modifiedAt))}</td>
        <td class="file-details">${fileDetails(file.details)}</td><td>${escapeHtml(file.id)}</td>
    </tr>`).join("");
}

function cacheRows(rows: SpriteFingerprintCacheSummary[], kind: "assets" | "renders"): string {
    if (!rows.length) return `<tr><td colspan="8" class="empty">No ${kind} cache directories have been created for this namespace.</td></tr>`;
    return rows.map(row => `<tr>
        <td><code>${escapeHtml(row.fingerprint)}</code></td><td>${statusPill(row.status)}</td><td>${statusPill(row.manifestStatus)}${row.error ? `<div class="muted tiny">${escapeHtml(row.error)}</div>` : ""}</td>
        <td class="number">${row.entries == null ? "—" : formatNumber(row.entries)}</td><td class="number">${formatNumber(row.diskFiles)}</td><td class="number">${formatBytes(row.diskBytes)}</td><td>${escapeHtml(formatDate(row.modifiedAt))}</td><td class="wrap"><code>${escapeHtml(row.path)}</code></td>
    </tr>`).join("");
}

function archiveRows(roots: SpriteCacheSnapshot["archiveRoots"]): string {
    const rows: Array<{ root: string; archive: SpriteArchiveSummary }> = [];
    for (const root of roots) for (const archive of root.archives) rows.push({ root: root.label, archive });
    rows.sort((a, b) => new Date(b.archive.archivedAt || b.archive.modifiedAt || 0).getTime() - new Date(a.archive.archivedAt || a.archive.modifiedAt || 0).getTime());
    if (!rows.length) return `<tr><td colspan="11" class="empty">No season archive folders were found.</td></tr>`;
    return rows.map(({ root, archive }) => `<tr>
        <td>${escapeHtml(root)}</td><td>${escapeHtml(archive.season || archive.name)}</td><td><code>${escapeHtml(archive.name)}</code></td><td>${statusPill(archive.manifestStatus)}${archive.error ? `<div class="muted tiny">${escapeHtml(archive.error)}</div>` : ""}</td>
        <td class="number">${archive.spriteCount == null ? "—" : formatNumber(archive.spriteCount)}</td><td class="number">${archive.assetCount == null ? "—" : formatNumber(archive.assetCount)}</td><td class="number">${archive.missingAssetCount == null ? "—" : formatNumber(archive.missingAssetCount)}</td><td class="number">${archive.totalAssetBytes == null ? "—" : formatBytes(archive.totalAssetBytes)}</td><td>${escapeHtml(formatDate(archive.archivedAt))}</td><td>${escapeHtml(formatDate(archive.modifiedAt))}</td><td class="wrap"><code>${escapeHtml(archive.path)}</code></td>
    </tr>`).join("");
}

function eventDetailValue(key: string, value: unknown): string {
    if (typeof value === "number") {
        if (key.toLowerCase().includes("duration") || key.toLowerCase().endsWith("ms")) return formatDuration(value);
        if (key.toLowerCase().includes("bytes")) return formatBytes(value);
        if (key.toLowerCase().includes("rate") || key.toLowerCase().includes("persecond")) return value.toFixed(2);
        return formatNumber(value);
    }
    if (typeof value === "boolean") return value ? "yes" : "no";
    return String(value);
}

function eventDetails(event: Record<string, unknown>): string {
    const entries = Object.entries(event).filter(([key, value]) => key !== "timestamp" && key !== "type" && value !== null && value !== undefined);
    if (!entries.length) return "—";
    const usernameKeys = new Set(["username", "initiatedByUsername", "interactedByUsername"]);
    const prioritized = entries.filter(([key]) => usernameKeys.has(key));
    const otherEntries = entries.filter(([key]) => !usernameKeys.has(key));
    return `<div class="event-details">${[...prioritized, ...otherEntries].slice(0, 12).map(([key, value]) => `<span><b>${escapeHtml(key)}</b>: ${escapeHtml(eventDetailValue(key, value))}</span>`).join("")}</div>`;
}

function eventRows<T extends Record<string, unknown>>(events: T[]): string {
    if (!events.length) return `<tr><td colspan="4" class="empty">No telemetry records have been written yet.</td></tr>`;
    return events.map(event => `<tr><td><span class="tag">${escapeHtml(event.type || "record")}</span></td><td>${escapeHtml(event.outcome || event.phase || "—")}</td><td>${escapeHtml(formatDate(event.timestamp))}</td><td>${eventDetails(event)}</td></tr>`).join("");
}

function jsonlSummary<T>(snapshot: JsonlSnapshot<T>, title: string): string {
    const types = Object.entries(snapshot.byType).sort((a, b) => b[1] - a[1]).slice(0, 12);
    const outcomes = Object.entries(snapshot.byOutcome).sort((a, b) => b[1] - a[1]).slice(0, 12);
    return `<div class="metric-list"><span>Files <b>${formatNumber(snapshot.totalFiles)}</b></span><span>Valid records <b>${formatNumber(snapshot.totalEvents)}</b></span><span>Invalid lines <b>${formatNumber(snapshot.invalidLines)}</b></span><span>Disk size <b>${formatBytes(snapshot.totalBytes)}</b></span><span>Oldest <b>${escapeHtml(formatDate(snapshot.oldestAt))}</b></span><span>Newest <b>${escapeHtml(formatDate(snapshot.newestAt))}</b></span></div>
    <div class="grid" style="margin-top:14px"><div><h3>${escapeHtml(title)} by type</h3>${types.length ? `<div class="metric-list">${types.map(([key, count]) => `<span>${escapeHtml(key)} <b>${formatNumber(count)}</b></span>`).join("")}</div>` : `<p class="empty">No records yet.</p>`}</div><div><h3>Outcomes / phases</h3>${outcomes.length ? `<div class="metric-list">${outcomes.map(([key, count]) => `<span>${escapeHtml(key)} <b>${formatNumber(count)}</b></span>`).join("")}</div>` : `<p class="empty">No outcomes recorded yet.</p>`}</div></div>`;
}

function telemetryCount(snapshot: JsonlSnapshot<unknown>, type: string, outcome: string): number {
    return snapshot.byTypeOutcome[type]?.[outcome] || 0;
}

function telemetryTotal(snapshot: JsonlSnapshot<unknown>, type: string, field: string): number {
    return snapshot.byTypeNumericTotals[type]?.[field] || 0;
}

function telemetryMetric(label: string, value: unknown): string {
    return `<span>${escapeHtml(label)} <b>${typeof value === "number" ? formatNumber(value) : escapeHtml(String(value))}</b></span>`;
}

function renderSpritePerformanceSummary(telemetry: SpriteCacheSnapshot["telemetry"]): string {
    const renderOutcomes = ["memory-hit", "disk-hit", "pending-hit", "cold-render", "failure"];
    const assetOutcomes = ["memory-hit", "disk-hit", "network", "local", "miss", "failure"];
    return `<div class="grid" style="margin-top:14px">
        <div><h3>Rendered image outcomes</h3><div class="metric-list">${renderOutcomes.map(outcome => telemetryMetric(outcome, telemetryCount(telemetry, "render", outcome))).join("")}</div></div>
        <div><h3>Sprite asset outcomes</h3><div class="metric-list">${assetOutcomes.map(outcome => telemetryMetric(outcome, telemetryCount(telemetry, "asset", outcome))).join("")}</div></div>
    </div>
    <div class="metric-list">
        ${telemetryMetric("Render duration", formatDuration(telemetryTotal(telemetry, "render", "durationMs")))}
        ${telemetryMetric("Page queue wait", formatDuration(telemetryTotal(telemetry, "render", "pageQueueWaitMs")))}
        ${telemetryMetric("Rendered pixels", formatNumber(telemetryTotal(telemetry, "render", "renderedPixels")))}
        ${telemetryMetric("Asset checks", telemetryTotal(telemetry, "asset-sync", "checked"))}
        ${telemetryMetric("Asset sync failures", telemetryTotal(telemetry, "asset-sync", "failed"))}
        ${telemetryMetric("Detail pages", telemetryTotal(telemetry, "catalog-sync", "detailPagesDiscovered"))}
        ${telemetryMetric("Partial details", telemetryTotal(telemetry, "catalog-sync", "detailPagesPartial"))}
        ${telemetryMetric("Generated screens", telemetryTotal(telemetry, "render-generation", "completed"))}
        ${telemetryMetric("Failed screens", telemetryTotal(telemetry, "render-generation", "failed"))}
    </div>`;
}

function telemetryFilesRows(snapshot: JsonlSnapshot<unknown>): string {
    if (!snapshot.files.length) return `<tr><td colspan="7" class="empty">No JSONL files were found.</td></tr>`;
    return snapshot.files.map(file => `<tr><td><code>${escapeHtml(file.name)}</code></td><td class="number">${formatNumber(file.events)}</td><td class="number">${formatNumber(file.invalidLines)}</td><td class="number">${formatBytes(file.sizeBytes)}</td><td>${escapeHtml(formatDate(file.modifiedAt))}</td><td>${file.truncated ? statusPill("error") : statusPill("present")}</td><td><code>${escapeHtml(file.path)}</code></td></tr>`).join("");
}

function renderOverview(snapshot: FileCacheSnapshot): string {
    const s = snapshot.sprite;
    const m = snapshot.maps;
    const missing = snapshot.missingCosmetics;
    const autocomplete = snapshot.autocomplete;
    return shell("Metrics overview", "overview", `${header("File-backed metrics", `Read-only cache and telemetry overview · namespace ${snapshot.namespace}`, "/metrics/files.json")}
    <p class="status-line">This dashboard reads the application’s known files on this machine. It does not change, delete, or rebuild any cache. Missing local stores are shown as “not created yet,” which is normal for a fresh Windows development checkout.</p>
    <section class="cards">
        <div class="card"><label>Cache directory</label><strong>${formatBytes(snapshot.cacheRoot.bytes)}</strong><small>${formatNumber(snapshot.cacheRoot.files)} files</small></div>
        <div class="card"><label>Sprite cache</label><strong>${formatBytes(s.root.bytes)}</strong><small>${formatNumber(s.root.files)} files</small></div>
        <div class="card"><label>Sprite telemetry</label><strong>${formatNumber(s.telemetry.totalEvents)}</strong><small>${formatNumber(s.telemetry.totalFiles)} JSONL files</small></div>
        <div class="card"><label>Map image assets</label><strong>${formatBytes(m.assets.bytes)}</strong><small>${formatNumber(m.assets.files)} files</small></div>
        <div class="card"><label>Missing reports</label><strong>${formatNumber(missing.totalEvents)}</strong><small>${formatNumber(missing.failedReports)} failures</small></div>
        <div class="card"><label>Autocomplete searches</label><strong>${formatNumber(autocomplete.details.requests)}</strong><small>${formatBytes(autocomplete.sizeBytes)} · ${statusLabel(autocomplete.status)}</small></div>
        <div class="card"><label>Runtime</label><strong>${escapeHtml(snapshot.environment.platform)}</strong><small>${escapeHtml(snapshot.environment.nodeEnv)} · ${snapshot.environment.productionRenderCacheEnabled ? "disk cache on" : "disk cache off"}</small></div>
    </section>
    <div class="grid">
        <a class="route-card" href="/metrics/files"><section class="card"><h2>File stores</h2><p>Every known JSON file, telemetry directory, archive root, asset cache, render cache, map asset folder, and persistent branding asset.</p><strong>Open inventory →</strong></section></a>
        <a class="route-card" href="/metrics/sprites"><section class="card"><h2>Sprite cache</h2><p>Current catalogs, history files, season archives, binary assets, rendered PNGs, and the full JSONL sprite performance feed.</p><strong>Open sprite view →</strong></section></a>
        <a class="route-card" href="/metrics/maps"><section class="card"><h2>Map cache</h2><p>Map catalog/history JSON, map image manifest, and the local map image asset directory.</p><strong>Open map view →</strong></section></a>
        <a class="route-card" href="/metrics/missing-cosmetics"><section class="card"><h2>Missing cosmetics</h2><p>Daily timing files with request totals, report outcomes, cache usage, and recent safe timing records.</p><strong>Open timing view →</strong></section></a>
        <a class="route-card" href="/metrics/autocomplete"><section class="card"><h2>Autocomplete</h2><p>File-backed cosmetic, sprite, and map searches, including the full username history retained in the JSON file.</p><strong>Open search view →</strong></section></a>
    </div>
    <section class="panel"><h2>What is not in these file views</h2><p>In-memory Discord caches, live Chromium pages, current job counters, and the live <code>c!cpu</code> process snapshot are not persisted files. They reset with a process and remain available through <code>c!cpu</code>; this dashboard focuses on data that can survive a restart or build when its underlying volume/repository/database is preserved.</p></section>`, snapshot.generatedAt);
}

function renderFiles(snapshot: FileCacheSnapshot): string {
    const files = [snapshot.autocomplete, ...snapshot.sprite.dataFiles, ...snapshot.sprite.historyFiles, ...snapshot.maps.files, ...snapshot.persistentAssets];
    const directories: Array<[string, DirectorySummary]> = [
        ["Project .cache", snapshot.cacheRoot],
        ["Sprite namespace root", snapshot.sprite.root],
        ...snapshot.sprite.archiveRoots.map(root => [root.label, root.directory] as [string, DirectorySummary]),
        ["Sprite asset cache", snapshot.sprite.assetCache.directory],
        ["Sprite render cache", snapshot.sprite.renderCache.directory],
        ["Sprite telemetry", snapshot.sprite.telemetry.directory],
        ["Map image assets", snapshot.maps.assets],
        ["Missing-cosmetics telemetry", snapshot.missingCosmetics.directory],
    ];
    for (const child of snapshot.cacheChildren) directories.push([`Cache child: ${child.name}`, child]);
    return shell("File stores", "files", `${header("File store inventory", `Known persistent files and directories · namespace ${snapshot.namespace}`, "/metrics/files.json")}
    <div class="notice">Only fixed application paths are read. Binary assets are counted by size and file count; Discord usernames are shown for attribution, while user IDs, message IDs, cache hashes, and raw JSONL records are not sent to the browser.</div>
    <section class="panel"><h2>JSON and persistent file stores</h2><div class="table-wrap"><table><thead><tr><th>Store</th><th>Status</th><th>Path</th><th class="number">Size</th><th>Updated</th><th>Decoded summary</th><th>ID</th></tr></thead><tbody>${fileRows(files)}</tbody></table></div></section>
    <section class="panel"><h2>Directories and binary cache totals</h2><div class="table-wrap"><table><thead><tr><th>Directory</th><th>Status</th><th>Path</th><th class="number">Files</th><th class="number">Bytes</th><th>Newest change</th><th>Notes</th></tr></thead><tbody>${directories.map(([label, directory]) => directoryRow(label, directory)).join("")}</tbody></table></div></section>
    <section class="panel"><h2>Persistence interpretation</h2><p>The <code>.cache</code> and configured <code>.telemetry</code> rows are ignored by normal builds but survive only when the host volume or deployment disk survives. The autocomplete metrics source of truth is the durable JSON file shown above, normally <code>.telemetry/autocomplete/&lt;namespace&gt;.json</code>; it is not stored in MongoDB and is not included in the build image. Its username history has no automatic 20-user limit and remains until that file is manually purged. The checked-in <code>src/Fortnite/...</code> JSON rows are part of the repository. Sprite archive backup rows and any B2 copy are separate from this local scan; their configured status is visible in the sprite view, but remote B2 objects cannot be enumerated without making an external API request.</p></section>`, snapshot.generatedAt);
}

function renderSprites(snapshot: FileCacheSnapshot): string {
    const sprite = snapshot.sprite;
    const telemetry = sprite.telemetry;
    const renderAverage = telemetry.numericCounts.durationMs ? telemetry.numericTotals.durationMs / telemetry.numericCounts.durationMs : 0;
    return shell("Sprite cache", "sprites", `${header("Sprite cache and telemetry", `Catalog, history, archives, binary caches, and JSONL performance data · namespace ${snapshot.namespace}`, "/metrics/sprites.json")}
    <section class="cards">
        <div class="card"><label>Render events</label><strong>${formatNumber(telemetry.renderEvents)}</strong><small>${formatNumber(telemetry.renderFailures)} failures</small></div>
        <div class="card"><label>Asset events</label><strong>${formatNumber(telemetry.assetEvents)}</strong><small>${formatNumber(telemetry.assetFailures)} loads · ${formatNumber(telemetry.assetSyncFailures)} sync failures</small></div>
        <div class="card"><label>Catalog syncs</label><strong>${formatNumber(telemetry.catalogSyncEvents)}</strong><small>${formatNumber(telemetry.catalogSyncFailures)} failures</small></div>
        <div class="card"><label>Catalog changes</label><strong>${formatNumber(telemetry.changedCatalogEvents)}</strong><small>historical JSONL count</small></div>
        <div class="card"><label>Render generation</label><strong>${formatNumber(telemetry.renderGenerationEvents)}</strong><small>progress records</small></div>
        <div class="card"><label>Avg event duration</label><strong>${formatDuration(renderAverage)}</strong><small>${formatNumber(telemetry.totalEvents)} safe records</small></div>
    </section>
    <section class="panel"><h2>Sprite telemetry feed</h2><p>${escapeHtml(directoryText(telemetry.directory))}. ${telemetry.skippedFiles ? `${formatNumber(telemetry.skippedFiles)} older files were skipped after the safety limit.` : "All discovered JSONL files were included."}</p>${jsonlSummary(telemetry, "Event types")}${renderSpritePerformanceSummary(telemetry)}<div class="table-wrap"><table><thead><tr><th>File</th><th class="number">Records</th><th class="number">Invalid</th><th class="number">Size</th><th>Updated</th><th>Read</th><th>Path</th></tr></thead><tbody>${telemetryFilesRows(telemetry)}</tbody></table></div></section>
    <section class="panel"><h2>Catalog and history files</h2><div class="table-wrap"><table><thead><tr><th>Store</th><th>Status</th><th>Path</th><th class="number">Size</th><th>Updated</th><th>Decoded summary</th><th>ID</th></tr></thead><tbody>${fileRows([...sprite.dataFiles, ...sprite.historyFiles])}</tbody></table></div></section>
    <section class="panel"><h2>Season archives</h2><p>Each row is one immutable archive folder discovered under the active namespace, checked-in archive folder, or configured filesystem backup.</p><div class="table-wrap"><table><thead><tr><th>Root</th><th>Season</th><th>Folder</th><th>Manifest</th><th class="number">Sprites</th><th class="number">Assets</th><th class="number">Missing</th><th class="number">Asset bytes</th><th>Archived</th><th>Folder changed</th><th>Path</th></tr></thead><tbody>${archiveRows(sprite.archiveRoots)}</tbody></table></div></section>
    <div class="grid"><section class="panel"><h2>Asset cache by catalog fingerprint</h2><p>${escapeHtml(directoryText(sprite.assetCache.directory))}</p><div class="table-wrap"><table><thead><tr><th>Fingerprint</th><th>Status</th><th>Manifest</th><th class="number">Manifest assets</th><th class="number">Disk files</th><th class="number">Disk bytes</th><th>Updated</th><th>Path</th></tr></thead><tbody>${cacheRows(sprite.assetCache.fingerprints, "assets")}</tbody></table></div></section><section class="panel"><h2>Rendered PNG cache</h2><p>${escapeHtml(directoryText(sprite.renderCache.directory))}</p><div class="table-wrap"><table><thead><tr><th>UI/data fingerprint</th><th>Status</th><th>Manifest</th><th class="number">Tasks</th><th class="number">Disk files</th><th class="number">Disk bytes</th><th>Updated</th><th>Path</th></tr></thead><tbody>${cacheRows(sprite.renderCache.fingerprints, "renders")}</tbody></table></div></section></div>
    <section class="panel"><h2>Recent sprite telemetry</h2><p>Safe operational fields plus Discord usernames are shown so the operator can identify where an event happened. Discord IDs, request IDs, cache-key hashes, and data hashes remain omitted.</p><div class="table-wrap"><table><thead><tr><th>Type</th><th>Outcome / phase</th><th>When</th><th>Operational details</th></tr></thead><tbody>${eventRows<SpriteTelemetryEvent>(telemetry.recent)}</tbody></table></div></section>`, snapshot.generatedAt);
}

function renderMaps(snapshot: FileCacheSnapshot): string {
    const files = snapshot.maps.files;
    const data = files.find(file => file.id === "map-data")?.details || {};
    const history = files.find(file => file.id === "map-history")?.details || {};
    const imageManifest = files.find(file => file.id === "map-image-manifest")?.details || {};
    return shell("Map cache", "maps", `${header("Map cache", "Map catalogs, historical versions, image manifest, and local map image files", "/metrics/maps.json")}
    <section class="cards">
        <div class="card"><label>Catalog versions</label><strong>${formatNumber(data.records)}</strong><small>latest ${escapeHtml(String(data.latestVersion || "unknown"))}</small></div>
        <div class="card"><label>History versions</label><strong>${formatNumber(history.records)}</strong><small>${formatNumber(history.versionsWithImages)} with images</small></div>
        <div class="card"><label>Image manifest</label><strong>${formatNumber(imageManifest.versions)}</strong><small>${formatNumber(imageManifest.uploaded)} uploaded</small></div>
        <div class="card"><label>Local map images</label><strong>${formatNumber(snapshot.maps.assets.files)}</strong><small>${formatBytes(snapshot.maps.assets.bytes)}</small></div>
        <div class="card"><label>Chapters</label><strong>${formatNumber(data.chapters)}</strong><small>catalog distinct chapters</small></div>
        <div class="card"><label>POI versions</label><strong>${formatNumber(data.versionsWithPois)}</strong><small>catalog entries with POIs</small></div>
    </section>
    <section class="panel"><h2>Map JSON stores</h2><div class="table-wrap"><table><thead><tr><th>Store</th><th>Status</th><th>Path</th><th class="number">Size</th><th>Updated</th><th>Decoded summary</th><th>ID</th></tr></thead><tbody>${fileRows(files)}</tbody></table></div></section>
    <section class="panel"><h2>Local map image directory</h2><p>${escapeHtml(directoryText(snapshot.maps.assets))}</p><div class="table-wrap"><table><thead><tr><th>Directory</th><th>Status</th><th>Path</th><th class="number">Files</th><th class="number">Bytes</th><th>Newest change</th><th>Notes</th></tr></thead><tbody>${directoryRow("Map image assets", snapshot.maps.assets)}</tbody></table></div></section>
    <section class="panel"><h2>How map persistence works</h2><p><code>mapData.json</code> is the catalog used by the command, <code>mapHistory.json</code> is the historical fallback used by asset fetches, and <code>mapImageManifest.json</code> records local/Discord-hosted image metadata. The image directory is scanned by metadata only; the page never serves those files.</p></section>`, snapshot.generatedAt);
}

function renderMissing(snapshot: FileCacheSnapshot): string {
    const telemetry = snapshot.missingCosmetics;
    const averageTotal = telemetry.numericCounts.totalMs ? telemetry.numericTotals.totalMs / telemetry.numericCounts.totalMs : 0;
    const averageHistory = telemetry.numericCounts.historyMs ? telemetry.numericTotals.historyMs / telemetry.numericCounts.historyMs : 0;
    const averageIndex = telemetry.numericCounts.indexMs ? telemetry.numericTotals.indexMs / telemetry.numericCounts.indexMs : 0;
    const averageCalculation = telemetry.numericCounts.calculationMs ? telemetry.numericTotals.calculationMs / telemetry.numericCounts.calculationMs : 0;
    const averageRender = telemetry.numericCounts.renderMs ? telemetry.numericTotals.renderMs / telemetry.numericCounts.renderMs : 0;
    return shell("Missing cosmetics telemetry", "missing", `${header("Missing-cosmetics telemetry", "Persistent daily timing files for missing-cosmetics reports", "/metrics/missing-cosmetics.json")}
    <section class="cards">
        <div class="card"><label>Total reports</label><strong>${formatNumber(telemetry.totalEvents)}</strong><small>${formatNumber(telemetry.successfulReports)} successful</small></div>
        <div class="card"><label>Failures</label><strong>${formatNumber(telemetry.failedReports)}</strong><small>${formatNumber(telemetry.fallbackReports)} image fallbacks</small></div>
        <div class="card"><label>Cached history loads</label><strong>${formatNumber(telemetry.cachedReports)}</strong><small>internal timing flag</small></div>
        <div class="card"><label>Avg total time</label><strong>${formatDuration(averageTotal)}</strong><small>all recorded reports</small></div>
        <div class="card"><label>Avg index + query</label><strong>${formatDuration(averageIndex + averageCalculation)}</strong><small>index ${formatDuration(averageIndex)}</small></div>
        <div class="card"><label>Avg render</label><strong>${formatDuration(averageRender)}</strong><small>${formatBytes(telemetry.numericTotals.imageBytes)} image bytes total</small></div>
    </section>
    <section class="panel"><h2>Daily timing files</h2><p>${escapeHtml(directoryText(telemetry.directory))}. Files are append-only JSONL diagnostics and are not removed by application builds.</p>${jsonlSummary(telemetry, "Report records")}<div class="table-wrap"><table><thead><tr><th>File</th><th class="number">Reports</th><th class="number">Invalid</th><th class="number">Size</th><th>Updated</th><th>Read</th><th>Path</th></tr></thead><tbody>${telemetryFilesRows(telemetry)}</tbody></table></div></section>
    <section class="panel"><h2>Recent report timings</h2><p>These rows contain timings, counts, and the Discord username that triggered the report. The user-facing “cached” wording was removed; the flag remains here as an internal performance metric.</p><div class="table-wrap"><table><thead><tr><th>Type</th><th>Outcome</th><th>When</th><th>Timing details</th></tr></thead><tbody>${eventRows<MissingTelemetryEvent>(telemetry.recent)}</tbody></table></div></section>
    <section class="panel"><h2>Average timing components</h2><div class="metric-list"><span>History <b>${formatDuration(averageHistory)}</b></span><span>Index <b>${formatDuration(averageIndex)}</b></span><span>Calculation <b>${formatDuration(averageCalculation)}</b></span><span>Render <b>${formatDuration(averageRender)}</b></span><span>Delivery <b>${formatDuration(telemetry.numericCounts.deliveryMs ? telemetry.numericTotals.deliveryMs / telemetry.numericCounts.deliveryMs : 0)}</b></span><span>Cleanup <b>${formatDuration(telemetry.numericCounts.cleanupMs ? telemetry.numericTotals.cleanupMs / telemetry.numericCounts.cleanupMs : 0)}</b></span></div></section>`, snapshot.generatedAt);
}

function unavailablePage(error: string): string {
    return shell("Metrics unavailable", "overview", `${header("Metrics unavailable", "The file reader could not produce a snapshot", "/metrics/files.json")}<section class="panel"><div class="notice warn">${escapeHtml(error)}</div><p>The bot itself is not changed by this read failure. Check filesystem permissions and the configured cache paths, then refresh.</p></section>`);
}

async function loadSnapshot(response: Response): Promise<FileCacheSnapshot | null> {
    try {
        return await getFileCacheSnapshot();
    } catch (error: any) {
        response.locals.fileMetricsError = error?.message || String(error);
        return null;
    }
}

function sendHtml(response: Response, html: string, status = 200): void {
    response.set("Cache-Control", "no-store");
    response.set("X-Content-Type-Options", "nosniff");
    response.status(status).type("html").send(html);
}

function sendJson(response: Response, value: unknown, status = 200): void {
    response.set("Cache-Control", "no-store");
    response.set("X-Content-Type-Options", "nosniff");
    response.status(status).json(value);
}

export function registerFileCacheMetricsRoutes(app: Application): void {
    app.get("/metrics", allowPublicMetrics, async (_request: Request, response: Response) => {
        const snapshot = await loadSnapshot(response);
        if (!snapshot) return sendHtml(response, unavailablePage(response.locals.fileMetricsError || "File metrics are unavailable."), 503);
        return sendHtml(response, renderOverview(snapshot));
    });

    const serveFiles = async (_request: Request, response: Response) => {
        const snapshot = await loadSnapshot(response);
        if (!snapshot) return sendHtml(response, unavailablePage(response.locals.fileMetricsError || "File metrics are unavailable."), 503);
        return sendHtml(response, renderFiles(snapshot));
    };
    app.get("/metrics/files", allowPublicMetrics, serveFiles);
    app.get("/metrics/cache", allowPublicMetrics, serveFiles);

    const serveSprites = async (_request: Request, response: Response) => {
        const snapshot = await loadSnapshot(response);
        if (!snapshot) return sendHtml(response, unavailablePage(response.locals.fileMetricsError || "File metrics are unavailable."), 503);
        return sendHtml(response, renderSprites(snapshot));
    };
    app.get("/metrics/sprites", allowPublicMetrics, serveSprites);

    const serveMaps = async (_request: Request, response: Response) => {
        const snapshot = await loadSnapshot(response);
        if (!snapshot) return sendHtml(response, unavailablePage(response.locals.fileMetricsError || "File metrics are unavailable."), 503);
        return sendHtml(response, renderMaps(snapshot));
    };
    app.get("/metrics/maps", allowPublicMetrics, serveMaps);

    const serveMissing = async (_request: Request, response: Response) => {
        const snapshot = await loadSnapshot(response);
        if (!snapshot) return sendHtml(response, unavailablePage(response.locals.fileMetricsError || "File metrics are unavailable."), 503);
        return sendHtml(response, renderMissing(snapshot));
    };
    app.get("/metrics/missing-cosmetics", allowPublicMetrics, serveMissing);

    const serveJson = async (_request: Request, response: Response) => {
        const snapshot = await loadSnapshot(response);
        if (!snapshot) return sendJson(response, { available: false, error: response.locals.fileMetricsError || "File metrics are unavailable." }, 503);
        return sendJson(response, snapshot);
    };
    app.get("/metrics/files.json", allowPublicMetrics, serveJson);
    app.get("/metrics/cache.json", allowPublicMetrics, serveJson);
    app.get("/metrics/sprites.json", allowPublicMetrics, serveJson);
    app.get("/metrics/maps.json", allowPublicMetrics, serveJson);
    app.get("/metrics/missing-cosmetics.json", allowPublicMetrics, serveJson);
}
