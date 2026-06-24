import * as os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import { Message, MessageEmbed, MessageAttachment } from "discord.js";
import mongoose from "mongoose";
import { getComponent, getRegisteredComponentIds, getRegisteredJobs } from "./runtimeDiagnostics";

type CpuSnapshot = {
    idle: number;
    total: number;
};

type DiskStats = {
    diskName: string;
    total: string;
    used: string;
    free: string;
    usagePercent: number;
    storageType: string;
};

type BrowserRenderStats = {
    processes: number;
    memoryBytes: number;
    memory: string;
    label: string;
};

export type PerformanceStats = {
    cpuUsagePercent: number;
    processCpuUsagePercent: number;
    cpuModel: string;
    cpuPhysicalCores: number | null;
    cpuLogicalCores: number;
    cpuSpeedGHz: string;
    loadMetricLabel: string;
    loadMetricValue: string;
    totalMemory: string;
    usedMemory: string;
    freeMemory: string;
    memoryUsagePercent: number;
    processMemoryUsagePercent: number;
    processRss: string;
    processHeapUsed: string;
    processHeapTotal: string;
    processExternal: string;
    systemUptime: string;
    processUptime: string;
    platform: string;
    release: string;
    architecture: string;
    hostname: string;
    nodeVersion: string;
    diskStats: DiskStats | null;
};

type PerformanceVisualData = {
    apiPing: number;
    commandLatency: number;
    componentIds: string[];
    countingDiagnostics: any;
    cosmeticsDiagnostics: any;
    deletedDiagnostics: any;
    discordCache: {
        guilds: number;
        users: number;
        channels: number;
        emojis: number;
    };
    browserStats: BrowserRenderStats;
    fortniteStatsDiagnostics: any;
    jobMetrics: ReturnType<typeof buildJobMetrics>;
    mapDiagnostics: any;
    missingCosmeticsDiagnostics: any;
    mongoStats: Awaited<ReturnType<typeof getMongoStats>>;
    newsDiagnostics: any;
    shopSectionsDiagnostics: any;
    spriteCardDiagnostics: any;
    spriteDiagnostics: any;
    stats: PerformanceStats;
    teasersDiagnostics: any;
    version: string;
};

const execAsync = promisify(exec);

let latestBrowserRenderStats: BrowserRenderStats = {
    processes: 0,
    memoryBytes: 0,
    memory: "Not captured",
    label: "No render browser sampled",
};

async function getProcessTreeMemoryStats(rootPid: number): Promise<{ processes: number; memoryBytes: number }> {
    if (!Number.isFinite(rootPid) || rootPid <= 0) return { processes: 0, memoryBytes: 0 };

    try {
        if (os.platform() === "win32") {
            const { stdout } = await execAsync(
                "powershell -NoProfile -Command \"Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize | ConvertTo-Json -Compress\"",
                { timeout: 2000, windowsHide: true },
            );
            const parsed = JSON.parse(stdout.trim());
            const processes = Array.isArray(parsed) ? parsed : [parsed];
            const childrenByParent = new Map<number, any[]>();

            for (const processInfo of processes) {
                const parentId = Number(processInfo?.ParentProcessId || 0);
                if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
                childrenByParent.get(parentId)!.push(processInfo);
            }

            const stack = [rootPid];
            const treeIds = new Set<number>();

            while (stack.length) {
                const processId = stack.pop()!;
                if (treeIds.has(processId)) continue;
                treeIds.add(processId);
                for (const child of childrenByParent.get(processId) || []) {
                    stack.push(Number(child?.ProcessId || 0));
                }
            }

            const memoryBytes = processes.reduce((sum, processInfo) => {
                const processId = Number(processInfo?.ProcessId || 0);
                return treeIds.has(processId) ? sum + Number(processInfo?.WorkingSetSize || 0) : sum;
            }, 0);

            return { processes: treeIds.size, memoryBytes };
        }

        const { stdout } = await execAsync("ps -eo pid=,ppid=,rss=", { timeout: 2000 });
        const rows = stdout
            .split("\n")
            .map((line) => line.trim().split(/\s+/).map(Number))
            .filter((parts) => parts.length === 3 && parts.every(Number.isFinite));
        const childrenByParent = new Map<number, Array<{ pid: number; rssKb: number }>>();

        for (const [pid, ppid, rssKb] of rows) {
            if (!childrenByParent.has(ppid)) childrenByParent.set(ppid, []);
            childrenByParent.get(ppid)!.push({ pid, rssKb });
        }

        const stack = [rootPid];
        const treeIds = new Set<number>();

        while (stack.length) {
            const processId = stack.pop()!;
            if (treeIds.has(processId)) continue;
            treeIds.add(processId);
            for (const child of childrenByParent.get(processId) || []) {
                stack.push(child.pid);
            }
        }

        const memoryBytes = rows.reduce((sum, [pid, , rssKb]) => {
            return treeIds.has(pid) ? sum + rssKb * 1024 : sum;
        }, 0);

        return { processes: treeIds.size, memoryBytes };
    } catch {
        return { processes: 0, memoryBytes: 0 };
    }
}

async function captureBrowserRenderStats(rootPid: number | undefined) {
    if (!rootPid) return;

    const stats = await getProcessTreeMemoryStats(rootPid);
    if (!stats.memoryBytes) return;

    if (stats.memoryBytes >= latestBrowserRenderStats.memoryBytes) {
        latestBrowserRenderStats = {
            processes: stats.processes,
            memoryBytes: stats.memoryBytes,
            memory: formatBytes(stats.memoryBytes),
            label: "Puppeteer render peak",
        };
    }
}

function getCpuSnapshot(): CpuSnapshot {
    const cpus = os.cpus();

    return cpus.reduce((snapshot, cpu) => {
        const total = Object.values(cpu.times).reduce((sum, time) => sum + time, 0);

        snapshot.idle += cpu.times.idle;
        snapshot.total += total;
        return snapshot;
    }, { idle: 0, total: 0 });
}

function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatBytes(bytes: number) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = bytes;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }

    return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatDuration(totalSeconds: number) {
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    const parts = [];

    if (days) parts.push(`${days}d`);
    if (hours || days) parts.push(`${hours}h`);
    if (minutes || hours || days) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);

    return parts.join(" ");
}

function formatTimeAgo(iso: string | null) {
    if (!iso) return "Never";

    const deltaMs = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return "Unknown";

    const seconds = Math.floor(deltaMs / 1000);
    if (seconds < 60) return `${seconds}s ago`;

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

function formatCompactBytes(bytes: number) {
    return formatBytes(bytes);
}

function formatTimeUntil(target: Date | null, now = new Date()) {
    if (!target || !Number.isFinite(target.getTime())) return "timing unavailable";

    const deltaMs = target.getTime() - now.getTime();
    if (deltaMs <= 1500) return "now";

    const totalSeconds = Math.ceil(deltaMs / 1000);
    if (totalSeconds < 60) return `in ${totalSeconds}s`;

    const totalMinutes = Math.ceil(totalSeconds / 60);
    if (totalMinutes < 60) return `in ${totalMinutes}m`;

    const totalHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (totalHours < 24) return `in ${totalHours}h${minutes ? ` ${minutes}m` : ""}`;

    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;
    return `in ${days}d${hours ? ` ${hours}h` : ""}`;
}

function estimateRecurringRun(referenceIso: string | null, intervalMs: number, now = new Date()) {
    const nowMs = now.getTime();
    const referenceMs = referenceIso ? new Date(referenceIso).getTime() : nowMs;
    if (!Number.isFinite(referenceMs)) return new Date(nowMs + intervalMs);

    const elapsed = Math.max(0, nowMs - referenceMs);
    const intervalsElapsed = Math.floor(elapsed / intervalMs) + 1;
    return new Date(referenceMs + intervalsElapsed * intervalMs);
}

function estimateNextJobRun(job: ReturnType<typeof getRegisteredJobs>[number], now = new Date()) {
    const referenceIso = job.lastStartedAt || job.lastFinishedAt || job.lastSuccessAt;
    const schedule = job.schedule.trim();

    const everyMatch = schedule.match(/^Every (\d+) (second|minute|hour|day)s?$/i);
    if (everyMatch) {
        const amount = Number(everyMatch[1]);
        const unit = everyMatch[2].toLowerCase();
        const unitMs = unit === "second"
            ? 1000
            : unit === "minute"
                ? 60_000
                : unit === "hour"
                    ? 3_600_000
                    : 86_400_000;
        return estimateRecurringRun(referenceIso, amount * unitMs, now);
    }

    const hourlyMatch = schedule.match(/^Hourly at mm:(\d{1,2})$/i);
    if (hourlyMatch) {
        const minute = Number(hourlyMatch[1]);
        const next = new Date(now);
        next.setMinutes(minute, 0, 0);
        if (next.getTime() <= now.getTime()) next.setHours(next.getHours() + 1);
        return next;
    }

    const dailyUtcMatch = schedule.match(/^Daily at (\d{2}):(\d{2}):(\d{2}) UTC$/i);
    if (dailyUtcMatch) {
        const [, hour, minute, second] = dailyUtcMatch;
        const next = new Date(now);
        next.setUTCHours(Number(hour), Number(minute), Number(second), 0);
        if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);
        return next;
    }

    if (schedule === "Daily and startup") {
        return estimateRecurringRun(referenceIso, 86_400_000, now);
    }

    const onceMatch = schedule.match(/^Once at (.+)$/i);
    if (onceMatch) {
        const date = new Date(onceMatch[1]);
        if (!Number.isNaN(date.getTime()) && date.getTime() > now.getTime()) {
            return date;
        }
    }

    return null;
}

function buildJobMetrics() {
    const now = new Date();
    const jobs = getRegisteredJobs()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((job) => {
            const status = job.lastError ? "Error" : job.successCount > 0 ? "Healthy" : "Idle";
            const lastSeen = formatTimeAgo(job.lastSuccessAt || job.lastFinishedAt || job.lastStartedAt);
            const nextRunAt = estimateNextJobRun(job, now);

            return {
                ...job,
                status,
                lastSeen,
                nextRunAt: nextRunAt?.toISOString() ?? null,
                nextRunLabel: formatTimeUntil(nextRunAt, now),
            };
        });
    const healthyJobs = jobs.filter((job) => !job.lastError && job.successCount > 0);
    const errorJobs = jobs.filter((job) => !!job.lastError);
    const idleJobs = jobs.filter((job) => !job.lastError && job.successCount === 0);

    const overviewLines = [
        `Tracked: \`${jobs.length}\``,
        `Healthy: \`${healthyJobs.length}\``,
        `Errors: \`${errorJobs.length}\``,
        `Idle: \`${idleJobs.length}\``,
    ];

    const detailLines = jobs
        .map((job) => {
            return `${job.name}: ${job.status} | Next ${job.nextRunLabel} | Runs ${job.runCount} | Last ${job.lastSeen}`;
        })
        .slice(0, 8);

    const errorLines = errorJobs
        .slice(0, 3)
        .map((job) => `${job.name}: ${job.lastError}`);

    return {
        overview: overviewLines.join("\n"),
        details: detailLines.join("\n"),
        errors: errorLines.join("\n"),
        jobs,
    };
}

function buildFeatureModulesValue(componentIds: string[]) {
    if (!componentIds.length) return "`No components registered`";

    return [
        `Registered: \`${componentIds.length}\``,
        componentIds.join(", "),
    ].join("\n").slice(0, 1024);
}

function escapeHtml(value: string | number | null | undefined) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function buildStatsRenderDocument(content: string, extraCss = "") {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
            <style>
                :root {
                    --font-body: "Inter", sans-serif;
                    --font-display: "Space Grotesk", sans-serif;
                    --font-mono: "JetBrains Mono", monospace;
                }
                * { box-sizing: border-box; }
                html, body { margin: 0; padding: 0; }
                body {
                    font-family: var(--font-body);
                    -webkit-font-smoothing: antialiased;
                    text-rendering: optimizeLegibility;
                }
                .mono { font-family: var(--font-mono); }
                .caps {
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                }
                .metric-card-title {
                    margin: 0 0 14px;
                    font: 700 0.82rem/1 var(--font-body);
                    letter-spacing: 0.12em;
                    text-transform: uppercase;
                }
                .metric-list {
                    display: grid;
                    gap: 10px;
                }
                .metric-row {
                    display: flex;
                    align-items: baseline;
                    justify-content: space-between;
                    gap: 18px;
                }
                .metric-label {
                    font: 600 0.9rem/1.35 var(--font-body);
                    opacity: 0.78;
                }
                .metric-value {
                    font: 700 0.92rem/1.35 var(--font-mono);
                    white-space: nowrap;
                }
                .pill {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    min-height: 34px;
                    padding: 0 14px;
                    border-radius: 999px;
                    font: 700 0.78rem/1 var(--font-body);
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                }
                ${extraCss}
            </style>
        </head>
        <body>${content}</body>
        </html>
    `;
}

async function renderStatsHtmlToBuffer(html: string, width: number, height: number): Promise<Buffer> {
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width, height, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: "load", timeout: 15000 });
        await page.evaluate(async () => {
            await (document as any).fonts?.ready;
        });
        await captureBrowserRenderStats(browser.process()?.pid);
        return Buffer.from(await page.screenshot({ type: "png" }));
    } finally {
        await browser.close();
    }
}

function clampProgress(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, value));
}

function clasyStatCard(title: string, value: string, subtitle: string, icon: string) {
    return `
        <article class="cl-stat-card">
            <div class="cl-card-head">
                <span class="cl-icon">${escapeHtml(icon)}</span>
                <span>${escapeHtml(title)}</span>
            </div>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(subtitle)}</small>
        </article>
    `;
}

function clasyFieldCard(title: string, rows: Array<[string, string | number | null | undefined]>, wide = false) {
    return `
        <section class="cl-panel ${wide ? "wide" : ""}">
            <div class="cl-panel-head">
                <h2>${escapeHtml(title)}</h2>
                <span>↗</span>
            </div>
            <div class="cl-rows">
                ${rows.map(([label, value]) => `
                    <div class="cl-row">
                        <span>${escapeHtml(label)}</span>
                        <strong>${escapeHtml(value)}</strong>
                    </div>
                `).join("")}
            </div>
        </section>
    `;
}

function clasyTextPanel(title: string, value: string, wide = false) {
    const lines = value.split("\n").filter(Boolean);

    return `
        <section class="cl-panel ${wide ? "wide" : ""}">
            <div class="cl-panel-head">
                <h2>${escapeHtml(title)}</h2>
                <span>↗</span>
            </div>
            <div class="cl-ledger">
                ${lines.length
                    ? lines.map((line) => `<p>${escapeHtml(line.replace(/`/g, ""))}</p>`).join("")
                    : `<p>No data</p>`}
            </div>
        </section>
    `;
}

function clasyOverviewRow(label: string, value: string | number | null | undefined) {
    return `
        <div class="clv-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `;
}

function clasyOverviewCard(title: string, rows: Array<[string, string | number | null | undefined]>, className = "") {
    return `
        <section class="clv-card ${className}">
            <div class="clv-card-head">
                <h2>${escapeHtml(title)}</h2>
                <span>open</span>
            </div>
            <div class="clv-rows">
                ${rows.map(([label, value]) => clasyOverviewRow(label, value)).join("")}
            </div>
        </section>
    `;
}

function clasyOverviewRing(title: string, percent: number, value: string, subValue: string, rows: Array<[string, string | number | null | undefined]>, tone: "cpu" | "memory") {
    const safePercent = clampProgress(percent);
    const radius = 82;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - safePercent / 100);

    return `
        <section class="clv-ring-card ${tone}">
            <div class="clv-ring-wrap">
                <svg class="clv-ring" viewBox="0 0 220 220" role="img" aria-label="${escapeHtml(title)} ${escapeHtml(value)}">
                    <defs>
                        <linearGradient id="clv-${tone}" x1="0" x2="1" y1="0" y2="1">
                            <stop offset="0%" stop-color="${tone === "cpu" ? "#f1ba83" : "#79d7bd"}"/>
                            <stop offset="100%" stop-color="${tone === "cpu" ? "#c88455" : "#3aa786"}"/>
                        </linearGradient>
                        <filter id="clv-${tone}-glow" x="-30%" y="-30%" width="160%" height="160%">
                            <feGaussianBlur stdDeviation="5" result="blur"/>
                            <feMerge>
                                <feMergeNode in="blur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>
                    <circle cx="110" cy="110" r="${radius}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="18"/>
                    <circle
                        cx="110"
                        cy="110"
                        r="${radius}"
                        fill="none"
                        stroke="url(#clv-${tone})"
                        stroke-width="18"
                        stroke-linecap="round"
                        stroke-dasharray="${circumference.toFixed(2)}"
                        stroke-dashoffset="${dashOffset.toFixed(2)}"
                        transform="rotate(-90 110 110)"
                        filter="url(#clv-${tone}-glow)"
                    />
                </svg>
                <div class="clv-ring-value">
                    <span>${escapeHtml(title)}</span>
                    <strong>${escapeHtml(value)}</strong>
                    <small>${escapeHtml(subValue)}</small>
                </div>
            </div>
            <div class="clv-ring-meta">
                ${rows.map(([label, rowValue]) => clasyOverviewRow(label, rowValue)).join("")}
            </div>
        </section>
    `;
}

function clasyFocusedRingCard(title: string, percent: number, value: string, subtitle: string, rows: Array<[string, string | number | null | undefined]>, tone: "cpu" | "memory") {
    const safePercent = clampProgress(percent);

    return `
        <article class="clx-ring-card ${tone}">
            <div class="clx-ring-figure">
                <svg viewBox="0 0 210 210" class="clx-ring" role="img" aria-label="${escapeHtml(title)} ${escapeHtml(value)}">
                    <circle class="clx-ring-track" cx="105" cy="105" r="76" pathLength="100" />
                    <circle
                        class="clx-ring-progress"
                        cx="105"
                        cy="105"
                        r="76"
                        pathLength="100"
                        stroke-dasharray="${safePercent.toFixed(2)} 100"
                    />
                </svg>
                <div class="clx-ring-center">
                    <span>${escapeHtml(title)}</span>
                    <strong>${escapeHtml(value)}</strong>
                    <small>${escapeHtml(subtitle)}</small>
                </div>
            </div>
            <div class="clx-detail-list">
                ${rows.map(([label, rowValue]) => clasyOverviewRow(label, rowValue)).join("")}
            </div>
        </article>
    `;
}

function clasyMiniRing(label: string, percent: number, value: string, detail: string, tone: "host" | "bot" | "memory") {
    const safePercent = clampProgress(percent);

    return `
        <div class="clx-mini-ring ${tone}">
            <svg viewBox="0 0 128 128" role="img" aria-label="${escapeHtml(label)} ${escapeHtml(value)} ${escapeHtml(detail)}">
                <circle class="clx-mini-track" cx="64" cy="64" r="47" pathLength="100" />
                <circle class="clx-mini-progress" cx="64" cy="64" r="47" pathLength="100" stroke-dasharray="${safePercent.toFixed(2)} 100" />
            </svg>
            <div>
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
                <small>${escapeHtml(detail)}</small>
            </div>
        </div>
    `;
}

function clasyCpuComparisonCard(stats: PerformanceStats) {
    return `
        <article class="clx-cpu-card">
            <div class="clx-card-title">
                <h2>CPU Usage</h2>
                <span>${escapeHtml(stats.loadMetricLabel)} ${escapeHtml(stats.loadMetricValue)}</span>
            </div>
            <div class="clx-cpu-main">
                ${clasyMiniRing("Host", stats.cpuUsagePercent, `${stats.cpuUsagePercent.toFixed(1)}%`, `${stats.cpuPhysicalCores ?? "Unknown"} cores / ${stats.cpuLogicalCores} threads`, "host")}
                ${clasyMiniRing("Bot", stats.processCpuUsagePercent, `${stats.processCpuUsagePercent.toFixed(1)}%`, "process share", "bot")}
            </div>
            <div class="clx-detail-list">
                ${clasyOverviewRow("Cores", stats.cpuPhysicalCores ?? "Unknown")}
                ${clasyOverviewRow("Threads", stats.cpuLogicalCores)}
                ${clasyOverviewRow("Speed", `${stats.cpuSpeedGHz} GHz`)}
                ${clasyOverviewRow("Processor", stats.cpuModel)}
            </div>
        </article>
    `;
}

function clasyMemoryComparisonCard(stats: PerformanceStats) {
    const systemMemory = `${stats.usedMemory.replace(/ ([A-Z]+)$/, "")} / ${stats.totalMemory}`;

    return `
        <article class="clx-cpu-card">
            <div class="clx-card-title">
                <h2>Memory Usage</h2>
                <span>system / process</span>
            </div>
            <div class="clx-cpu-main">
                ${clasyMiniRing("Host", stats.memoryUsagePercent, `${stats.memoryUsagePercent.toFixed(1)}%`, systemMemory, "memory")}
                ${clasyMiniRing("Bot", stats.processMemoryUsagePercent, `${stats.processMemoryUsagePercent.toFixed(1)}%`, `${stats.processRss} RSS`, "bot")}
            </div>
            <div class="clx-detail-list">
                ${clasyOverviewRow("System Free", stats.freeMemory)}
                ${clasyOverviewRow("Bot RSS", stats.processRss)}
                ${clasyOverviewRow("Heap Used", stats.processHeapUsed)}
                ${clasyOverviewRow("Heap Total", stats.processHeapTotal)}
            </div>
        </article>
    `;
}

function clasyFocusedPanel(title: string, rows: Array<[string, string | number | null | undefined]>, className = "") {
    return `
        <section class="clx-panel ${className}">
            <div class="clx-panel-head">
                <h2>${escapeHtml(title)}</h2>
                <span>status</span>
            </div>
            <div class="clx-detail-list">
                ${rows.map(([label, value]) => clasyOverviewRow(label, value)).join("")}
            </div>
        </section>
    `;
}

function buildClasyCommandFocusedImageHtml(data: PerformanceVisualData) {
    const { stats, version, browserStats, jobMetrics, mongoStats, cosmeticsDiagnostics, spriteDiagnostics, mapDiagnostics, countingDiagnostics, discordCache } = data;
    const jobRows = jobMetrics.jobs.map((job) => {
        const statusClass = job.status.toLowerCase();
        const nextLabel = job.nextRunLabel === "timing unavailable" ? "Schedule unknown" : job.nextRunLabel;
        const lastLabel = job.lastSeen === "Never" ? "Not run yet" : job.lastSeen;

        return `
            <article class="clx-job-row ${statusClass}">
                <div class="clx-job-top">
                    <span class="clx-job-state"><i class="clx-job-dot"></i>${escapeHtml(job.status)}</span>
                    <span class="clx-job-runs">${escapeHtml(job.runCount)}r</span>
                </div>
                <h3>${escapeHtml(job.name)}</h3>
                <small title="${escapeHtml(job.schedule)}">${escapeHtml(job.schedule)}</small>
                <div class="clx-job-meta-line">
                    <span>N ${escapeHtml(nextLabel)}</span>
                    <span>L ${escapeHtml(lastLabel)}</span>
                </div>
            </article>
        `;
    }).join("");
    const nextJob = jobMetrics.jobs
        .filter((job) => !!job.nextRunAt)
        .sort((a, b) => new Date(a.nextRunAt!).getTime() - new Date(b.nextRunAt!).getTime())[0];
    const healthyCount = jobMetrics.jobs.filter((job) => job.status === "Healthy").length;
    const errorCount = jobMetrics.jobs.filter((job) => job.status === "Error").length;
    const idleCount = jobMetrics.jobs.filter((job) => job.status === "Idle").length;

    return buildStatsRenderDocument(`
        <main class="clx-shell">
            <section class="clx-content">
                <header class="clx-topbar">
                    <div class="clx-topbar-main">
                        <div class="clx-brand clx-brand-inline">
                            <div class="clx-logo">C</div>
                            <strong>Creeper</strong>
                        </div>
                        <div class="clx-topbar-copy">
                            <span class="clx-breadcrumb">Dashboard / Performance</span>
                            <h1>Performance + Jobs Overview</h1>
                        </div>
                    </div>
                    <div class="clx-topbar-side">
                        <div class="clx-actions">
                            <span>${escapeHtml(stats.hostname)} | ${escapeHtml(version)}</span>
                            <strong>c!cpu</strong>
                        </div>
                    </div>
                </header>

                <section class="clx-kpis">
                    <article class="clx-kpi-card">
                        <span>Fortnite Cosmetics</span>
                        <strong>${escapeHtml(cosmeticsDiagnostics?.cosmeticsLoaded ?? 0)}</strong>
                        <small>${escapeHtml(cosmeticsDiagnostics?.cachedQueries ?? 0)} cached queries</small>
                    </article>
                    <article class="clx-kpi-card">
                        <span>Sprite Cache</span>
                        <strong>${escapeHtml(spriteDiagnostics?.renderedImageEntries ?? 0)}</strong>
                        <small>${escapeHtml(spriteDiagnostics ? `${spriteDiagnostics.familiesLoaded}/${spriteDiagnostics.variantsLoaded} families/variants` : "Sprite diagnostics unavailable")}</small>
                    </article>
                    <article class="clx-kpi-card">
                        <span>Map Cache</span>
                        <strong>${escapeHtml(mapDiagnostics?.versionsLoaded ?? 0)}</strong>
                        <small>${escapeHtml(mapDiagnostics ? `${mapDiagnostics.hostedImages} hosted images` : "Map diagnostics unavailable")}</small>
                    </article>
                    <article class="clx-kpi-card">
                        <span>API Ping</span>
                        <strong>${escapeHtml(Math.round(data.apiPing))}ms</strong>
                        <small>${escapeHtml(`${data.commandLatency}ms command latency`)}</small>
                    </article>
                </section>

                <section class="clx-primary">
                    ${clasyCpuComparisonCard(stats)}
                    ${clasyMemoryComparisonCard(stats)}
                </section>

                <section class="clx-secondary">
                    ${clasyFocusedPanel("Runtime", [
                        ["Bot Uptime", stats.processUptime],
                        ["System Uptime", stats.systemUptime],
                        ["Node", stats.nodeVersion],
                        ["Command Latency", `${data.commandLatency}ms`],
                    ], "clx-info-panel")}
                    ${clasyFocusedPanel("Host", [
                        ["Platform", `${stats.platform} ${stats.release}`],
                        ["Arch", stats.architecture],
                        ["Environment", process.env.HOST_TYPE || "local"],
                        ["Machine", stats.hostname],
                    ], "clx-info-panel")}
                    ${clasyFocusedPanel("Mongo", [
                        ["State", mongoStats.state],
                        ["Ping", mongoStats.pingMs !== null ? `${mongoStats.pingMs}ms` : "Unavailable"],
                        ["DB", mongoStats.dbName],
                    ], "clx-info-panel")}
                    ${clasyFocusedPanel("Browser", [
                        ["Memory", browserStats.memory],
                        ["Processes", browserStats.processes],
                        ["Sample", browserStats.label],
                    ], "clx-info-panel")}
                    <section class="clx-panel clx-jobs-panel">
                        <div class="clx-panel-head">
                            <h2>Jobs</h2>
                            <span>${escapeHtml(jobMetrics.jobs.length)} tracked / ${escapeHtml(healthyCount)} healthy / ${escapeHtml(errorCount)} errors / ${escapeHtml(idleCount)} idle</span>
                        </div>
                        <div class="clx-job-list">
                            ${jobRows || `<article class="clx-job-row idle"><div class="clx-job-top"><span class="clx-job-state"><i class="clx-job-dot"></i>Idle</span><span class="clx-job-runs">0r</span></div><h3>No tracked jobs registered</h3><small>No schedule available</small><div class="clx-job-meta-line"><span>N n/a</span><span>L Never</span></div></article>`}
                        </div>
                    </section>
                </section>
            </section>
        </main>
    `, `
        :root {
            --clx-bg: #101727;
            --clx-bg-deep: #060b16;
            --clx-surface: #0b111f;
            --clx-surface-2: #11192b;
            --clx-surface-3: #172137;
            --clx-line: rgba(143, 161, 198, 0.13);
            --clx-line-soft: rgba(143, 161, 198, 0.08);
            --clx-text: #f4f7ff;
            --clx-muted: #8490aa;
            --clx-muted-strong: #b9c2d7;
            --clx-blue: #2574ff;
            --clx-blue-2: #7db2ff;
            --clx-copper: #e1a06a;
            --clx-green: #34d399;
            --clx-red: #f87171;
            --clx-shadow: rgba(0, 0, 0, 0.34);
            --clx-radius: 12px;
        }
        body {
            width: 1600px;
            min-height: 1280px;
            background:
                radial-gradient(circle at 76% 4%, rgba(37, 116, 255, 0.16), transparent 30%),
                linear-gradient(135deg, var(--clx-bg) 0%, var(--clx-bg-deep) 100%);
            color: var(--clx-text);
        }
        .clx-shell {
            width: 1600px;
            min-height: 1280px;
            padding: 34px;
        }
        .clx-topbar,
        .clx-cpu-card,
        .clx-ring-card,
        .clx-ping-card,
        .clx-kpi-card,
        .clx-panel {
            background: var(--clx-surface);
            border: 1px solid var(--clx-line);
            box-shadow: 0 24px 70px var(--clx-shadow);
        }
        .clx-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 28px;
        }
        .clx-logo {
            display: grid;
            place-items: center;
            width: 42px;
            height: 42px;
            border-radius: 12px;
            background: linear-gradient(135deg, var(--clx-blue), var(--clx-blue-2));
            color: var(--clx-text);
            font: 800 1.28rem/1 var(--font-body);
        }
        .clx-brand strong {
            font: 800 1.24rem/1 var(--font-body);
        }
        .clx-brand-inline {
            margin-bottom: 0;
            padding-right: 18px;
            border-right: 1px solid var(--clx-line-soft);
        }
        .clx-content {
            min-width: 0;
        }
        .clx-topbar {
            min-height: 116px;
            border-radius: 16px;
            padding: 18px 22px;
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 18px;
            margin-bottom: 18px;
        }
        .clx-topbar-main {
            display: flex;
            align-items: center;
            gap: 18px;
            min-width: 0;
        }
        .clx-topbar-copy {
            min-width: 0;
        }
        .clx-topbar-side {
            display: flex;
            align-items: stretch;
            gap: 14px;
        }
        .clx-breadcrumb {
            display: block;
            margin-bottom: 8px;
            color: var(--clx-muted);
            font: 700 0.78rem/1 var(--font-body);
        }
        .clx-topbar h1 {
            margin: 0;
            font: 800 1.85rem/1 var(--font-body);
        }
        .clx-ping-card {
            min-width: 210px;
            border-radius: 14px;
            padding: 14px 18px;
        }
        .clx-ping-card span {
            color: var(--clx-muted);
            font: 800 0.72rem/1 var(--font-body);
        }
        .clx-ping-card strong {
            display: block;
            margin-top: 10px;
            color: var(--clx-text);
            font: 800 1.65rem/1 var(--font-body);
            font-variant-numeric: tabular-nums;
        }
        .clx-ping-card small {
            display: block;
            margin-top: 8px;
            color: var(--clx-muted-strong);
            font: 700 0.74rem/1.25 var(--font-body);
        }
        .clx-kpis {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 18px;
        }
        .clx-kpi-card {
            min-height: 112px;
            border-radius: var(--clx-radius);
            padding: 18px 20px;
        }
        .clx-kpi-card span {
            color: var(--clx-muted);
            font: 800 0.78rem/1 var(--font-body);
        }
        .clx-kpi-card strong {
            display: block;
            margin-top: 14px;
            color: var(--clx-text);
            font: 800 1.9rem/1 var(--font-body);
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }
        .clx-kpi-card small {
            display: block;
            margin-top: 8px;
            color: var(--clx-muted-strong);
            font: 700 0.75rem/1.25 var(--font-body);
            overflow-wrap: anywhere;
        }
        .clx-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .clx-actions span {
            color: var(--clx-muted-strong);
            font: 800 0.82rem/1 var(--font-mono);
        }
        .clx-actions strong {
            padding: 12px 19px;
            border-radius: 999px;
            background: var(--clx-blue);
            color: var(--clx-text);
            font: 800 0.88rem/1 var(--font-mono);
        }
        .clx-primary {
            display: grid;
            grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
            gap: 18px;
            margin-bottom: 18px;
        }
        .clx-cpu-card,
        .clx-ring-card {
            min-height: 330px;
            border-radius: var(--clx-radius);
            padding: 22px;
        }
        .clx-card-title,
        .clx-panel-head {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 18px;
        }
        .clx-card-title h2,
        .clx-panel-head h2 {
            margin: 0;
            color: var(--clx-text);
            font: 800 1rem/1 var(--font-body);
        }
        .clx-card-title span,
        .clx-panel-head span {
            color: var(--clx-muted);
            font: 800 0.72rem/1 var(--font-mono);
        }
        .clx-cpu-main {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 14px;
            margin-bottom: 18px;
        }
        .clx-mini-ring {
            min-height: 150px;
            display: grid;
            grid-template-columns: 128px 1fr;
            align-items: center;
            gap: 15px;
            padding: 12px;
            border-radius: 12px;
            background: var(--clx-surface-2);
            border: 1px solid var(--clx-line-soft);
        }
        .clx-mini-ring svg {
            width: 128px;
            height: 128px;
        }
        .clx-mini-track,
        .clx-mini-progress {
            fill: none;
            stroke-width: 14;
        }
        .clx-mini-track {
            stroke: var(--clx-surface-3);
        }
        .clx-mini-progress {
            transform: rotate(-90deg);
            transform-origin: 64px 64px;
            stroke-linecap: butt;
        }
        .clx-mini-ring.host .clx-mini-progress {
            stroke: var(--clx-blue);
        }
        .clx-mini-ring.bot .clx-mini-progress {
            stroke: var(--clx-copper);
        }
        .clx-mini-ring.memory .clx-mini-progress {
            stroke: var(--clx-green);
        }
        .clx-mini-ring span {
            color: var(--clx-muted);
            font: 800 0.78rem/1 var(--font-body);
        }
        .clx-mini-ring strong {
            display: block;
            margin-top: 8px;
            color: var(--clx-text);
            font: 800 1.92rem/1 var(--font-body);
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
        }
        .clx-mini-ring small {
            display: block;
            max-width: 180px;
            margin-top: 7px;
            color: var(--clx-muted-strong);
            font: 700 0.74rem/1.25 var(--font-body);
            overflow-wrap: anywhere;
        }
        .clx-ring-card {
            display: grid;
            grid-template-columns: 230px 1fr;
            align-items: center;
            gap: 20px;
        }
        .clx-ring-figure {
            position: relative;
            display: grid;
            place-items: center;
        }
        .clx-ring {
            width: 218px;
            height: 218px;
        }
        .clx-ring-track,
        .clx-ring-progress {
            fill: none;
            stroke-width: 18;
        }
        .clx-ring-track {
            stroke: var(--clx-surface-3);
        }
        .clx-ring-progress {
            transform: rotate(-90deg);
            transform-origin: 105px 105px;
            stroke-linecap: butt;
        }
        .memory .clx-ring-progress {
            stroke: var(--clx-green);
        }
        .clx-ring-center {
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            align-content: center;
            gap: 7px;
            text-align: center;
        }
        .clx-ring-center span {
            color: var(--clx-muted);
            font: 800 0.78rem/1 var(--font-body);
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }
        .clx-ring-center strong {
            color: var(--clx-text);
            font: 800 2.75rem/1 var(--font-body);
        }
        .clx-ring-center small {
            color: var(--clx-muted);
            font: 800 0.72rem/1 var(--font-body);
            text-transform: uppercase;
        }
        .clx-detail-list {
            display: grid;
            gap: 8px;
            align-content: center;
        }
        .clx-secondary {
            display: grid;
            grid-template-columns: repeat(12, minmax(0, 1fr));
            gap: 14px;
        }
        .clx-panel {
            min-height: 236px;
            padding: 18px;
            border-radius: var(--clx-radius);
        }
        .clx-info-panel {
            grid-column: span 3;
        }
        .clx-jobs-panel {
            grid-column: 1 / -1;
            min-height: 0;
        }
        .clx-job-row,
        .clx-job-time {
            background: var(--clx-surface-2);
            border: 1px solid var(--clx-line-soft);
            border-radius: 12px;
        }
        .clx-job-copy small,
        .clx-job-state,
        .clx-job-runs,
        .clx-job-time span {
            color: var(--clx-muted);
            font: 800 0.74rem/1.2 var(--font-body);
        }
        .clx-job-list {
            display: grid;
            grid-template-columns: repeat(5, minmax(0, 1fr));
            gap: 10px;
        }
        .clx-job-row {
            position: relative;
            display: grid;
            gap: 7px;
            align-content: start;
            min-height: 122px;
            padding: 11px 11px 11px 15px;
        }
        .clx-job-row::before {
            content: "";
            position: absolute;
            left: 0;
            top: 8px;
            bottom: 8px;
            width: 2px;
            border-radius: 999px;
            background: rgba(125, 178, 255, 0.8);
        }
        .clx-job-row.healthy::before {
            background: var(--clx-green);
        }
        .clx-job-row.error::before {
            background: var(--clx-red);
        }
        .clx-job-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            margin-right: 5px;
            border-radius: 999px;
            background: rgba(125, 178, 255, 0.88);
            box-shadow: 0 0 0 2px rgba(125, 178, 255, 0.12);
            vertical-align: middle;
        }
        .clx-job-row.healthy .clx-job-dot {
            background: var(--clx-green);
            box-shadow: 0 0 0 2px rgba(52, 211, 153, 0.12);
        }
        .clx-job-row.error .clx-job-dot {
            background: var(--clx-red);
            box-shadow: 0 0 0 2px rgba(248, 113, 113, 0.12);
        }
        .clx-job-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        .clx-job-state {
            display: inline-flex;
            align-items: center;
            justify-content: flex-start;
            min-height: 22px;
            padding: 0 8px;
            border-radius: 999px;
            background: var(--clx-surface-3);
            font-size: 0.64rem;
        }
        .clx-job-row.healthy .clx-job-state {
            color: #8ff0cd;
            background: rgba(52, 211, 153, 0.14);
        }
        .clx-job-row.error .clx-job-state {
            color: #ffaca7;
            background: rgba(248, 113, 113, 0.14);
        }
        .clx-job-row.idle .clx-job-state {
            color: #b9c2d7;
            background: rgba(125, 178, 255, 0.12);
        }
        .clx-job-runs {
            font-family: var(--font-mono);
            font-size: 0.62rem;
        }
        .clx-job-row h3 {
            margin: 0;
            color: var(--clx-text);
            font: 800 0.78rem/1.18 var(--font-body);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .clx-job-row small {
            display: block;
            color: var(--clx-muted-strong);
            font-size: 0.6rem;
            line-height: 1.15;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .clx-job-meta-line {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            margin-top: auto;
        }
        .clx-job-meta-line span {
            min-width: 0;
            color: var(--clx-muted-strong);
            font: 800 0.64rem/1.15 var(--font-mono);
            font-variant-numeric: tabular-nums;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .clv-row {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 14px;
            padding: 8px 0;
            border-bottom: 1px solid var(--clx-line-soft);
        }
        .clv-row:last-child {
            border-bottom: 0;
        }
        .clv-row span {
            color: var(--clx-muted);
            font: 800 0.76rem/1.25 var(--font-body);
        }
        .clv-row strong {
            max-width: 68%;
            color: var(--clx-text);
            font: 800 0.78rem/1.25 var(--font-mono);
            font-variant-numeric: tabular-nums;
            text-align: right;
            overflow-wrap: anywhere;
        }
    `);
}





async function collectPerformanceVisualData(message: Message, apiPing: number, version: string): Promise<PerformanceVisualData> {
    const commandLatency = Date.now() - message.createdTimestamp;
    const stats = await getPerformanceStats();
    const mongoStats = await getMongoStats();
    const client = message.client;
    const fortniteSprites = getComponent<any>("fortniteSprites");
    const fortniteMap = getComponent<any>("fortniteMap");
    const fortniteCosmetics = getComponent<any>("fortniteCosmetics");
    const counting = getComponent<any>("counting");
    const deletedClient = getComponent<any>("deletedClient");
    const fortniteStats = getComponent<any>("fortniteStats");
    const fortniteSpriteCard = getComponent<any>("fortniteSpriteCard");
    const news = getComponent<any>("news");
    const shopSectionsTracker = getComponent<any>("shopSectionsTracker");
    const missingCosmetics = getComponent<any>("missingCosmetics");
    const teasers = getComponent<any>("teasers");

    return {
        apiPing,
        commandLatency,
        componentIds: getRegisteredComponentIds(),
        countingDiagnostics: counting?.getDiagnostics?.(),
        cosmeticsDiagnostics: fortniteCosmetics?.getDiagnostics?.(),
        deletedDiagnostics: deletedClient?.getDiagnostics?.(),
        browserStats: latestBrowserRenderStats,
        discordCache: {
            guilds: client.guilds.cache.size,
            users: client.users.cache.size,
            channels: client.channels.cache.size,
            emojis: client.emojis.cache.size,
        },
        fortniteStatsDiagnostics: fortniteStats?.getDiagnostics?.(),
        jobMetrics: buildJobMetrics(),
        mapDiagnostics: fortniteMap?.getDiagnostics?.(),
        missingCosmeticsDiagnostics: missingCosmetics?.getDiagnostics?.(),
        mongoStats,
        newsDiagnostics: news?.getDiagnostics?.(),
        shopSectionsDiagnostics: shopSectionsTracker?.getDiagnostics?.(),
        spriteCardDiagnostics: fortniteSpriteCard?.getDiagnostics?.(),
        spriteDiagnostics: fortniteSprites?.getDiagnostics?.(),
        stats,
        teasersDiagnostics: teasers?.getDiagnostics?.(),
        version,
    };
}

export async function renderPerformanceStatsClasyCommandImage(data: PerformanceVisualData): Promise<Buffer> {
    const html = buildClasyCommandFocusedImageHtml(data);
    return renderStatsHtmlToBuffer(html, 1600, 1360);
}

async function getCpuTopology() {
    const logicalCores = (os as any).availableParallelism ? (os as any).availableParallelism() : os.cpus().length;

    try {
        if (os.platform() === "win32") {
            const { stdout } = await execAsync("wmic cpu get NumberOfCores", { timeout: 1500, windowsHide: true });
            const physicalCores = parseInt(stdout.split("\n")[1].trim(), 10);
            return {
                physicalCores: Number.isNaN(physicalCores) ? null : physicalCores,
                logicalCores,
            };
        } else if (os.platform() === "darwin") {
            const { stdout } = await execAsync("sysctl -n hw.physicalcpu", { timeout: 1500 });
            const physicalCores = parseInt(stdout.trim(), 10);
            return {
                physicalCores: Number.isNaN(physicalCores) ? null : physicalCores,
                logicalCores,
            };
        } else if (os.platform() === "linux") {
            const { stdout } = await execAsync("lscpu -p=CORE | grep -v \"^#\" | sort -u | wc -l", { timeout: 1500 });
            const physicalCores = parseInt(stdout.trim(), 10);
            return {
                physicalCores: Number.isNaN(physicalCores) ? null : physicalCores,
                logicalCores,
            };
        }
    } catch (error) {
        // Fallback to logical count if command fails
    }

    return {
        physicalCores: null,
        logicalCores,
    };
}

async function getMongoStats() {
    const stateLabels: Record<number, string> = {
        0: "disconnected",
        1: "connected",
        2: "connecting",
        3: "disconnecting",
    };

    const readyState = mongoose.connection.readyState;
    const dbName = mongoose.connection.name || "Unknown";

    if (readyState !== 1 || !mongoose.connection.db) {
        return {
            state: stateLabels[readyState] || `state ${readyState}`,
            pingMs: null as number | null,
            dbName,
        };
    }

    const startedAt = Date.now();
    try {
        await mongoose.connection.db.admin().ping();
        return {
            state: stateLabels[readyState] || `state ${readyState}`,
            pingMs: Date.now() - startedAt,
            dbName,
        };
    } catch {
        return {
            state: stateLabels[readyState] || `state ${readyState}`,
            pingMs: null as number | null,
            dbName,
        };
    }
}

async function getDiskStats(): Promise<DiskStats | null> {
    if (os.platform() === "win32") return getWindowsDiskStats();
    return getUnixDiskStats();
}

async function getStorageType(): Promise<string> {
    if (os.platform() === "win32") {
        try {
            const { stdout } = await execAsync(
                "powershell -NoProfile -Command \"Get-PhysicalDisk | Select-Object -First 1 MediaType, FriendlyName | ConvertTo-Json -Compress\"",
                { timeout: 1500, windowsHide: true },
            );
            const parsed = JSON.parse(stdout.trim());
            const mediaType = parsed?.MediaType ? String(parsed.MediaType).trim() : "";
            const friendlyName = parsed?.FriendlyName ? String(parsed.FriendlyName).trim() : "";

            if (mediaType && friendlyName) return `${mediaType} (${friendlyName})`;
            if (mediaType) return mediaType;
            if (friendlyName) return friendlyName;
        } catch {
            return "Unavailable";
        }
    }

    return "Unavailable";
}

async function getWindowsDiskStats(): Promise<DiskStats | null> {
    try {
        const { stdout } = await execAsync("wmic logicaldisk get size,freespace,caption", { timeout: 1500, windowsHide: true });
        const lines = stdout.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const diskTarget = process.env.SYSTEMDRIVE || "C:";
        const targetLine = lines.find(l => l.startsWith(diskTarget)) || lines[1];
        if (!targetLine) return null;

        const parts = targetLine.split(/\s+/);
        const freeBytes = Number(parts[1] || 0);
        const totalBytes = Number(parts[2] || 0);
        const usedBytes = Math.max(totalBytes - freeBytes, 0);
        const usagePercent = totalBytes > 0 ? (usedBytes / totalBytes) * 100 : 0;

        return {
            diskName: parts[0] || diskTarget,
            total: formatBytes(totalBytes),
            used: formatBytes(usedBytes),
            free: formatBytes(freeBytes),
            usagePercent,
            storageType: await getStorageType(),
        };
    } catch {
        return null;
    }
}

async function getUnixDiskStats(): Promise<DiskStats | null> {
    try {
        const { stdout } = await execAsync("df -h / | tail -1", { timeout: 1500 });
        const parts = stdout.trim().split(/\s+/);
        const diskName = parts[0] || "/";
        const usageStr = parts[4] || "0%";
        const usagePercent = parseFloat(usageStr.replace('%', ''));

        return {
            diskName,
            total: parts[1] || "0",
            used: parts[2] || "0",
            free: parts[3] || "0",
            usagePercent: isNaN(usagePercent) ? 0 : usagePercent,
            storageType: "Unavailable",
        };
    } catch {
        return null;
    }
}

export async function getPerformanceStats(sampleMs = 500): Promise<PerformanceStats> {
    const startSnapshot = getCpuSnapshot();
    const startProcessCpu = process.cpuUsage();
    await wait(sampleMs);
    const endSnapshot = getCpuSnapshot();
    const processCpuDelta = process.cpuUsage(startProcessCpu);

    const idleDelta = endSnapshot.idle - startSnapshot.idle;
    const totalDelta = endSnapshot.total - startSnapshot.total;
    const cpuUsagePercent = totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
    const logicalCoreCount = Math.max((os as any).availableParallelism ? (os as any).availableParallelism() : os.cpus().length, 1);
    const processCpuMicros = processCpuDelta.user + processCpuDelta.system;
    const processCpuUsagePercent = sampleMs > 0
        ? (processCpuMicros / (sampleMs * 1000 * logicalCoreCount)) * 100
        : 0;

    const totalMemoryBytes = os.totalmem();
    const freeMemoryBytes = os.freemem();
    const usedMemoryBytes = totalMemoryBytes - freeMemoryBytes;

    const memoryUsage = process.memoryUsage();
    const memoryUsagePercent = totalMemoryBytes > 0 ? (usedMemoryBytes / totalMemoryBytes) * 100 : 0;
    const processMemoryUsagePercent = totalMemoryBytes > 0 ? (memoryUsage.rss / totalMemoryBytes) * 100 : 0;
    const cpu = os.cpus()[0];
    const isWindows = os.platform() === "win32";
    const diskStats = await getDiskStats();
    const cpuTopology = await getCpuTopology();
    const loadMetricLabel = isWindows ? "CPU Sample Window" : "Load Avg";
    const loadMetricValue = isWindows
        ? `${sampleMs}ms`
        : os.loadavg().map((value) => value.toFixed(2)).join(" / ");

    return {
        cpuUsagePercent,
        processCpuUsagePercent,
        cpuModel: cpu?.model || "Unknown CPU",
        cpuPhysicalCores: cpuTopology.physicalCores,
        cpuLogicalCores: cpuTopology.logicalCores,
        cpuSpeedGHz: cpu ? (cpu.speed / 1000).toFixed(2) : "Unknown",
        loadMetricLabel,
        loadMetricValue,
        totalMemory: formatBytes(totalMemoryBytes),
        usedMemory: formatBytes(usedMemoryBytes),
        freeMemory: formatBytes(freeMemoryBytes),
        memoryUsagePercent,
        processMemoryUsagePercent,
        processRss: formatBytes(memoryUsage.rss),
        processHeapUsed: formatBytes(memoryUsage.heapUsed),
        processHeapTotal: formatBytes(memoryUsage.heapTotal),
        processExternal: formatBytes(memoryUsage.external),
        systemUptime: formatDuration(os.uptime()),
        processUptime: formatDuration(process.uptime()),
        platform: os.platform(),
        release: os.release(),
        architecture: os.arch(),
        hostname: os.hostname(),
        nodeVersion: process.version,
        diskStats,
    };
}

export async function sendPerformanceStats(message: Message, apiPing: number, version: string): Promise<void> {
    const data = await collectPerformanceVisualData(message, apiPing, version);
    const { stats, mongoStats, spriteDiagnostics, mapDiagnostics, cosmeticsDiagnostics, countingDiagnostics, deletedDiagnostics, fortniteStatsDiagnostics, spriteCardDiagnostics, newsDiagnostics, shopSectionsDiagnostics, missingCosmeticsDiagnostics, jobMetrics, componentIds } = data;
    const client = message.client;

    const performanceEmbed = new MessageEmbed()
        .setTitle("Creeper Bot Performance Stats")
        .setColor("#2186DB")
        .setFooter({ text: version })
        .setTimestamp()
        .addFields(
            {
                name: "CPU",
                value: [
                    `Usage: \`${stats.cpuUsagePercent.toFixed(1)}%\``,
                    `Bot CPU: \`${stats.processCpuUsagePercent.toFixed(1)}%\``,
                    `Cores: \`${stats.cpuPhysicalCores ?? "Unknown"}\``,
                    `Threads: \`${stats.cpuLogicalCores}\``,
                    `Speed: \`${stats.cpuSpeedGHz} GHz\``,
                    `${stats.loadMetricLabel}: \`${stats.loadMetricValue}\``,
                ].join("\n"),
                inline: true,
            },
            {
                name: "Memory",
                value: [
                    `System: \`${stats.usedMemory} / ${stats.totalMemory}\``,
                    `Free: \`${stats.freeMemory}\``,
                    `Usage: \`${stats.memoryUsagePercent.toFixed(1)}%\``,
                    `Bot RSS: \`${stats.processRss}\` (${stats.processMemoryUsagePercent.toFixed(1)}%)`,
                ].join("\n"),
                inline: true,
            },
            {
                name: "Runtime",
                value: [
                    `Bot Uptime: \`${stats.processUptime}\``,
                    `System Uptime: \`${stats.systemUptime}\``,
                    `Node: \`${stats.nodeVersion}\``,
                    `API Ping: \`${Math.round(apiPing)}ms\``,
                    `Command Latency: \`${data.commandLatency}ms\``,
                ].join("\n"),
                inline: false,
            },
            {
                name: "Host",
                value: [
                    `Platform: \`${stats.platform} ${stats.release}\``,
                    `Arch: \`${stats.architecture}\``,
                    `Environment: \`${process.env.HOST_TYPE || "local"}\``,
                    `Machine: \`${stats.hostname}\``,
                ].join("\n"),
                inline: true,
            },
            {
                name: "Storage",
                value: stats.diskStats
                    ? [
                        `Drive: \`${stats.diskStats.diskName}\``,
                        `Disk: \`${stats.diskStats.used} / ${stats.diskStats.total}\``,
                        `Free: \`${stats.diskStats.free}\``,
                        `Usage: \`${stats.diskStats.usagePercent.toFixed(1)}%\``,
                        `Type: \`${stats.diskStats.storageType}\``,
                    ].join("\n")
                    : "`Disk stats unavailable`",
                inline: true,
            },
            {
                name: "Process Memory",
                value: [
                    `Heap Used: \`${stats.processHeapUsed}\``,
                    `Heap Total: \`${stats.processHeapTotal}\``,
                    `External: \`${stats.processExternal}\``,
                ].join("\n"),
                inline: true,
            },
            {
                name: "Browser",
                value: [
                    `Puppeteer Memory: \`${data.browserStats.memory}\``,
                    `Processes: \`${data.browserStats.processes}\``,
                    `Sample: \`${data.browserStats.label}\``,
                ].join("\n"),
                inline: true,
            },
            {
                name: "Discord Cache",
                value: [
                    `Guilds: \`${client.guilds.cache.size}\``,
                    `Users: \`${client.users.cache.size}\``,
                    `Channels: \`${client.channels.cache.size}\``,
                    `Emojis: \`${client.emojis.cache.size}\``,
                ].join("\n"),
                inline: true,
            },
            {
                name: "Mongo",
                value: [
                    `State: \`${mongoStats.state}\``,
                    `Ping: \`${mongoStats.pingMs !== null ? `${mongoStats.pingMs}ms` : "Unavailable"}\``,
                    `DB: \`${mongoStats.dbName}\``,
                ].join("\n"),
                inline: true,
            },
            {
                name: "Sprite Cache",
                value: spriteDiagnostics
                    ? [
                        `Families/Variants: \`${spriteDiagnostics.familiesLoaded}/${spriteDiagnostics.variantsLoaded}\``,
                        `Rendered Cache: \`${spriteDiagnostics.renderedImageEntries}\` (${formatCompactBytes(spriteDiagnostics.renderedImageBytes)})`,
                        `Asset Cache: \`${spriteDiagnostics.spriteAssetEntries}\` (${formatCompactBytes(spriteDiagnostics.spriteAssetBytes)})`,
                        `Tracked Messages: \`${spriteDiagnostics.trackedMessages}\``,
                    ].join("\n")
                    : "`Sprite diagnostics unavailable`",
                inline: true,
            },
            {
                name: "Map Cache",
                value: mapDiagnostics
                    ? [
                        `Versions: \`${mapDiagnostics.versionsLoaded}\``,
                        `Seasons/Chapters: \`${mapDiagnostics.seasonsLoaded}/${mapDiagnostics.chaptersLoaded}\``,
                        `Hosted Images: \`${mapDiagnostics.hostedImages}\``,
                    ].join("\n")
                    : "`Map diagnostics unavailable`",
                inline: true,
            },
            {
                name: "Bot Cache",
                value: [
                    `Counting Guild Cache: \`${countingDiagnostics?.cachedGuilds ?? 0}\``,
                    `Cosmetics Loaded: \`${cosmeticsDiagnostics?.cosmeticsLoaded ?? 0}\``,
                    `Cosmetic Query Cache: \`${cosmeticsDiagnostics?.cachedQueries ?? 0}\``,
                ].join("\n"),
                inline: true,
            },
            {
                name: "Fortnite Services",
                value: [
                    `Stats Requests: \`${fortniteStatsDiagnostics?.statsRequestsHandled ?? 0}\``,
                    `Season Cache: \`${fortniteStatsDiagnostics?.seasonEndDateCached ? "Ready" : "Empty"}\``,
                    `News Updates: \`${newsDiagnostics?.updatesSent ?? 0}\``,
                    `Shop Section Updates: \`${shopSectionsDiagnostics?.updatesSent ?? 0}\``,
                    `Missing Cosmetics Daily: \`${missingCosmeticsDiagnostics?.lastDailyItemsMissing ?? 0}\``,
                    `Sprite Cards Rendered: \`${spriteCardDiagnostics?.cardsRendered ?? 0}\``,
                ].join("\n"),
                inline: false,
            },
            {
                name: "Moderation",
                value: [
                    `Deleted Logged: \`${deletedDiagnostics?.deletedMessagesLogged ?? 0}\``,
                    `Edited Logged: \`${deletedDiagnostics?.editedMessagesLogged ?? 0}\``,
                    `Bulk Events: \`${deletedDiagnostics?.bulkDeleteEventsLogged ?? 0}\``,
                    `Bulk Messages: \`${deletedDiagnostics?.bulkDeletedMessagesLogged ?? 0}\``,
                ].join("\n"),
                inline: true,
            },
            {
                name: "Processor",
                value: `\`${stats.cpuModel}\``,
                inline: false,
            },
            {
                name: "Features",
                value: buildFeatureModulesValue(componentIds),
                inline: false,
            },
            {
                name: "Jobs Overview",
                value: jobMetrics.overview,
                inline: false,
            },
            {
                name: "Jobs",
                value: jobMetrics.details
                    ? jobMetrics.details.slice(0, 1024)
                    : "`No tracked jobs registered`",
                inline: false,
            },
            {
                name: "Job Errors",
                value: jobMetrics.errors
                    ? jobMetrics.errors.slice(0, 1024)
                    : "`No recent job errors`",
                inline: false,
            },
        );

    const statusMsg = await message.channel.send({ content: "<a:loading:1134882772596957274> Gathering telemetry and rendering UI..." });

    try {
        latestBrowserRenderStats = {
            processes: 0,
            memoryBytes: 0,
            memory: "Rendering",
            label: "Puppeteer render in progress",
        };

        const clasyCommandBuffer = await renderPerformanceStatsClasyCommandImage(data);
        data.browserStats = latestBrowserRenderStats;
        
        performanceEmbed.spliceFields(6, 1, {
            name: "Browser",
            value: [
                `Puppeteer Memory: \`${data.browserStats.memory}\``,
                `Processes: \`${data.browserStats.processes}\``,
                `Sample: \`${data.browserStats.label}\``,
            ].join("\n"),
            inline: true,
        });

        const attachments = [
            new MessageAttachment(clasyCommandBuffer, "performance.png"),
        ];

        await statusMsg.edit({ content: "Here is the performance report:", embeds: [performanceEmbed], files: attachments });
    } catch (error) {
        console.error("Error rendering performance images:", error);
        await statusMsg.edit({ content: "An error occurred while rendering the images. Here is the traditional embed:", embeds: [performanceEmbed] });
    }
}
