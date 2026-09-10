import { randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { SPRITE_STORAGE_NAMESPACE } from "../Fortnite/FortniteSprites/spriteStorage";

const PROJECT_ROOT = process.cwd();
const MAX_QUERY_LENGTH = 100;
const MAX_QUERY_KEY_LENGTH = MAX_QUERY_LENGTH + 2;
const MAX_FIELD_LENGTH = 80;
const MAX_PENDING_KEYS = 1000;
const FLUSH_THRESHOLD = 100;
const FLUSH_INTERVAL_MS = 10_000;

export type AutocompleteMetricOutcome = "success" | "error";

function normalizeNamespace(value: string): string {
    const normalized = (value || "")
        .trim()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 48);
    return normalized || "default";
}

/** Stable branch/deployment namespace used in the metrics filename. */
export const AUTOCOMPLETE_METRICS_NAMESPACE = normalizeNamespace(
    process.env.AUTOCOMPLETE_METRICS_NAMESPACE || SPRITE_STORAGE_NAMESPACE,
);

/**
 * The JSON file is kept in the dedicated telemetry volume by default. A
 * custom absolute or relative path is available for a host bind mount.
 */
export const AUTOCOMPLETE_METRICS_PATH = process.env.AUTOCOMPLETE_METRICS_PATH?.trim()
    ? path.resolve(process.env.AUTOCOMPLETE_METRICS_PATH)
    : path.join(PROJECT_ROOT, ".telemetry", "autocomplete", `${AUTOCOMPLETE_METRICS_NAMESPACE}.json`);

export type AutocompleteUsernameHistory = {
    username: string;
    firstSeenAt: string;
    lastSeenAt: string;
    requests: number;
};

export interface AutocompleteMetricEvent {
    surface: string;
    command: string;
    option: string;
    query: unknown;
    username?: unknown;
    resultCount?: number;
    durationMs?: number;
    outcome?: AutocompleteMetricOutcome;
    dataReady?: boolean;
    loadingResponse?: boolean;
    responseMode?: string;
}

export interface AutocompleteMetricRow {
    namespace: string;
    surface: string;
    command: string;
    option: string;
    queryKey: string;
    query: string;
    queryLength: number;
    firstSeenAt: string;
    lastSeenAt: string;
    requests: number;
    successfulResponses: number;
    failedResponses: number;
    emptyQueryRequests: number;
    zeroResultRequests: number;
    catalogReadyRequests: number;
    notReadyRequests: number;
    loadingResponses: number;
    resultCountTotal: number;
    maxResultCount: number;
    durationTotalMs: number;
    maxDurationMs: number;
    lastResultCount: number;
    lastDurationMs: number;
    lastOutcome: AutocompleteMetricOutcome;
    lastResponseMode: string;
    lastUsername?: string;
    /** Derived from usernameHistory for the UI/JSON response. */
    usernames?: string[];
    usernameHistory?: AutocompleteUsernameHistory[];
    /** Read only when migrating the first username-enabled file format. */
    recentUsernames?: string[];
}

export interface AutocompleteMetricsSnapshot {
    available: boolean;
    namespace: string;
    generatedAt: string;
    pendingKeys: number;
    totals: {
        queries: number;
        requests: number;
        successfulResponses: number;
        failedResponses: number;
        zeroResultRequests: number;
        resultCountTotal: number;
        durationTotalMs: number;
    };
    rows: AutocompleteMetricRow[];
    error?: string;
}

type MetricTotals = AutocompleteMetricsSnapshot["totals"];

interface PendingUsername {
    username: string;
    firstSeenAt: Date;
    lastSeenAt: Date;
    requests: number;
}

interface PendingMetric {
    namespace: string;
    surface: string;
    command: string;
    option: string;
    queryKey: string;
    query: string;
    queryLength: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    requests: number;
    successfulResponses: number;
    failedResponses: number;
    emptyQueryRequests: number;
    zeroResultRequests: number;
    catalogReadyRequests: number;
    notReadyRequests: number;
    loadingResponses: number;
    resultCountTotal: number;
    maxResultCount: number;
    durationTotalMs: number;
    maxDurationMs: number;
    lastResultCount: number;
    lastDurationMs: number;
    lastOutcome: AutocompleteMetricOutcome;
    lastResponseMode: string;
    lastUsername: string;
    usernames: Map<string, PendingUsername>;
}

interface StoredMetricsFile {
    schemaVersion: 1;
    namespace: string;
    generatedAt: string;
    totals: MetricTotals;
    rows: AutocompleteMetricRow[];
}

function emptyTotals(): MetricTotals {
    return {
        queries: 0,
        requests: 0,
        successfulResponses: 0,
        failedResponses: 0,
        zeroResultRequests: 0,
        resultCountTotal: 0,
        durationTotalMs: 0,
    };
}

function cleanField(value: unknown, fallback: string, maxLength = MAX_FIELD_LENGTH): string {
    const clean = String(value ?? fallback)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
    return clean || fallback;
}

export function normalizeAutocompleteQuery(value: unknown): { query: string; queryKey: string; queryLength: number } {
    const query = String(value ?? "")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_QUERY_LENGTH);
    return {
        query,
        queryKey: query ? `q:${query.toLowerCase()}` : "q:",
        queryLength: query.length,
    };
}

function safeCount(value: unknown): number {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(0, Math.min(100, Math.floor(count))) : 0;
}

function safeDuration(value: unknown): number {
    const duration = Number(value);
    return Number.isFinite(duration) ? Math.max(0, Math.min(60_000, duration)) : 0;
}

function counterValue(value: unknown): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function validDate(value: unknown): Date | null {
    const date = new Date(typeof value === "number" ? value : String(value ?? ""));
    return Number.isFinite(date.getTime()) ? date : null;
}

function timestampOr(value: unknown, fallback: number): number {
    return validDate(value)?.getTime() ?? fallback;
}

function isoDate(value: unknown, fallback: Date): string {
    return (validDate(value) || fallback).toISOString();
}

function metricKey(metric: Pick<PendingMetric, "namespace" | "surface" | "command" | "option" | "queryKey">): string {
    return [metric.namespace, metric.surface, metric.command, metric.option, metric.queryKey].join("\u001f");
}

function rowKey(row: Pick<AutocompleteMetricRow, "namespace" | "surface" | "command" | "option" | "queryKey">): string {
    return [row.namespace, row.surface, row.command, row.option, row.queryKey].join("\u001f");
}

function newPendingMetric(event: AutocompleteMetricEvent, now: Date): PendingMetric {
    const query = normalizeAutocompleteQuery(event.query);
    return {
        namespace: AUTOCOMPLETE_METRICS_NAMESPACE,
        surface: cleanField(event.surface, "unknown"),
        command: cleanField(event.command, "unknown"),
        option: cleanField(event.option, "unknown"),
        queryKey: query.queryKey,
        query: query.query,
        queryLength: query.queryLength,
        firstSeenAt: now,
        lastSeenAt: now,
        requests: 0,
        successfulResponses: 0,
        failedResponses: 0,
        emptyQueryRequests: 0,
        zeroResultRequests: 0,
        catalogReadyRequests: 0,
        notReadyRequests: 0,
        loadingResponses: 0,
        resultCountTotal: 0,
        maxResultCount: 0,
        durationTotalMs: 0,
        maxDurationMs: 0,
        lastResultCount: 0,
        lastDurationMs: 0,
        lastOutcome: "success",
        lastResponseMode: "search",
        lastUsername: "",
        usernames: new Map(),
    };
}

function rememberUsername(metric: PendingMetric, username: string, now: Date): void {
    if (!username) return;
    const existing = metric.usernames.get(username);
    if (existing) {
        existing.lastSeenAt = now;
        existing.requests++;
        return;
    }
    metric.usernames.set(username, {
        username,
        firstSeenAt: now,
        lastSeenAt: now,
        requests: 1,
    });
}

function mergePendingMetric(target: PendingMetric, source: PendingMetric): void {
    const targetLastSeenAt = target.lastSeenAt.getTime();
    const sourceLastSeenAt = source.lastSeenAt.getTime();
    target.firstSeenAt = new Date(Math.min(target.firstSeenAt.getTime(), source.firstSeenAt.getTime()));
    target.lastSeenAt = new Date(Math.max(target.lastSeenAt.getTime(), source.lastSeenAt.getTime()));
    target.requests += source.requests;
    target.successfulResponses += source.successfulResponses;
    target.failedResponses += source.failedResponses;
    target.emptyQueryRequests += source.emptyQueryRequests;
    target.zeroResultRequests += source.zeroResultRequests;
    target.catalogReadyRequests += source.catalogReadyRequests;
    target.notReadyRequests += source.notReadyRequests;
    target.loadingResponses += source.loadingResponses;
    target.resultCountTotal += source.resultCountTotal;
    target.maxResultCount = Math.max(target.maxResultCount, source.maxResultCount);
    target.durationTotalMs += source.durationTotalMs;
    target.maxDurationMs = Math.max(target.maxDurationMs, source.maxDurationMs);
    if (sourceLastSeenAt >= targetLastSeenAt) {
        target.lastResultCount = source.lastResultCount;
        target.lastDurationMs = source.lastDurationMs;
        target.lastOutcome = source.lastOutcome;
        target.lastResponseMode = source.lastResponseMode;
        if (source.lastUsername) target.lastUsername = source.lastUsername;
    }

    source.usernames.forEach((sourceUser, username) => {
        const targetUser = target.usernames.get(username);
        if (!targetUser) {
            target.usernames.set(username, { ...sourceUser });
            return;
        }
        targetUser.firstSeenAt = new Date(Math.min(targetUser.firstSeenAt.getTime(), sourceUser.firstSeenAt.getTime()));
        targetUser.lastSeenAt = new Date(Math.max(targetUser.lastSeenAt.getTime(), sourceUser.lastSeenAt.getTime()));
        targetUser.requests += sourceUser.requests;
    });
}

function usernameHistoryFromValue(value: unknown): AutocompleteUsernameHistory[] {
    if (!Array.isArray(value)) return [];
    const byUsername = new Map<string, AutocompleteUsernameHistory>();
    for (const entry of value) {
        const rawUsername = typeof entry === "string" ? entry : entry?.username;
        const username = cleanField(rawUsername, "");
        if (!username) continue;
        const now = new Date();
        const firstSeenAt = isoDate(typeof entry === "object" && entry !== null ? (entry as any).firstSeenAt : null, now);
        const lastSeenAt = isoDate(typeof entry === "object" && entry !== null ? (entry as any).lastSeenAt : null, now);
        const requests = Math.max(1, Math.floor(counterValue(typeof entry === "object" && entry !== null ? (entry as any).requests : 1)));
        const existing = byUsername.get(username);
        if (!existing) {
            byUsername.set(username, { username, firstSeenAt, lastSeenAt, requests });
            continue;
        }
        existing.firstSeenAt = new Date(existing.firstSeenAt).getTime() <= new Date(firstSeenAt).getTime() ? existing.firstSeenAt : firstSeenAt;
        existing.lastSeenAt = new Date(existing.lastSeenAt).getTime() >= new Date(lastSeenAt).getTime() ? existing.lastSeenAt : lastSeenAt;
        existing.requests += requests;
    }
    return Array.from(byUsername.values());
}

function pendingUsernameHistory(metric: PendingMetric): AutocompleteUsernameHistory[] {
    return Array.from(metric.usernames.values()).map(user => ({
        username: user.username,
        firstSeenAt: user.firstSeenAt.toISOString(),
        lastSeenAt: user.lastSeenAt.toISOString(),
        requests: user.requests,
    }));
}

function normalizeStoredRow(raw: any): AutocompleteMetricRow | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const query = normalizeAutocompleteQuery(raw.query);
    const surface = cleanField(raw.surface, "unknown");
    const command = cleanField(raw.command, "unknown");
    const option = cleanField(raw.option, "unknown");
    const now = new Date();
    const history = usernameHistoryFromValue(raw.usernameHistory || raw.usernames || raw.recentUsernames);
    const row: AutocompleteMetricRow = {
        namespace: AUTOCOMPLETE_METRICS_NAMESPACE,
        surface,
        command,
        option,
        queryKey: cleanField(raw.queryKey, query.queryKey, MAX_QUERY_KEY_LENGTH),
        query: query.query,
        queryLength: query.queryLength,
        firstSeenAt: isoDate(raw.firstSeenAt, now),
        lastSeenAt: isoDate(raw.lastSeenAt, now),
        requests: counterValue(raw.requests),
        successfulResponses: counterValue(raw.successfulResponses),
        failedResponses: counterValue(raw.failedResponses),
        emptyQueryRequests: counterValue(raw.emptyQueryRequests),
        zeroResultRequests: counterValue(raw.zeroResultRequests),
        catalogReadyRequests: counterValue(raw.catalogReadyRequests),
        notReadyRequests: counterValue(raw.notReadyRequests),
        loadingResponses: counterValue(raw.loadingResponses),
        resultCountTotal: counterValue(raw.resultCountTotal),
        maxResultCount: counterValue(raw.maxResultCount),
        durationTotalMs: counterValue(raw.durationTotalMs),
        maxDurationMs: counterValue(raw.maxDurationMs),
        lastResultCount: counterValue(raw.lastResultCount),
        lastDurationMs: counterValue(raw.lastDurationMs),
        lastOutcome: raw.lastOutcome === "error" ? "error" : "success",
        lastResponseMode: cleanField(raw.lastResponseMode, "search", 40),
        lastUsername: cleanField(raw.lastUsername, "") || undefined,
        usernameHistory: history,
    };
    return row;
}

function createStoredRow(metric: PendingMetric): AutocompleteMetricRow {
    return {
        namespace: metric.namespace,
        surface: metric.surface,
        command: metric.command,
        option: metric.option,
        queryKey: metric.queryKey,
        query: metric.query,
        queryLength: metric.queryLength,
        firstSeenAt: metric.firstSeenAt.toISOString(),
        lastSeenAt: metric.lastSeenAt.toISOString(),
        requests: metric.requests,
        successfulResponses: metric.successfulResponses,
        failedResponses: metric.failedResponses,
        emptyQueryRequests: metric.emptyQueryRequests,
        zeroResultRequests: metric.zeroResultRequests,
        catalogReadyRequests: metric.catalogReadyRequests,
        notReadyRequests: metric.notReadyRequests,
        loadingResponses: metric.loadingResponses,
        resultCountTotal: metric.resultCountTotal,
        maxResultCount: metric.maxResultCount,
        durationTotalMs: metric.durationTotalMs,
        maxDurationMs: metric.maxDurationMs,
        lastResultCount: metric.lastResultCount,
        lastDurationMs: metric.lastDurationMs,
        lastOutcome: metric.lastOutcome,
        lastResponseMode: metric.lastResponseMode,
        lastUsername: metric.lastUsername || undefined,
        usernameHistory: pendingUsernameHistory(metric),
    };
}

function mergeStoredRow(target: AutocompleteMetricRow, source: PendingMetric): void {
    const targetLastSeenAt = timestampOr(target.lastSeenAt, 0);
    const sourceLastSeenAt = source.lastSeenAt.getTime();
    target.firstSeenAt = isoDate(Math.min(timestampOr(target.firstSeenAt, source.firstSeenAt.getTime()), source.firstSeenAt.getTime()), source.firstSeenAt);
    target.lastSeenAt = isoDate(Math.max(targetLastSeenAt, sourceLastSeenAt), source.lastSeenAt);
    target.requests = counterValue(target.requests) + source.requests;
    target.successfulResponses = counterValue(target.successfulResponses) + source.successfulResponses;
    target.failedResponses = counterValue(target.failedResponses) + source.failedResponses;
    target.emptyQueryRequests = counterValue(target.emptyQueryRequests) + source.emptyQueryRequests;
    target.zeroResultRequests = counterValue(target.zeroResultRequests) + source.zeroResultRequests;
    target.catalogReadyRequests = counterValue(target.catalogReadyRequests) + source.catalogReadyRequests;
    target.notReadyRequests = counterValue(target.notReadyRequests) + source.notReadyRequests;
    target.loadingResponses = counterValue(target.loadingResponses) + source.loadingResponses;
    target.resultCountTotal = counterValue(target.resultCountTotal) + source.resultCountTotal;
    target.maxResultCount = Math.max(counterValue(target.maxResultCount), source.maxResultCount);
    target.durationTotalMs = counterValue(target.durationTotalMs) + source.durationTotalMs;
    target.maxDurationMs = Math.max(counterValue(target.maxDurationMs), source.maxDurationMs);
    if (sourceLastSeenAt >= targetLastSeenAt) {
        target.lastResultCount = source.lastResultCount;
        target.lastDurationMs = source.lastDurationMs;
        target.lastOutcome = source.lastOutcome;
        target.lastResponseMode = source.lastResponseMode;
        if (source.lastUsername) target.lastUsername = source.lastUsername;
    }

    const history = usernameHistoryFromValue(target.usernameHistory || target.recentUsernames);
    for (const sourceUser of pendingUsernameHistory(source)) {
        const existing = history.find(user => user.username === sourceUser.username);
        if (!existing) {
            history.push(sourceUser);
            continue;
        }
        existing.firstSeenAt = new Date(existing.firstSeenAt).getTime() <= new Date(sourceUser.firstSeenAt).getTime() ? existing.firstSeenAt : sourceUser.firstSeenAt;
        existing.lastSeenAt = new Date(existing.lastSeenAt).getTime() >= new Date(sourceUser.lastSeenAt).getTime() ? existing.lastSeenAt : sourceUser.lastSeenAt;
        existing.requests += sourceUser.requests;
    }
    target.usernameHistory = history;
    delete target.usernames;
    delete target.recentUsernames;
}

function calculateTotals(rows: AutocompleteMetricRow[]): MetricTotals {
    return rows.reduce((totals, row) => {
        totals.queries++;
        totals.requests += counterValue(row.requests);
        totals.successfulResponses += counterValue(row.successfulResponses);
        totals.failedResponses += counterValue(row.failedResponses);
        totals.zeroResultRequests += counterValue(row.zeroResultRequests);
        totals.resultCountTotal += counterValue(row.resultCountTotal);
        totals.durationTotalMs += counterValue(row.durationTotalMs);
        return totals;
    }, emptyTotals());
}

function emptyStoredFile(): StoredMetricsFile {
    return {
        schemaVersion: 1,
        namespace: AUTOCOMPLETE_METRICS_NAMESPACE,
        generatedAt: new Date(0).toISOString(),
        totals: emptyTotals(),
        rows: [],
    };
}

async function readStoredFile(): Promise<StoredMetricsFile> {
    let content: string;
    try {
        content = await fs.promises.readFile(AUTOCOMPLETE_METRICS_PATH, "utf8");
    } catch (error: any) {
        if (error?.code === "ENOENT") return emptyStoredFile();
        throw error;
    }

    let parsed: any;
    try {
        parsed = JSON.parse(content);
    } catch {
        throw new Error(`Autocomplete metrics file is not valid JSON: ${AUTOCOMPLETE_METRICS_PATH}`);
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.rows)) {
        throw new Error(`Autocomplete metrics file has an invalid shape: ${AUTOCOMPLETE_METRICS_PATH}`);
    }
    if (parsed.namespace && normalizeNamespace(String(parsed.namespace)) !== AUTOCOMPLETE_METRICS_NAMESPACE) {
        throw new Error(`Autocomplete metrics namespace does not match ${AUTOCOMPLETE_METRICS_NAMESPACE}.`);
    }

    const rows = parsed.rows.map(normalizeStoredRow).filter(Boolean) as AutocompleteMetricRow[];
    return {
        schemaVersion: 1,
        namespace: AUTOCOMPLETE_METRICS_NAMESPACE,
        generatedAt: isoDate(parsed.generatedAt, new Date(0)),
        totals: calculateTotals(rows),
        rows,
    };
}

async function writeStoredFile(file: StoredMetricsFile): Promise<void> {
    await fs.promises.mkdir(path.dirname(AUTOCOMPLETE_METRICS_PATH), { recursive: true });
    const temporaryPath = `${AUTOCOMPLETE_METRICS_PATH}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}`;
    let renamed = false;
    try {
        await fs.promises.writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
        try {
            await fs.promises.rename(temporaryPath, AUTOCOMPLETE_METRICS_PATH);
            renamed = true;
        } catch (error: any) {
            // POSIX rename replaces an existing file. Windows refuses that
            // operation, so replace it in the narrow fallback case.
            if (process.platform !== "win32" || !["EEXIST", "EPERM", "ENOTEMPTY"].includes(error?.code)) throw error;
            await fs.promises.unlink(AUTOCOMPLETE_METRICS_PATH).catch((unlinkError: any) => {
                if (unlinkError?.code !== "ENOENT") throw unlinkError;
            });
            await fs.promises.rename(temporaryPath, AUTOCOMPLETE_METRICS_PATH);
            renamed = true;
        }
    } finally {
        if (!renamed) await fs.promises.unlink(temporaryPath).catch(() => undefined);
    }
}

function mergePendingIntoFile(file: StoredMetricsFile, batch: PendingMetric[]): void {
    for (const metric of batch) {
        const existing = file.rows.find(row => rowKey(row) === metricKey(metric));
        if (existing) mergeStoredRow(existing, metric);
        else file.rows.push(createStoredRow(metric));
    }
    file.rows.sort((a, b) => counterValue(b.requests) - counterValue(a.requests)
        || (validDate(b.lastSeenAt)?.getTime() || 0) - (validDate(a.lastSeenAt)?.getTime() || 0));
    file.totals = calculateTotals(file.rows);
    file.generatedAt = new Date().toISOString();
}

const pending = new Map<string, PendingMetric>();
let flushPromise: Promise<void> | null = null;

/**
 * Record in memory and flush in the background. The JSON file is the durable
 * source of truth; the Discord autocomplete response never waits for disk I/O.
 */
export function recordAutocompleteMetric(event: AutocompleteMetricEvent): void {
    try {
        const now = new Date();
        const query = normalizeAutocompleteQuery(event.query);
        const surface = cleanField(event.surface, "unknown");
        const command = cleanField(event.command, "unknown");
        const option = cleanField(event.option, "unknown");
        const key = [AUTOCOMPLETE_METRICS_NAMESPACE, surface, command, option, query.queryKey].join("\u001f");
        let metric = pending.get(key);
        if (!metric) {
            if (pending.size >= MAX_PENDING_KEYS) {
                const oldestKey = pending.keys().next().value as string | undefined;
                if (oldestKey) pending.delete(oldestKey);
            }
            metric = newPendingMetric({ ...event, surface, command, option }, now);
            pending.set(key, metric);
        }

        const resultCount = safeCount(event.resultCount);
        const durationMs = safeDuration(event.durationMs);
        const outcome = event.outcome === "error" ? "error" : "success";
        const responseMode = cleanField(event.responseMode, "search", 40);
        const username = cleanField(event.username, "");

        metric.lastSeenAt = now;
        metric.requests++;
        if (outcome === "success") metric.successfulResponses++;
        else metric.failedResponses++;
        if (!query.query) metric.emptyQueryRequests++;
        if (resultCount === 0) metric.zeroResultRequests++;
        if (event.dataReady === false) metric.notReadyRequests++;
        else metric.catalogReadyRequests++;
        if (event.loadingResponse) metric.loadingResponses++;
        metric.resultCountTotal += resultCount;
        metric.maxResultCount = Math.max(metric.maxResultCount, resultCount);
        metric.durationTotalMs += durationMs;
        metric.maxDurationMs = Math.max(metric.maxDurationMs, durationMs);
        metric.lastResultCount = resultCount;
        metric.lastDurationMs = durationMs;
        metric.lastOutcome = outcome;
        metric.lastResponseMode = responseMode;
        if (username) {
            metric.lastUsername = username;
            rememberUsername(metric, username, now);
        }

        if (pending.size === FLUSH_THRESHOLD) void flushAutocompleteMetrics();
    } catch (error: any) {
        // Analytics must never turn an autocomplete interaction into an error.
        console.warn("[AutocompleteMetrics] Could not record event:", error?.message || error);
    }
}

async function flushPendingMetrics(): Promise<void> {
    if (!pending.size) return;
    const batch = Array.from(pending.values());
    pending.clear();
    try {
        const file = await readStoredFile();
        mergePendingIntoFile(file, batch);
        await writeStoredFile(file);
    } catch (error) {
        for (const metric of batch) {
            const key = metricKey(metric);
            const current = pending.get(key);
            if (current) mergePendingMetric(current, metric);
            else if (pending.size < MAX_PENDING_KEYS) pending.set(key, metric);
        }
        throw error;
    }
}

/** Flush currently buffered counters, used by graceful shutdown and the page. */
export function flushAutocompleteMetrics(): Promise<void> {
    if (!flushPromise) {
        flushPromise = flushPendingMetrics()
            .catch(error => console.warn("[AutocompleteMetrics] Flush failed:", error?.message || error))
            .finally(() => { flushPromise = null; });
    }
    return flushPromise;
}

function uniqueUsernames(values: unknown[]): string[] {
    return values
        .map(value => String(value || "").trim())
        .filter((value, index, all) => value && all.indexOf(value) === index);
}

export async function getAutocompleteMetricsSnapshot(): Promise<AutocompleteMetricsSnapshot> {
    await flushAutocompleteMetrics();
    const file = await readStoredFile();
    const rows = file.rows.map(row => {
        const usernameHistory = usernameHistoryFromValue(row.usernameHistory);
        return {
            ...row,
            usernameHistory,
            usernames: uniqueUsernames([
                ...usernameHistory.map(user => user.username),
                ...(Array.isArray(row.recentUsernames) ? row.recentUsernames : []),
                row.lastUsername || "",
            ])
        };
    });
    return {
        available: true,
        namespace: file.namespace,
        generatedAt: file.generatedAt,
        pendingKeys: pending.size,
        totals: file.totals,
        rows,
    };
}

const flushTimer = setInterval(() => { void flushAutocompleteMetrics(); }, FLUSH_INTERVAL_MS);
if (typeof (flushTimer as any).unref === "function") (flushTimer as any).unref();
