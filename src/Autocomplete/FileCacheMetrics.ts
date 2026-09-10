import * as fs from "fs";
import * as path from "path";
import { AUTOCOMPLETE_METRICS_PATH } from "./AutocompleteMetrics";
import { getSpriteArchiveBackupDirectory } from "../Fortnite/FortniteSprites/spriteArchiveBackup";
import { SPRITE_STORAGE_NAMESPACE } from "../Fortnite/FortniteSprites/spriteStorage";

const PROJECT_ROOT = process.cwd();
const CACHE_ROOT = path.join(PROJECT_ROOT, ".cache");
const LEGACY_SPRITE_CACHE_ROOT = path.join(CACHE_ROOT, "fortnite-sprites");
const SPRITE_CACHE_ROOT = path.join(CACHE_ROOT, "fortnite-sprites", SPRITE_STORAGE_NAMESPACE);
const SPRITE_SOURCE_DATA_PATH = path.join(PROJECT_ROOT, "src", "Fortnite", "FortniteSprites", "spriteData.json");
const SPRITE_ARCHIVE_ROOT = process.env.FORTNITE_SPRITE_ARCHIVE_DIR
    ? path.resolve(process.env.FORTNITE_SPRITE_ARCHIVE_DIR)
    : path.join(SPRITE_CACHE_ROOT, "archives");
const SPRITE_BUNDLED_ARCHIVE_ROOT = path.join(PROJECT_ROOT, "sprite-archives");
const SPRITE_BACKUP_ROOT = getSpriteArchiveBackupDirectory();
const SPRITE_HISTORY_PATH = process.env.FORTNITE_SPRITE_HISTORY_PATH
    ? path.resolve(process.env.FORTNITE_SPRITE_HISTORY_PATH)
    : path.join(SPRITE_ARCHIVE_ROOT, "spriteHistory.json");
const SPRITE_ASSET_CACHE_ROOT = process.env.FORTNITE_SPRITE_ASSET_CACHE_DIR
    ? path.resolve(process.env.FORTNITE_SPRITE_ASSET_CACHE_DIR)
    : path.join(SPRITE_CACHE_ROOT, "assets");
const SPRITE_RENDER_CACHE_ROOT = path.join(SPRITE_CACHE_ROOT, "renders");
const SPRITE_TELEMETRY_ROOT = process.env.FORTNITE_SPRITE_TELEMETRY_DIR
    ? path.resolve(process.env.FORTNITE_SPRITE_TELEMETRY_DIR)
    : path.join(SPRITE_CACHE_ROOT, "telemetry");
const MAP_ROOT = path.join(PROJECT_ROOT, "src", "Fortnite", "FortniteMap");
const MAP_DATA_PATH = path.join(MAP_ROOT, "mapData.json");
const MAP_HISTORY_PATH = path.join(MAP_ROOT, "mapHistory.json");
const MAP_IMAGE_MANIFEST_PATH = path.join(MAP_ROOT, "mapImageManifest.json");
const MAP_ASSET_ROOT = path.join(PROJECT_ROOT, "assets", "fortnite-maps");
const MISSING_TELEMETRY_ROOT = path.join(CACHE_ROOT, "missing-cosmetics", "telemetry");
const LOGO_PATH = path.join(PROJECT_ROOT, "assets", "creeper-bot-logo.png");

const MAX_JSON_BYTES = 32 * 1024 * 1024;
const MAX_JSONL_READ_BYTES = 16 * 1024 * 1024;
const MAX_TREE_FILES = 30_000;
const MAX_TELEMETRY_FILES = 5_000;
const MAX_RECENT_EVENTS = 100;
const MAX_ARCHIVES_PER_ROOT = 250;
const MAX_CACHE_FINGERPRINTS = 250;

export type FileStoreStatus = "present" | "missing" | "error";

export type DirectorySummary = {
    path: string;
    status: FileStoreStatus;
    files: number;
    directories: number;
    bytes: number;
    modifiedAt: string | null;
    truncated: boolean;
    filesByExtension: Record<string, number>;
    error?: string;
};

export type FileStoreSummary = {
    id: string;
    label: string;
    path: string;
    status: FileStoreStatus;
    sizeBytes: number;
    modifiedAt: string | null;
    details: Record<string, unknown>;
    error?: string;
};

export type JsonlFileSummary = {
    name: string;
    path: string;
    sizeBytes: number;
    modifiedAt: string | null;
    events: number;
    invalidLines: number;
    truncated: boolean;
};

export type JsonlSnapshot<T> = {
    directory: DirectorySummary;
    files: JsonlFileSummary[];
    skippedFiles: number;
    totalFiles: number;
    totalBytes: number;
    totalLines: number;
    totalEvents: number;
    invalidLines: number;
    oldestAt: string | null;
    newestAt: string | null;
    byType: Record<string, number>;
    byOutcome: Record<string, number>;
    byTypeOutcome: Record<string, Record<string, number>>;
    byTypeBoolean: Record<string, Record<string, number>>;
    numericTotals: Record<string, number>;
    numericCounts: Record<string, number>;
    byTypeNumericTotals: Record<string, Record<string, number>>;
    byTypeNumericCounts: Record<string, Record<string, number>>;
    booleanCounts: Record<string, number>;
    recent: T[];
};

export type SpriteTelemetryEvent = Record<string, unknown>;

export type SpriteTelemetrySnapshot = JsonlSnapshot<SpriteTelemetryEvent> & {
    renderEvents: number;
    renderFailures: number;
    assetEvents: number;
    assetFailures: number;
    assetSyncEvents: number;
    assetSyncFailures: number;
    catalogSyncEvents: number;
    catalogSyncFailures: number;
    renderGenerationEvents: number;
    changedCatalogEvents: number;
};

export type MissingTelemetryEvent = Record<string, unknown>;

export type MissingTelemetrySnapshot = JsonlSnapshot<MissingTelemetryEvent> & {
    successfulReports: number;
    failedReports: number;
    fallbackReports: number;
    cachedReports: number;
};

export type SpriteArchiveSummary = {
    name: string;
    path: string;
    status: FileStoreStatus;
    modifiedAt: string | null;
    manifestStatus: FileStoreStatus;
    season: string | null;
    seasonId: string | null;
    archivedAt: string | null;
    familyCount: number | null;
    spriteCount: number | null;
    assetCount: number | null;
    totalAssetBytes: number | null;
    missingAssetCount: number | null;
    schemaVersion: number | null;
    error?: string;
};

export type SpriteArchiveRootSummary = {
    label: string;
    path: string;
    directory: DirectorySummary;
    archives: SpriteArchiveSummary[];
};

export type SpriteFingerprintCacheSummary = {
    fingerprint: string;
    path: string;
    status: FileStoreStatus;
    manifestStatus: FileStoreStatus;
    schemaVersion: number | null;
    dataFingerprint: string | null;
    uiFingerprint?: string | null;
    entries: number | null;
    diskFiles: number;
    diskBytes: number;
    modifiedAt: string | null;
    completedTasks?: number | null;
    failedTasks?: number | null;
    error?: string;
};

export type SpriteCacheSnapshot = {
    root: DirectorySummary;
    dataFiles: FileStoreSummary[];
    historyFiles: FileStoreSummary[];
    archiveRoots: SpriteArchiveRootSummary[];
    assetCache: {
        path: string;
        directory: DirectorySummary;
        fingerprints: SpriteFingerprintCacheSummary[];
    };
    renderCache: {
        path: string;
        directory: DirectorySummary;
        fingerprints: SpriteFingerprintCacheSummary[];
    };
    telemetry: SpriteTelemetrySnapshot;
};

export type MapCacheSnapshot = {
    files: FileStoreSummary[];
    assets: DirectorySummary;
};

export type FileCacheSnapshot = {
    generatedAt: string;
    namespace: string;
    environment: {
        platform: string;
        nodeEnv: string;
        productionRenderCacheEnabled: boolean;
    };
    cacheRoot: DirectorySummary;
    cacheChildren: Array<DirectorySummary & { name: string }>;
    sprite: SpriteCacheSnapshot;
    maps: MapCacheSnapshot;
    missingCosmetics: MissingTelemetrySnapshot;
    autocomplete: FileStoreSummary;
    persistentAssets: FileStoreSummary[];
};

function displayPath(filePath: string): string {
    const absolute = path.resolve(filePath);
    const relative = path.relative(PROJECT_ROOT, absolute);
    if (!relative) return ".";
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
        return `./${relative.replace(/\\/g, "/")}`;
    }
    return absolute.replace(/\\/g, "/");
}

function finiteNumber(value: unknown, fallback = 0): number {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value: unknown): number {
    return Math.max(0, finiteNumber(value));
}

function integerOrNull(value: unknown): number | null {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function cleanText(value: unknown, fallback = "", maxLength = 180): string {
    return String(value ?? fallback)
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxLength);
}

function cleanMetricKey(value: unknown, fallback: string): string {
    const cleaned = cleanText(value, fallback, 80).toLowerCase();
    if (!cleaned || cleaned === "__proto__" || cleaned === "constructor" || cleaned === "prototype") return fallback;
    return cleaned;
}

function shortFingerprint(value: unknown): string | null {
    const cleaned = cleanText(value, "", 128);
    return cleaned ? cleaned.slice(0, 16) : null;
}

function validIsoDate(value: unknown): string | null {
    const date = new Date(String(value || ""));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function newestDate(current: string | null, candidate: string | null): string | null {
    if (!candidate) return current;
    if (!current) return candidate;
    return new Date(candidate).getTime() > new Date(current).getTime() ? candidate : current;
}

function oldestDate(current: string | null, candidate: string | null): string | null {
    if (!candidate) return current;
    if (!current) return candidate;
    return new Date(candidate).getTime() < new Date(current).getTime() ? candidate : current;
}

async function inspectPath(filePath: string): Promise<{
    status: FileStoreStatus;
    sizeBytes: number;
    modifiedAt: string | null;
    kind: "file" | "directory" | null;
    error?: string;
}> {
    try {
        const stat = await fs.promises.stat(filePath);
        if (stat.isFile()) {
            return { status: "present", sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString(), kind: "file" };
        }
        if (stat.isDirectory()) {
            return { status: "present", sizeBytes: 0, modifiedAt: stat.mtime.toISOString(), kind: "directory" };
        }
        return { status: "error", sizeBytes: 0, modifiedAt: stat.mtime.toISOString(), kind: null, error: "Unsupported filesystem entry." };
    } catch (error: any) {
        if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
            return { status: "missing", sizeBytes: 0, modifiedAt: null, kind: null };
        }
        return { status: "error", sizeBytes: 0, modifiedAt: null, kind: null, error: cleanText(error?.message || error, "Could not inspect path.") };
    }
}

function emptyDirectory(filePath: string, status: FileStoreStatus = "missing", error?: string): DirectorySummary {
    return {
        path: displayPath(filePath),
        status,
        files: 0,
        directories: 0,
        bytes: 0,
        modifiedAt: null,
        truncated: false,
        filesByExtension: {},
        ...(error ? { error } : {})
    };
}

async function scanDirectory(filePath: string): Promise<DirectorySummary> {
    const inspected = await inspectPath(filePath);
    if (inspected.status !== "present") return emptyDirectory(filePath, inspected.status, inspected.error);
    if (inspected.kind !== "directory") return emptyDirectory(filePath, "error", "Expected a directory.");

    const result: DirectorySummary = {
        path: displayPath(filePath),
        status: "present",
        files: 0,
        directories: 0,
        bytes: 0,
        modifiedAt: inspected.modifiedAt,
        truncated: false,
        filesByExtension: {}
    };

    async function walk(current: string): Promise<void> {
        if (result.files >= MAX_TREE_FILES) {
            result.truncated = true;
            return;
        }

        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(current, { withFileTypes: true });
        } catch (error: any) {
            result.status = "error";
            result.error = cleanText(error?.message || error, "Could not read directory.");
            return;
        }

        for (const entry of entries) {
            if (result.files >= MAX_TREE_FILES) {
                result.truncated = true;
                return;
            }
            if (entry.isSymbolicLink()) continue;
            const child = path.join(current, entry.name);
            if (entry.isDirectory()) {
                result.directories++;
                await walk(child);
                continue;
            }
            if (!entry.isFile()) continue;
            try {
                const stat = await fs.promises.stat(child);
                result.files++;
                result.bytes += stat.size;
                result.modifiedAt = newestDate(result.modifiedAt, stat.mtime.toISOString());
                const extension = path.extname(entry.name).toLowerCase() || "[no extension]";
                result.filesByExtension[extension] = (result.filesByExtension[extension] || 0) + 1;
            } catch {
                // A file can disappear while the dashboard is scanning. It is
                // safer to omit that one entry than fail the entire page.
            }
        }
    }

    await walk(filePath);
    return result;
}

async function listChildDirectories(root: string): Promise<Array<DirectorySummary & { name: string }>> {
    try {
        const entries = await fs.promises.readdir(root, { withFileTypes: true });
        const directories = entries.filter(entry => entry.isDirectory() && !entry.name.startsWith("."));
        const summaries = await Promise.all(directories.map(async entry => ({
            ...(await scanDirectory(path.join(root, entry.name))),
            name: entry.name
        })));
        return summaries.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        return [];
    }
}

async function readJsonValue(filePath: string): Promise<{ inspected: Awaited<ReturnType<typeof inspectPath>>; value?: any; error?: string }> {
    const inspected = await inspectPath(filePath);
    if (inspected.status !== "present") return { inspected, error: inspected.error };
    if (inspected.kind !== "file") return { inspected, error: "Expected a JSON file." };
    if (inspected.sizeBytes > MAX_JSON_BYTES) return { inspected, error: `File is larger than the ${MAX_JSON_BYTES.toLocaleString("en-US")} byte read limit.` };
    try {
        return { inspected, value: JSON.parse(await fs.promises.readFile(filePath, "utf8")) };
    } catch (error: any) {
        return { inspected, error: cleanText(error?.message || error, "Invalid JSON.") };
    }
}

async function readJsonStore(
    id: string,
    label: string,
    filePath: string,
    summarize: (value: any) => Record<string, unknown> = () => ({})
): Promise<FileStoreSummary> {
    const parsed = await readJsonValue(filePath);
    const base: FileStoreSummary = {
        id,
        label,
        path: displayPath(filePath),
        status: parsed.inspected.status,
        sizeBytes: parsed.inspected.sizeBytes,
        modifiedAt: parsed.inspected.modifiedAt,
        details: {}
    };
    if (parsed.inspected.status !== "present") {
        if (parsed.error) base.error = parsed.error;
        return base;
    }
    if (parsed.error) {
        base.status = "error";
        base.error = parsed.error;
        return base;
    }
    try {
        base.details = summarize(parsed.value);
    } catch (error: any) {
        base.status = "error";
        base.error = cleanText(error?.message || error, "Could not summarize JSON.");
    }
    return base;
}

function arrayValue(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.data)) return value.data;
    return [];
}

function summarizeSpriteData(value: any): Record<string, unknown> {
    const families = Array.isArray(value?.families) ? value.families : [];
    const variants = families.flatMap((family: any) => Array.isArray(family?.variants) ? family.variants : []);
    return {
        fetchedAt: validIsoDate(value?.fetchedAt),
        season: cleanText(value?.seasonContext?.displayName, "Unknown season", 120),
        seasonId: cleanText(value?.seasonContext?.id, "", 100) || null,
        seasonKey: cleanText(value?.seasonContext?.seasonKey, "", 40) || null,
        families: families.length,
        variants: variants.length,
        totalSprites: nonNegativeNumber(value?.totalSprites),
        totalLevels: nonNegativeNumber(value?.totalLevels),
        listedVariantIds: Array.isArray(value?.listedVariantIds) ? value.listedVariantIds.length : null,
        contentFingerprint: shortFingerprint(value?.contentFingerprint)
    };
}

function summarizeSpriteHistory(value: any): Record<string, unknown> {
    const records = Array.isArray(value?.records) ? value.records : [];
    const seasonIds = new Set<string>();
    let appearances = 0;
    let newestAppearance: string | null = null;
    for (const record of records) {
        for (const appearance of Array.isArray(record?.appearances) ? record.appearances : []) {
            appearances++;
            const seasonId = cleanText(appearance?.seasonId, "", 100);
            if (seasonId) seasonIds.add(seasonId);
            newestAppearance = newestDate(newestAppearance, validIsoDate(appearance?.lastSeenAt));
        }
    }
    return {
        schemaVersion: integerOrNull(value?.schemaVersion),
        records: records.length,
        seasons: seasonIds.size,
        appearances,
        newestAppearance
    };
}

function summarizeMapData(value: any): Record<string, unknown> {
    const entries = arrayValue(value);
    const chapters = new Set<number>();
    const seasons = new Set<string>();
    let images = 0;
    let pois = 0;
    for (const entry of entries) {
        const chapter = Number(entry?.chapter);
        if (Number.isFinite(chapter)) chapters.add(chapter);
        const season = cleanText(entry?.season, "", 40);
        if (season) seasons.add(season);
        if (entry?.hasImage) images++;
        if (Array.isArray(entry?.pois) && entry.pois.length > 0) pois++;
    }
    return {
        records: entries.length,
        latestVersion: cleanText(entries[0]?.version, "", 80) || null,
        chapters: chapters.size,
        seasons: seasons.size,
        versionsWithImages: images,
        versionsWithPois: pois
    };
}

function summarizeMapImageManifest(value: any): Record<string, unknown> {
    const versions = value?.versions && typeof value.versions === "object" ? Object.values(value.versions) as any[] : [];
    return {
        generatedAt: validIsoDate(value?.generatedAt),
        source: cleanText(value?.source, "", 180) || null,
        versions: versions.length,
        declaredCount: nonNegativeNumber(value?.count),
        uploaded: versions.filter(entry => Boolean(entry?.discordUrl)).length,
        localAssets: versions.filter(entry => Boolean(entry?.relativePath)).length,
        latestUploadedAt: versions.reduce<string | null>((latest, entry) => newestDate(latest, validIsoDate(entry?.uploadedAt)), null)
    };
}

function summarizeAutocompleteMetrics(value: any): Record<string, unknown> {
    const rows = Array.isArray(value?.rows) ? value.rows : [];
    const usernames = rows.reduce((total: number, row: any) => {
        const history = Array.isArray(row?.usernameHistory)
            ? row.usernameHistory
            : Array.isArray(row?.usernames) ? row.usernames : [];
        return total + history.length;
    }, 0);
    return {
        schemaVersion: integerOrNull(value?.schemaVersion),
        namespace: cleanText(value?.namespace, "", 80) || null,
        generatedAt: validIsoDate(value?.generatedAt),
        queries: rows.length,
        requests: nonNegativeNumber(value?.totals?.requests),
        usernames
    };
}

function redactError(value: unknown): string {
    return cleanText(value, "", 240).replace(/\b\d{15,20}\b/g, "[id]");
}

const NUMERIC_TELEMETRY_FIELDS = [
    "durationMs", "pageQueueWaitMs", "renderedPixels", "chromiumMemoryBytes",
    "spriteListPagesFetched", "detailPagesDiscovered", "detailPagesAttempted",
    "detailPagesComplete", "detailPagesPartial", "historicalDetailPagesChecked",
    "changedVariants", "checked", "failed", "total", "completed", "remaining",
    "screensPerSecond", "processedPerSecond", "averageTaskDurationMs",
    "lastTaskDurationMs", "renderedBytes", "cachedAtStart", "estimatedRemainingMs",
    "minimum", "historyMs", "indexMs", "calculationMs", "renderMs", "deliveryMs",
    "cleanupMs", "totalMs", "items", "imageBytes"
];

function safeTelemetryEvent(raw: Record<string, any>, timestamp: string | null): Record<string, unknown> {
    const safe: Record<string, unknown> = { timestamp, type: cleanMetricKey(raw.type, "record") };
    const textFields = [
        "outcome", "phase", "source", "scope", "trigger", "currentSeason", "seasonKey",
        "reason", "current", "command", "view", "appVersion", "username",
        "initiatedByUsername", "interactedByUsername"
    ];
    for (const field of textFields) {
        if (raw[field] == null) continue;
        const value = cleanText(raw[field], "", field === "current" ? 180 : 100);
        if (value) safe[field] = value;
    }
    for (const field of NUMERIC_TELEMETRY_FIELDS) {
        if (raw[field] == null) continue;
        const value = finiteNumber(raw[field], NaN);
        if (Number.isFinite(value)) safe[field] = Math.max(0, value);
    }
    for (const field of ["changed", "cached", "reusedExistingCache"]) {
        if (typeof raw[field] === "boolean") safe[field] = raw[field];
    }
    if (raw.error) safe.error = redactError(raw.error);
    return safe;
}

function safeMissingEvent(raw: Record<string, any>, timestamp: string | null): Record<string, unknown> {
    const safe = safeTelemetryEvent({ ...raw, type: "missing-cosmetics" }, timestamp);
    delete safe.appVersion;
    delete safe.command;
    delete safe.view;
    return safe;
}

async function readTailText(filePath: string, sizeBytes: number): Promise<{ text: string; truncated: boolean }> {
    if (sizeBytes <= MAX_JSONL_READ_BYTES) {
        return { text: await fs.promises.readFile(filePath, "utf8"), truncated: false };
    }
    const start = sizeBytes - MAX_JSONL_READ_BYTES;
    const handle = await fs.promises.open(filePath, "r");
    try {
        const buffer = Buffer.alloc(MAX_JSONL_READ_BYTES);
        const result = await handle.read(buffer, 0, buffer.length, start);
        return { text: buffer.subarray(0, result.bytesRead).toString("utf8"), truncated: true };
    } finally {
        await handle.close();
    }
}

type JsonlMapper<T> = (raw: Record<string, any>, timestamp: string | null) => T;

async function readJsonlDirectory<T>(
    directory: string,
    mapEvent: JsonlMapper<T>,
    classifyType: (raw: Record<string, any>) => string,
    classifyOutcome: (raw: Record<string, any>) => string | null
): Promise<JsonlSnapshot<T>> {
    const directorySummary = await scanDirectory(directory);
    const empty: JsonlSnapshot<T> = {
        directory: directorySummary,
        files: [],
        skippedFiles: 0,
        totalFiles: 0,
        totalBytes: directorySummary.bytes,
        totalLines: 0,
        totalEvents: 0,
        invalidLines: 0,
        oldestAt: null,
        newestAt: null,
        byType: {},
        byOutcome: {},
        byTypeOutcome: {},
        byTypeBoolean: {},
        numericTotals: {},
        numericCounts: {},
        byTypeNumericTotals: {},
        byTypeNumericCounts: {},
        booleanCounts: {},
        recent: []
    };
    if (directorySummary.status !== "present") return empty;

    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (error: any) {
        return { ...empty, directory: { ...directorySummary, status: "error", error: cleanText(error?.message || error, "Could not read telemetry directory.") } };
    }
    const telemetryFiles = entries
        .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith(".jsonl"))
        .sort((a, b) => b.name.localeCompare(a.name));
    const filesToRead = telemetryFiles.slice(0, MAX_TELEMETRY_FILES);
    const result: JsonlSnapshot<T> = {
        ...empty,
        totalFiles: telemetryFiles.length,
        skippedFiles: Math.max(0, telemetryFiles.length - filesToRead.length),
        // This is the exact directory byte total from the bounded directory
        // scan, even if the number of daily files ever exceeds the read cap.
        totalBytes: directorySummary.bytes
    };
    const recent: Array<{ timestamp: string | null; event: T }> = [];

    for (const entry of filesToRead) {
        const filePath = path.join(directory, entry.name);
        const inspected = await inspectPath(filePath);
        if (inspected.status !== "present") continue;
        let content: { text: string; truncated: boolean };
        try {
            content = await readTailText(filePath, inspected.sizeBytes);
        } catch {
            result.invalidLines++;
            continue;
        }
        const lines = content.text.split(/\r?\n/);
        let eventsInFile = 0;
        let invalidInFile = 0;
        for (let index = 0; index < lines.length; index++) {
            if (content.truncated && index === 0) continue;
            const line = lines[index].trim();
            if (!line) continue;
            result.totalLines++;
            let raw: Record<string, any>;
            try {
                const parsed = JSON.parse(line);
                if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Telemetry record is not an object.");
                raw = parsed;
            } catch {
                result.invalidLines++;
                invalidInFile++;
                continue;
            }
            eventsInFile++;
            result.totalEvents++;
            const timestamp = validIsoDate(raw.timestamp);
            result.oldestAt = oldestDate(result.oldestAt, timestamp);
            result.newestAt = newestDate(result.newestAt, timestamp);

            const type = cleanMetricKey(classifyType(raw), "record");
            result.byType[type] = (result.byType[type] || 0) + 1;
            const outcome = classifyOutcome(raw);
            if (outcome) {
                const outcomeKey = cleanMetricKey(outcome, "unknown");
                result.byOutcome[outcomeKey] = (result.byOutcome[outcomeKey] || 0) + 1;
                if (!result.byTypeOutcome[type]) result.byTypeOutcome[type] = {};
                result.byTypeOutcome[type][outcomeKey] = (result.byTypeOutcome[type][outcomeKey] || 0) + 1;
            }

            for (const field of NUMERIC_TELEMETRY_FIELDS) {
                const value = finiteNumber(raw[field], NaN);
                if (!Number.isFinite(value)) continue;
                result.numericTotals[field] = (result.numericTotals[field] || 0) + Math.max(0, value);
                result.numericCounts[field] = (result.numericCounts[field] || 0) + 1;
                if (!result.byTypeNumericTotals[type]) result.byTypeNumericTotals[type] = {};
                if (!result.byTypeNumericCounts[type]) result.byTypeNumericCounts[type] = {};
                result.byTypeNumericTotals[type][field] = (result.byTypeNumericTotals[type][field] || 0) + Math.max(0, value);
                result.byTypeNumericCounts[type][field] = (result.byTypeNumericCounts[type][field] || 0) + 1;
            }
            for (const field of ["changed", "cached", "reusedExistingCache"]) {
                if (raw[field] !== true) continue;
                result.booleanCounts[field] = (result.booleanCounts[field] || 0) + 1;
                if (!result.byTypeBoolean[type]) result.byTypeBoolean[type] = {};
                result.byTypeBoolean[type][field] = (result.byTypeBoolean[type][field] || 0) + 1;
            }

            recent.push({ timestamp, event: mapEvent(raw, timestamp) });
            // Keep the web request bounded even if a deployment has years of
            // telemetry. The final sort below still gives the newest records.
            if (recent.length > MAX_RECENT_EVENTS * 2) {
                recent.sort((a, b) => {
                    const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                    const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                    return bTime - aTime;
                });
                recent.splice(MAX_RECENT_EVENTS);
            }
        }
        result.files.push({
            name: entry.name,
            path: displayPath(filePath),
            sizeBytes: inspected.sizeBytes,
            modifiedAt: inspected.modifiedAt,
            events: eventsInFile,
            invalidLines: invalidInFile,
            truncated: content.truncated
        });
    }

    recent.sort((a, b) => {
        const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return bTime - aTime;
    });
    result.recent = recent.slice(0, MAX_RECENT_EVENTS).map(entry => entry.event);
    return result;
}

async function readSpriteTelemetry(): Promise<SpriteTelemetrySnapshot> {
    const base = await readJsonlDirectory(
        SPRITE_TELEMETRY_ROOT,
        safeTelemetryEvent,
        raw => String(raw.type || "record"),
        raw => raw.outcome == null
            ? (raw.error ? "failure" : raw.phase == null
                ? (raw.type === "asset-sync" && nonNegativeNumber(raw.failed) > 0 ? "failure" : null)
                : String(raw.phase))
            : String(raw.outcome)
    );
    const typeOutcomes = base.byTypeOutcome;
    return {
        ...base,
        renderEvents: base.byType.render || 0,
        renderFailures: typeOutcomes.render?.failure || 0,
        assetEvents: base.byType.asset || 0,
        assetFailures: typeOutcomes.asset?.failure || 0,
        assetSyncEvents: base.byType["asset-sync"] || 0,
        assetSyncFailures: typeOutcomes["asset-sync"]?.failure || 0,
        catalogSyncEvents: base.byType["catalog-sync"] || 0,
        catalogSyncFailures: typeOutcomes["catalog-sync"]?.failure || 0,
        renderGenerationEvents: base.byType["render-generation"] || 0,
        changedCatalogEvents: base.byTypeBoolean["catalog-sync"]?.changed || 0
    };
}

async function readMissingTelemetry(): Promise<MissingTelemetrySnapshot> {
    const base = await readJsonlDirectory(
        MISSING_TELEMETRY_ROOT,
        safeMissingEvent,
        () => "missing-cosmetics",
        raw => raw.outcome == null ? null : String(raw.outcome)
    );
    return {
        ...base,
        successfulReports: base.byOutcome.success || 0,
        failedReports: base.byOutcome.failure || 0,
        fallbackReports: base.byOutcome["image-fallback"] || 0,
        cachedReports: base.booleanCounts.cached || 0
    };
}

async function readArchiveRoot(root: string, label: string): Promise<SpriteArchiveRootSummary> {
    const directory = await scanDirectory(root);
    const result: SpriteArchiveRootSummary = { label, path: displayPath(root), directory, archives: [] };
    if (directory.status !== "present") return result;

    let entries: fs.Dirent[];
    try {
        entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch {
        return result;
    }
    const archiveEntries = entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
        .sort((a, b) => b.name.localeCompare(a.name))
        .slice(0, MAX_ARCHIVES_PER_ROOT);

    for (const entry of archiveEntries) {
        const archivePath = path.join(root, entry.name);
        const archiveStat = await inspectPath(archivePath);
        const manifestPath = path.join(archivePath, "manifest.json");
        const parsed = await readJsonValue(manifestPath);
        const manifest = parsed.value;
        const summary: SpriteArchiveSummary = {
            name: entry.name,
            path: displayPath(archivePath),
            status: archiveStat.status,
            modifiedAt: archiveStat.modifiedAt,
            manifestStatus: parsed.inspected.status,
            season: cleanText(manifest?.season?.displayName, "", 120) || null,
            seasonId: cleanText(manifest?.season?.id, "", 100) || null,
            archivedAt: validIsoDate(manifest?.archivedAt),
            familyCount: integerOrNull(manifest?.familyCount),
            spriteCount: integerOrNull(manifest?.spriteCount),
            assetCount: Array.isArray(manifest?.assets) ? manifest.assets.length : null,
            totalAssetBytes: integerOrNull(manifest?.totalAssetBytes),
            missingAssetCount: integerOrNull(manifest?.missingAssetCount),
            schemaVersion: integerOrNull(manifest?.schemaVersion)
        };
        if (parsed.error) {
            summary.manifestStatus = "error";
            summary.error = parsed.error;
        }
        result.archives.push(summary);
    }
    return result;
}

async function readFingerprintCaches(
    root: string,
    kind: "assets" | "renders"
): Promise<{ path: string; directory: DirectorySummary; fingerprints: SpriteFingerprintCacheSummary[] }> {
    const directory = await scanDirectory(root);
    const result = { path: displayPath(root), directory, fingerprints: [] as SpriteFingerprintCacheSummary[] };
    if (directory.status !== "present") return result;

    let topEntries: fs.Dirent[];
    try {
        topEntries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch {
        return result;
    }

    const rows: SpriteFingerprintCacheSummary[] = [];
    if (kind === "assets") {
        const fingerprints = topEntries.filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
            .sort((a, b) => b.name.localeCompare(a.name)).slice(0, MAX_CACHE_FINGERPRINTS);
        for (const entry of fingerprints) {
            const fingerprintPath = path.join(root, entry.name);
            const fingerprintDirectory = await scanDirectory(fingerprintPath);
            const parsed = await readJsonValue(path.join(fingerprintPath, "manifest.json"));
            const manifest = parsed.value;
            rows.push({
                fingerprint: entry.name,
                path: displayPath(fingerprintPath),
                status: fingerprintDirectory.status,
                manifestStatus: parsed.inspected.status,
                schemaVersion: integerOrNull(manifest?.schemaVersion),
                dataFingerprint: shortFingerprint(manifest?.dataFingerprint),
                entries: manifest?.assets && typeof manifest.assets === "object" ? Object.keys(manifest.assets).length : null,
                diskFiles: fingerprintDirectory.files,
                diskBytes: fingerprintDirectory.bytes,
                modifiedAt: fingerprintDirectory.modifiedAt,
                ...(parsed.error ? { manifestStatus: "error" as FileStoreStatus, error: parsed.error } : {})
            });
        }
    } else {
        const uiEntries = topEntries.filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
            .sort((a, b) => b.name.localeCompare(a.name));
        for (const uiEntry of uiEntries) {
            const uiPath = path.join(root, uiEntry.name);
            let dataEntries: fs.Dirent[];
            try {
                dataEntries = await fs.promises.readdir(uiPath, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const dataEntry of dataEntries.filter(entry => entry.isDirectory() && !entry.name.startsWith("."))) {
                if (rows.length >= MAX_CACHE_FINGERPRINTS) break;
                const dataPath = path.join(uiPath, dataEntry.name);
                const dataDirectory = await scanDirectory(dataPath);
                const parsed = await readJsonValue(path.join(dataPath, "manifest.json"));
                const manifest = parsed.value;
                const tasks = manifest?.tasks && typeof manifest.tasks === "object" ? Object.values(manifest.tasks) as any[] : [];
                const taskBytes = tasks.reduce((total, task) => total + nonNegativeNumber(task?.bytes), 0);
                rows.push({
                    fingerprint: `${uiEntry.name}/${dataEntry.name}`,
                    path: displayPath(dataPath),
                    status: dataDirectory.status,
                    manifestStatus: parsed.inspected.status,
                    schemaVersion: integerOrNull(manifest?.schemaVersion),
                    dataFingerprint: shortFingerprint(manifest?.dataFingerprint || dataEntry.name),
                    uiFingerprint: shortFingerprint(manifest?.uiFingerprint || uiEntry.name),
                    entries: manifest?.tasks && typeof manifest.tasks === "object" ? Object.keys(manifest.tasks).length : null,
                    diskFiles: dataDirectory.files,
                    diskBytes: dataDirectory.bytes,
                    modifiedAt: dataDirectory.modifiedAt,
                    completedTasks: tasks.length || null,
                    failedTasks: null,
                    ...(taskBytes > 0 ? { diskBytes: Math.max(dataDirectory.bytes, taskBytes) } : {}),
                    ...(parsed.error ? { manifestStatus: "error" as FileStoreStatus, error: parsed.error } : {})
                });
            }
            if (rows.length >= MAX_CACHE_FINGERPRINTS) break;
        }
    }
    result.fingerprints = rows;
    return result;
}

async function readSpriteCache(): Promise<SpriteCacheSnapshot> {
    const archiveRoots = Array.from(new Map([
        [SPRITE_ARCHIVE_ROOT, "Active sprite archive root"],
        [SPRITE_BUNDLED_ARCHIVE_ROOT, "Bundled sprite archives"],
        ...(SPRITE_BACKUP_ROOT ? [[SPRITE_BACKUP_ROOT, "Filesystem sprite backup"] as [string, string]] : [])
    ] as Array<[string, string]>).entries());
    const dataPaths = Array.from(new Map([
        ...(process.env.FORTNITE_SPRITE_DATA_PATH ? [[path.resolve(process.env.FORTNITE_SPRITE_DATA_PATH), "Configured sprite catalog"] as [string, string]] : []),
        [path.join(SPRITE_CACHE_ROOT, "spriteData.json"), "Persistent sprite catalog"],
        [path.join(LEGACY_SPRITE_CACHE_ROOT, "spriteData.json"), "Legacy sprite fallback catalog"],
        [SPRITE_SOURCE_DATA_PATH, "Bundled sprite catalog"]
    ] as Array<[string, string]>).entries());
    const historyPaths = Array.from(new Map([
        [path.join(SPRITE_BUNDLED_ARCHIVE_ROOT, "spriteHistory.json"), "Bundled sprite history"],
        [SPRITE_HISTORY_PATH, "Active sprite history"],
        ...(SPRITE_BACKUP_ROOT ? [[path.join(SPRITE_BACKUP_ROOT, "spriteHistory.json"), "Filesystem sprite backup history"] as [string, string]] : [])
    ] as Array<[string, string]>).entries());

    const [root, dataFiles, historyFiles, archiveRootSummaries, assetCache, renderCache, telemetry] = await Promise.all([
        scanDirectory(SPRITE_CACHE_ROOT),
        Promise.all(dataPaths.map(([filePath, label]) => readJsonStore(
            `sprite-data:${displayPath(filePath)}`,
            label,
            filePath,
            summarizeSpriteData
        ))),
        Promise.all(historyPaths.map(([filePath, label]) => readJsonStore(
            `sprite-history:${displayPath(filePath)}`,
            label,
            filePath,
            summarizeSpriteHistory
        ))),
        Promise.all(archiveRoots.map(([rootPath, label]) => readArchiveRoot(rootPath, label))),
        readFingerprintCaches(SPRITE_ASSET_CACHE_ROOT, "assets"),
        readFingerprintCaches(SPRITE_RENDER_CACHE_ROOT, "renders"),
        readSpriteTelemetry()
    ]);

    return {
        root,
        dataFiles,
        historyFiles,
        archiveRoots: archiveRootSummaries,
        assetCache,
        renderCache,
        telemetry
    };
}

async function readMaps(): Promise<MapCacheSnapshot> {
    const files = await Promise.all([
        readJsonStore("map-data", "Map catalog", MAP_DATA_PATH, summarizeMapData),
        readJsonStore("map-history", "Map history", MAP_HISTORY_PATH, summarizeMapData),
        readJsonStore("map-image-manifest", "Map image manifest", MAP_IMAGE_MANIFEST_PATH, summarizeMapImageManifest)
    ]);
    return { files, assets: await scanDirectory(MAP_ASSET_ROOT) };
}

async function readPersistentAssets(): Promise<FileStoreSummary[]> {
    const inspected = await inspectPath(LOGO_PATH);
    return [{
        id: "branding-logo",
        label: "Persistent bot branding asset",
        path: displayPath(LOGO_PATH),
        status: inspected.status,
        sizeBytes: inspected.sizeBytes,
        modifiedAt: inspected.modifiedAt,
        details: inspected.status === "present" ? {
            format: path.extname(LOGO_PATH).slice(1).toLowerCase() || "unknown"
        } : {},
        ...(inspected.error ? { error: inspected.error } : {})
    }];
}

async function readAutocompleteMetrics(): Promise<FileStoreSummary> {
    return readJsonStore(
        "autocomplete-metrics",
        "Autocomplete metrics JSON",
        AUTOCOMPLETE_METRICS_PATH,
        summarizeAutocompleteMetrics
    );
}

let inFlightSnapshot: Promise<FileCacheSnapshot> | null = null;

/**
 * Reads only known application-owned stores. It never accepts a path from the
 * request, never returns raw JSONL lines, and skips binary cache contents while
 * still reporting their exact file counts and byte totals.
 */
export function getFileCacheSnapshot(): Promise<FileCacheSnapshot> {
    if (inFlightSnapshot) return inFlightSnapshot;
    inFlightSnapshot = (async () => {
        const [cacheRoot, cacheChildren, sprite, maps, missingCosmetics, autocomplete, persistentAssets] = await Promise.all([
            scanDirectory(CACHE_ROOT),
            listChildDirectories(CACHE_ROOT),
            readSpriteCache(),
            readMaps(),
            readMissingTelemetry(),
            readAutocompleteMetrics(),
            readPersistentAssets()
        ]);
        return {
            generatedAt: new Date().toISOString(),
            namespace: SPRITE_STORAGE_NAMESPACE,
            environment: {
                platform: process.platform,
                nodeEnv: process.env.NODE_ENV || "development",
                productionRenderCacheEnabled: process.platform === "linux" && process.env.NODE_ENV === "production"
            },
            cacheRoot,
            cacheChildren,
            sprite,
            maps,
            missingCosmetics,
            autocomplete,
            persistentAssets
        };
    })().finally(() => {
        inFlightSnapshot = null;
    });
    return inFlightSnapshot;
}
