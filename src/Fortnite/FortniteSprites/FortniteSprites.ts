import {
    AutocompleteInteraction,
    BaseCommandInteraction,
    ButtonInteraction,
    CacheType,
    Client,
    CommandInteraction,
    Message,
    MessageActionRow,
    MessageAttachment,
    MessageButton,
    MessageEmbed,
    MessageSelectMenu,
    SelectMenuInteraction,
    User,
} from "discord.js";
import axios from "axios";
import Fuse from "fuse.js";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { fileURLToPath } from "url";
import type { Browser, Page } from "puppeteer";
import https from "https";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { applySpriteHistory, fetchSpriteData, mergeSpriteCatalog, sanitizeSpriteHistory, SpriteDataFile, SpriteFamily, SpriteHistoryFile, SpriteRarity, SpriteVariant, SpriteVariantName, stableSpriteDataJson, updateSpriteHistory, validateSpriteData } from "./spriteDataSource";
import { FortniteSeasonContext } from "./fortniteSeason";
import { getFortniteSeasonEmoji } from "../fortniteSeasonEmoji";
import { createTrackedJob, registerComponent } from "../../runtimeDiagnostics";

type SpriteSearchItem = {
    type: "family" | "variant";
    name: string;
    value: string;
    familyKey: string;
    variantId?: number;
    rarity?: SpriteRarity;
    variant?: SpriteVariantName;
    searchable: string;
    starter: boolean;
    priority: number;
    sortId: number;
};

type SpriteBrowserState = {
    familyKey?: string;
    seasonFilter?: "current" | "all" | string;
    variantFilter?: "all" | SpriteVariantName;
    rarityFilter?: "all" | SpriteRarity;
    searchQuery?: string;
    familyPage?: number;
};

type SpriteSearchIntent =
    | { kind: "overview"; state: SpriteBrowserState }
    | { kind: "family"; familyKey: string }
    | { kind: "variant"; variantId: number; familyKey?: string };

type SpriteViewState =
    | { kind: "overview"; state: SpriteBrowserState }
    | { kind: "family"; familyKey: string; state?: SpriteBrowserState }
    | { kind: "detail"; familyKey: string; variantId: number; state?: SpriteBrowserState };

type SpriteAuthor = {
    name: string;
    iconURL?: string;
    username?: string;
};

type SpriteTelemetryOrigin = {
    initiatedByUsername: string | null;
    interactedByUsername: string | null;
    messageId: string | null;
    requestId: string | null;
};

const BACKGROUND_TELEMETRY_ORIGIN: SpriteTelemetryOrigin = {
    initiatedByUsername: null,
    interactedByUsername: null,
    messageId: null,
    requestId: null
};

type SpriteSpawnRateEntry = {
    key: string;
    label: string;
    percent: number;
    display: string;
    priority: number;
};

type SpriteMessageState = {
    messageId: string;
    channelId: string;
    ownerId: string;
    author: SpriteAuthor;
    view: SpriteViewState;
    viewVersion: number;
    editToken: number;
    refreshGeneration: number | null;
    renderDataFingerprint: string;
    updatedAt: number;
};

type SpriteSyncResult = {
    changed: boolean;
    syncedAt: string;
};

type SpriteSyncTrigger = "startup" | "command" | "interaction" | "daily-timer";

type SpriteCatalogChangeSummary = {
    changedVariants: number;
    changedFieldCounts: Record<string, number>;
    examples: Array<Record<string, unknown>>;
};

type RenderedImageCacheEntry = {
    buffer: Buffer;
    bytes: number;
};

type SpriteAssetCacheEntry = {
    src: string;
    bytes: number;
    dataFingerprint: string;
};

type SpriteAssetDiskEntry = {
    resolvedUrl: string;
    contentSha256: string;
    contentType: string;
    etag?: string;
    lastModified?: string;
    checkedAt: string;
};

type SpriteAssetDiskManifest = {
    schemaVersion: number;
    dataFingerprint: string;
    assets: Record<string, SpriteAssetDiskEntry>;
};

type SpriteAssetDiskContent = {
    buffer: Buffer;
    contentType: string;
};

type SpriteAssetRefreshResult = {
    src: string;
    buffer: Buffer;
    metadata: SpriteAssetDiskEntry;
};

type SpriteAssetSyncResult = {
    changed: boolean;
    checked: number;
    failed: number;
    dataFingerprint: string;
};

type PendingRenderPageAcquire = {
    resolve: (page: Page) => void;
    reject: (error: Error) => void;
};

type RenderGenerationTask = {
    id: string;
    label: string;
    cacheKey: (dataFingerprint: string) => string;
    render: () => Promise<Buffer>;
};

type RenderGenerationProgress = {
    runId: number;
    reason: string;
    startedAt: number;
    dataFingerprint: string;
    total: number;
    completed: number;
    failed: number;
    current: string;
    taskDurationMs: number;
    lastTaskDurationMs: number;
    renderedBytes: number;
    reusedExistingCache: boolean;
};

type RenderTelemetryContext = {
    pageQueueWaitMs: number;
    renderedPixels: number;
    chromiumMemoryBytes: number | null;
};

const DATA_PATH = path.join(process.cwd(), "src", "Fortnite", "FortniteSprites", "spriteData.json");
const BUNDLED_SPRITE_ARCHIVE_ROOT = path.join(process.cwd(), "sprite-archives");
const SPRITE_ARCHIVE_ROOT = process.env.FORTNITE_SPRITE_ARCHIVE_DIR
    ? path.resolve(process.env.FORTNITE_SPRITE_ARCHIVE_DIR)
    : BUNDLED_SPRITE_ARCHIVE_ROOT;
const SPRITE_ARCHIVE_ROOTS = Array.from(new Set([BUNDLED_SPRITE_ARCHIVE_ROOT, SPRITE_ARCHIVE_ROOT]));
const BUNDLED_HISTORY_PATH = path.join(BUNDLED_SPRITE_ARCHIVE_ROOT, "spriteHistory.json");
const HISTORY_PATH = process.env.FORTNITE_SPRITE_HISTORY_PATH
    ? path.resolve(process.env.FORTNITE_SPRITE_HISTORY_PATH)
    : path.join(SPRITE_ARCHIVE_ROOT, "spriteHistory.json");
const TOKENS_PATH = path.join(process.cwd(), "src", "Fortnite", "FortniteSprites", "tokens.css");
const DUST_ICON_PATH = path.join(process.cwd(), "assets", "sprite-dust.png");
const SPAWN_RATE_ICON_PATHS: Record<string, string> = {
    spriteChest: path.join(process.cwd(), "assets", "sprite-chest-resized.png"),
    rareChest: path.join(process.cwd(), "assets", "rare-chest-resized.png"),
    chest: path.join(process.cwd(), "assets", "chest-resized.png"),
    supplyDrop: path.join(process.cwd(), "assets", "drop-resized.png")
};
const SPRITE_CACHE_ROOT_DIR = path.join(process.cwd(), ".cache", "fortnite-sprites");
const SPRITE_ASSET_CACHE_DIR = path.join(SPRITE_CACHE_ROOT_DIR, "assets");
const SPRITE_ASSET_CACHE_VERSION = "v4-binary-assets";
const SPRITE_ASSET_MANIFEST_VERSION = 2;
const RENDER_CACHE_DIR = path.join(SPRITE_CACHE_ROOT_DIR, "renders");
const SPRITE_TELEMETRY_DIR = path.join(SPRITE_CACHE_ROOT_DIR, "telemetry");
const SPRITE_TELEMETRY_SCHEMA_VERSION = 1;
const RENDER_CACHE_SCHEMA = "v2";
const PRODUCTION_RENDER_CACHE_ENABLED = process.platform === "linux" && process.env.NODE_ENV === "production";
const buildFingerprint = [
    process.env.BUILD_ID,
    process.env.COMMIT_SHA,
    process.env.SOURCE_COMMIT,
    process.env.GIT_COMMIT,
    process.env.DEPLOYMENT_ID,
    process.env.RELEASE_ID
].filter(Boolean).join("|");
const appVersion = `v${require("../../../package.json").version}`;
const IMAGE_HTTPS_AGENT = new https.Agent({ keepAlive: true, maxSockets: 12 });
const RARITY_ORDER: SpriteRarity[] = ["rare", "epic", "legendary", "mythic", "special"];
const RARITY_HEX_COLORS: Record<SpriteRarity, string> = {
    rare: "#3da5ff",
    epic: "#b15cff",
    legendary: "#f6a433",
    mythic: "#ffd44d",
    special: "#5ee0c2"
};
const RARITY_CSS_COLORS: Record<SpriteRarity, string> = {
    rare: "var(--rarity-rare)",
    epic: "var(--rarity-epic)",
    legendary: "var(--rarity-legendary)",
    mythic: "var(--rarity-mythic)",
    special: "var(--rarity-special)"
};
const RENDER_PAGE_POOL_SIZE = 2;
const MAX_RENDERED_IMAGE_CACHE_BYTES = 96 * 1024 * 1024;
const MAX_SPRITE_ASSET_CACHE_BYTES = 32 * 1024 * 1024;
const SPRITE_IMAGE_PREWARM_CONCURRENCY = 2;
const RENDER_GENERATION_DELAY_MS = 250;
const RENDER_GENERATION_RETRY_LIMIT = 2;
const RENDER_PROTOCOL_TIMEOUT_MS = 30 * 1000;
const SPRITE_ASSET_SYNC_COOLDOWN_MS = 5 * 60 * 1000;
export class FortniteSprites {
    private _data: SpriteDataFile | null = null;
    private spriteHistory: SpriteHistoryFile = { schemaVersion: 1, records: [] };
    private fuse: Fuse<SpriteSearchItem> | null = null;
    private searchItems: SpriteSearchItem[] = [];
    private isSyncingSprites = false;
    private refreshTimer?: NodeJS.Timer;
    private imageCache = new Map<string, RenderedImageCacheEntry>();
    private imageCacheBytes = 0;
    private pendingImageRenders = new Map<string, Promise<Buffer>>();
    private spriteAssetCache = new Map<string, SpriteAssetCacheEntry>();
    private spriteAssetCacheBytes = 0;
    private pendingSpriteAssetLoads = new Map<string, Promise<string | null>>();
    private telemetryWritePromise: Promise<void> = Promise.resolve();
    private telemetryCounters = {
        renderMemoryHits: 0,
        renderDiskHits: 0,
        renderPendingHits: 0,
        renderColdRenders: 0,
        renderFailures: 0,
        assetMemoryHits: 0,
        assetDiskHits: 0,
        assetNetworkLoads: 0,
        assetLocalLoads: 0,
        assetMisses: 0,
        assetFailures: 0,
        assetSyncChecks: 0,
        assetSyncFailures: 0,
        catalogSyncRuns: 0,
        catalogSyncFailures: 0,
        catalogDetailPages: 0,
        catalogDetailFailures: 0,
        totalRenderDurationMs: 0,
        totalPageQueueWaitMs: 0,
        totalRenderedPixels: 0
    };
    private lastSuccessfulSyncAt: string | null = null;
    private lastSyncError: string | null = null;
    private browser: Browser | null = null;
    private browserPromise: Promise<Browser> | null = null;
    private renderPagePool: Page[] = [];
    private liveRenderPages = new Set<Page>();
    private pendingRenderPageAcquires: PendingRenderPageAcquire[] = [];
    private runtimeRefreshPromise: Promise<void> | null = null;
    private activeRefreshGeneration: number | null = null;
    private refreshGenerationCounter = 0;
    private lastRuntimeRefreshQueuedAt = 0;
    private readonly runtimeRefreshCooldownMs = 5 * 60 * 1000;
    private readonly refreshEditConcurrency = 1;
    private readonly maxTrackedMessages = 80;
    private trackedSpriteMessages = new Map<string, SpriteMessageState>();
    private messageEditPipelines = new Map<string, Promise<void>>();
    private interactionSequenceCounter = 0;
    private latestInteractionSequences = new Map<string, number>();
    private startupSyncPromise: Promise<SpriteSyncResult> | null = null;
    private renderGenerationPromise: Promise<void> | null = null;
    private renderGenerationRevision = 0;
    private pendingRenderGenerationReason: string | null = null;
    private renderGenerationProgress: RenderGenerationProgress | null = null;
    private renderGenerationProgressTimer?: NodeJS.Timeout;
    private progressMessageEditPromise: Promise<void> = Promise.resolve();
    private spriteAssetSyncPromise: Promise<SpriteAssetSyncResult> | null = null;
    private lastSpriteAssetSyncAt = 0;
    private lastSpriteAssetSyncDataFingerprint: string | null = null;
    private spriteAssetContentFingerprint = "";
    private readonly renderTokensCss = fs.readFileSync(TOKENS_PATH, "utf8");
    private dustIconDataUrl = fs.existsSync(DUST_ICON_PATH)
        ? `data:image/png;base64,${fs.readFileSync(DUST_ICON_PATH).toString("base64")}`
        : null;
    private spawnRateIconDataUrls = Object.entries(SPAWN_RATE_ICON_PATHS).reduce<Record<string, string | null>>((acc, [key, filePath]) => {
        acc[key] = fs.existsSync(filePath)
            ? `data:image/png;base64,${fs.readFileSync(filePath).toString("base64")}`
            : null;
        return acc;
    }, {});
    private readonly renderUiFingerprint = this.computeRenderUiFingerprint();

    constructor(private client: Client, private readonly progressMessage?: Message) {
        registerComponent("fortniteSprites", this);
        this.loadData();
        this.loadSpriteHistory();
        this.startupSyncPromise = createTrackedJob(
            "fortnite-sprites-sync",
            "Fortnite Sprites Sync",
            "Startup validation",
            () => this.syncLatestSprites(BACKGROUND_TELEMETRY_ORIGIN, "startup")
        )();
        this.refreshTimer = setInterval(createTrackedJob("fortnite-sprites-sync", "Fortnite Sprites Sync", "Daily and startup", () => this.maybeQueueRuntimeRefresh(BACKGROUND_TELEMETRY_ORIGIN, "daily-timer")), 24 * 60 * 60 * 1000);

        this.client.on("interactionCreate", (i) => {
            if (i.isAutocomplete() && i.commandName === "fortnite" && i.options.getSubcommand(false) === "sprites") {
                return void this.resolveAutocompleteLatest(i);
            }
            if (i.isCommand() && i.commandName === "fortnite" && i.options.getSubcommand(false) === "sprites") {
                return void this.replySprites(i);
            }
            if (i.isSelectMenu() && i.customId.startsWith("fn_sprites_")) {
                return void this.handleSelectMenu(i);
            }
            if (i.isButton() && i.customId.startsWith("fn_sprites_")) {
                return void this.handleButton(i);
            }
        });
    }

    public startProductionRenderGeneration(reason = "startup build") {
        if (!PRODUCTION_RENDER_CACHE_ENABLED) {
            console.log("[FortniteSprites] Production render cache is disabled outside Linux production.");
            return;
        }
        if (!this._data) {
            if (this.startupSyncPromise) {
                void this.startupSyncPromise.then(() => {
                    if (this._data) this.startProductionRenderGeneration(reason);
                }).catch(() => { });
            }
            console.warn("[FortniteSprites] Cannot start render cache generation before sprite data is loaded.");
            return;
        }

        const runId = ++this.renderGenerationRevision;
        if (this.renderGenerationPromise) {
            this.pendingRenderGenerationReason = reason;
            if (this.renderGenerationProgress) {
                this.renderGenerationProgress.reason = reason;
                this.renderGenerationProgress.current = "Fresh data detected; prioritizing active pages";
                void this.updateRenderGenerationProgress();
            }
            return;
        }

        this.launchRenderGeneration(runId, reason);
    }

    private launchRenderGeneration(runId: number, reason: string) {
        const runPromise = this.runRenderGeneration(runId, reason)
            .catch((error) => {
                const progress = this.renderGenerationProgress?.runId === runId
                    ? this.renderGenerationProgress
                    : null;
                if (progress) this.recordRenderGenerationTelemetry(progress, "failure", error);
                console.error("[FortniteSprites] Render cache generation failed:", error);
            });
        this.renderGenerationPromise = runPromise;
        void runPromise.finally(() => {
            if (this.renderGenerationPromise !== runPromise) return;
            this.renderGenerationPromise = null;
            if (this.renderGenerationRevision === runId) return;

            const nextReason = this.pendingRenderGenerationReason || "new sprite data";
            this.pendingRenderGenerationReason = null;
            this.launchRenderGeneration(this.renderGenerationRevision, nextReason);
        });
    }

    private async runRenderGeneration(runId: number, reason: string) {
        if (this.startupSyncPromise) {
            await this.startupSyncPromise.catch(() => ({ changed: false, syncedAt: new Date().toISOString() }));
            this.startupSyncPromise = null;
        }
        if (this.renderGenerationRevision !== runId || !this._data) return;

        const tasks = this.buildRenderGenerationTasks();
        const catalogDataFingerprint = this.getCatalogDataFingerprint();
        const progress: RenderGenerationProgress = {
            runId,
            reason,
            startedAt: Date.now(),
            dataFingerprint: this.getRenderDataFingerprint(),
            total: tasks.length,
            completed: 0,
            failed: 0,
            current: "Preparing render queue",
            taskDurationMs: 0,
            lastTaskDurationMs: 0,
            renderedBytes: 0,
            reusedExistingCache: false
        };
        this.renderGenerationProgress = progress;
        await this.updateRenderGenerationProgress("running", "start");
        this.renderGenerationProgressTimer = setInterval(() => {
            void this.updateRenderGenerationProgress();
        }, 30 * 1000);

        let cancelled = false;
        try {
            progress.current = "Checking Fortnite.GG sprite artwork for updates";
            await this.syncProductionSpriteAssets(catalogDataFingerprint);
            progress.dataFingerprint = this.getRenderDataFingerprint();
            if (this.renderGenerationRevision !== runId) {
                cancelled = true;
                return;
            }

            const cachedRenderBytes = await this.getCompleteRenderCacheBytes(tasks, progress.dataFingerprint);
            if (cachedRenderBytes !== null) {
                progress.completed = tasks.length;
                progress.renderedBytes = cachedRenderBytes;
                progress.reusedExistingCache = true;
                progress.current = "Existing render cache verified";
                console.log(`[FortniteSprites] Existing render cache verified for ${tasks.length} screens; skipping Chromium rendering.`);
            } else {
                let failedTasks: RenderGenerationTask[] = [];
                const renderTask = async (task: RenderGenerationTask, failedTarget: RenderGenerationTask[], attempt: number) => {
                    progress.current = attempt > 1
                        ? `Retry ${attempt}/${RENDER_GENERATION_RETRY_LIMIT + 1} · ${task.label}`
                        : task.label;
                    const taskStartedAt = Date.now();
                    try {
                        const rendered = await task.render();
                        progress.completed++;
                        progress.renderedBytes += rendered.byteLength;
                    } catch (error) {
                        progress.failed++;
                        failedTarget.push(task);
                        console.warn(`[FortniteSprites] Failed to pre-render ${task.label} (attempt ${attempt}):`, error);
                    }
                    progress.lastTaskDurationMs = Math.max(0, Date.now() - taskStartedAt);
                    progress.taskDurationMs += progress.lastTaskDurationMs;

                    if (RENDER_GENERATION_DELAY_MS > 0) {
                        await new Promise(resolve => setTimeout(resolve, RENDER_GENERATION_DELAY_MS));
                    }
                };

                for (const task of tasks) {
                    if (this.renderGenerationRevision !== runId) {
                        cancelled = true;
                        break;
                    }

                    await renderTask(task, failedTasks, 1);
                }

                for (let retry = 2; !cancelled && failedTasks.length > 0 && retry <= RENDER_GENERATION_RETRY_LIMIT + 1; retry++) {
                    const retryTasks = failedTasks;
                    failedTasks = [];
                    progress.failed = 0;
                    progress.current = `Retrying ${retryTasks.length} failed screens`;
                    await this.updateRenderGenerationProgress("running", "progress");

                    for (const task of retryTasks) {
                        if (this.renderGenerationRevision !== runId) {
                            cancelled = true;
                            break;
                        }
                        await renderTask(task, failedTasks, retry);
                    }
                }
            }
        } finally {
            if (this.renderGenerationProgressTimer) {
                clearInterval(this.renderGenerationProgressTimer);
                this.renderGenerationProgressTimer = undefined;
            }

            const ownsProgress = this.renderGenerationProgress?.runId === runId;
            if (!ownsProgress) {
                this.recordRenderGenerationTelemetry(progress, "cancelled");
                return;
            }
            if (cancelled || this.renderGenerationRevision !== runId) {
                this.recordRenderGenerationTelemetry(progress, "cancelled");
                return;
            }

            progress.current = progress.reusedExistingCache
                ? "Cache already full; no rendering needed"
                : progress.failed > 0
                    ? `Complete with ${progress.failed} failed screens`
                    : "Complete";
            await this.updateRenderGenerationProgress("complete", "complete");
            if (progress.failed === 0) {
                await this.pruneRenderDiskCache(progress.dataFingerprint);
                // Asset files are keyed by the catalog fingerprint. The render
                // fingerprint also includes UI and asset-content state,
                // so using it here would delete the just-synced asset folder.
                await this.pruneSpriteAssetDiskCache(catalogDataFingerprint);
            }
            this.renderGenerationProgress = null;
        }
    }

    private buildRenderGenerationTasks(): RenderGenerationTask[] {
        if (!this._data) return [];

        const tasks: RenderGenerationTask[] = [];
        const taskIds = new Set<string>();
        const addTask = (
            id: string,
            label: string,
            cacheKey: (dataFingerprint: string) => string,
            render: () => Promise<Buffer>
        ) => {
            if (taskIds.has(id)) return;
            taskIds.add(id);
            tasks.push({ id, label, cacheKey, render });
        };

        const seasonFilters = Array.from(new Set([
            "current",
            "all",
            ...this.getAvailableSeasonIds()
        ]));
        const variantFilters = ["all", ...this.getVariantNames()];
        const rarityFilters: Array<"all" | SpriteRarity> = ["all", ...RARITY_ORDER];

        for (const seasonFilter of seasonFilters) {
            for (const variantFilter of variantFilters) {
                for (const rarityFilter of rarityFilters) {
                    const state: SpriteBrowserState = { seasonFilter, variantFilter, rarityFilter, familyPage: 0 };
                    const families = this.getFilteredFamilies(state);
                    if (families.length === 0) continue;
                    addTask(
                        `overview:${seasonFilter}:${variantFilter}:${rarityFilter}`,
                        `Overview · ${this.describeSeasonFilter(seasonFilter)} · ${variantFilter}/${rarityFilter}`,
                        dataFingerprint => this.getCanonicalOverviewCacheKey(state, dataFingerprint),
                        () => this.renderOverviewImage(families, state)
                    );
                }
            }
        }

        const displayFamilies = this.getDisplayFamilies(this._data.families);
        for (const seasonFilter of seasonFilters) {
            for (const sourceFamily of displayFamilies) {
                const scopedFamily = this.filterFamilyBySeason(sourceFamily, seasonFilter);
                const family = scopedFamily ? this.getDisplayFamilies([scopedFamily])[0] : undefined;
                if (!family) continue;
                const variantIds = family.variants.map(variant => variant.id).join(",");
                addTask(
                    `family:${seasonFilter}:${family.key}:${variantIds}`,
                    `Family · ${family.displayName} · ${this.describeSeasonFilter(seasonFilter)}`,
                    dataFingerprint => `family:${this.renderUiFingerprint}:${dataFingerprint}:${family.key}:${variantIds}`,
                    () => this.renderFamilyImage(family)
                );
            }
        }

        for (const family of displayFamilies) {
            for (const variant of family.variants) {
                addTask(
                    `variant:${family.key}:${variant.id}`,
                    `Variant · ${variant.name}`,
                    dataFingerprint => `variant:${this.renderUiFingerprint}:${dataFingerprint}:${family.key}:${variant.id}:${variant.name}`,
                    () => this.renderVariantImage(family, variant)
                );
            }
        }

        return tasks;
    }

    private formatDuration(milliseconds: number) {
        const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
    }

    private telemetryKeyHash(value: string) {
        return crypto.createHash("sha1").update(value).digest("hex");
    }

    private getSpriteTelemetryLogPath(date = new Date()) {
        return path.join(SPRITE_TELEMETRY_DIR, `events-${date.toISOString().slice(0, 10)}.jsonl`);
    }

    private recordSpriteTelemetry(event: Record<string, unknown>) {
        if (!PRODUCTION_RENDER_CACHE_ENABLED) return;

        const record = {
            schemaVersion: SPRITE_TELEMETRY_SCHEMA_VERSION,
            timestamp: new Date().toISOString(),
            processId: process.pid,
            appVersion,
            buildFingerprint: buildFingerprint || null,
            ...event
        };
        const line = `${JSON.stringify(record)}\n`;
        this.telemetryWritePromise = this.telemetryWritePromise
            .catch(() => { })
            .then(async () => {
                await fs.promises.mkdir(SPRITE_TELEMETRY_DIR, { recursive: true });
                await fs.promises.appendFile(this.getSpriteTelemetryLogPath(), line, "utf8");
            })
            .catch(error => {
                console.warn("[FortniteSprites] Failed to write sprite telemetry:", error?.message || error);
            });
    }

    private recordRenderTelemetry(
        outcome: "memory-hit" | "disk-hit" | "pending-hit" | "cold-render" | "failure",
        cacheKey: string,
        dataFingerprint: string,
        startedAt: number,
        metrics: RenderTelemetryContext,
        telemetryOrigin: SpriteTelemetryOrigin,
        error?: unknown
    ) {
        if (outcome === "memory-hit") this.telemetryCounters.renderMemoryHits++;
        if (outcome === "disk-hit") this.telemetryCounters.renderDiskHits++;
        if (outcome === "pending-hit") this.telemetryCounters.renderPendingHits++;
        if (outcome === "cold-render") this.telemetryCounters.renderColdRenders++;
        if (outcome === "failure") this.telemetryCounters.renderFailures++;

        const durationMs = Math.max(0, Date.now() - startedAt);
        const pageQueueWaitMs = Math.max(0, metrics.pageQueueWaitMs || 0);
        const renderedPixels = Math.max(0, metrics.renderedPixels || 0);
        this.telemetryCounters.totalRenderDurationMs += durationMs;
        this.telemetryCounters.totalPageQueueWaitMs += pageQueueWaitMs;
        this.telemetryCounters.totalRenderedPixels += renderedPixels;

        this.recordSpriteTelemetry({
            type: "render",
            outcome,
            cacheKeyHash: this.telemetryKeyHash(cacheKey),
            dataFingerprint,
            initiatedByUsername: telemetryOrigin.initiatedByUsername,
            interactedByUsername: telemetryOrigin.interactedByUsername,
            messageId: telemetryOrigin.messageId,
            requestId: telemetryOrigin.requestId,
            durationMs,
            pageQueueWaitMs,
            renderedPixels,
            chromiumMemoryBytes: metrics.chromiumMemoryBytes,
            ...(error ? { error: error instanceof Error ? error.message : String(error) } : {})
        });
    }

    private recordAssetTelemetry(
        outcome: "memory-hit" | "disk-hit" | "network" | "local" | "miss" | "failure",
        imageUrl: string,
        dataFingerprint: string,
        startedAt: number,
        telemetryOrigin: SpriteTelemetryOrigin,
        error?: unknown
    ) {
        if (outcome === "memory-hit") this.telemetryCounters.assetMemoryHits++;
        if (outcome === "disk-hit") this.telemetryCounters.assetDiskHits++;
        if (outcome === "network") this.telemetryCounters.assetNetworkLoads++;
        if (outcome === "local") this.telemetryCounters.assetLocalLoads++;
        if (outcome === "miss") this.telemetryCounters.assetMisses++;
        if (outcome === "failure") this.telemetryCounters.assetFailures++;

        this.recordSpriteTelemetry({
            type: "asset",
            outcome,
            assetKeyHash: this.telemetryKeyHash(imageUrl),
            dataFingerprint,
            initiatedByUsername: telemetryOrigin.initiatedByUsername,
            interactedByUsername: telemetryOrigin.interactedByUsername,
            messageId: telemetryOrigin.messageId,
            requestId: telemetryOrigin.requestId,
            durationMs: Math.max(0, Date.now() - startedAt),
            ...(error ? { error: error instanceof Error ? error.message : String(error) } : {})
        });
    }

    private recordAssetSyncTelemetry(
        result: SpriteAssetSyncResult,
        startedAt: number,
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN
    ) {
        this.telemetryCounters.assetSyncChecks += result.checked;
        this.telemetryCounters.assetSyncFailures += result.failed;
        this.recordSpriteTelemetry({
            type: "asset-sync",
            dataFingerprint: result.dataFingerprint,
            initiatedByUsername: telemetryOrigin.initiatedByUsername,
            interactedByUsername: telemetryOrigin.interactedByUsername,
            messageId: telemetryOrigin.messageId,
            requestId: telemetryOrigin.requestId,
            changed: result.changed,
            checked: result.checked,
            failed: result.failed,
            durationMs: Math.max(0, Date.now() - startedAt)
        });
    }

    private recordCatalogSyncTelemetry({
        startedAt,
        trigger,
        telemetryOrigin,
        latest,
        changed,
        dataFingerprintBefore,
        dataFingerprintAfter,
        changeSummary,
        error
    }: {
        startedAt: number;
        trigger: SpriteSyncTrigger;
        telemetryOrigin: SpriteTelemetryOrigin;
        latest: SpriteDataFile | null;
        changed: boolean;
        dataFingerprintBefore: string;
        dataFingerprintAfter: string;
        changeSummary: SpriteCatalogChangeSummary;
        error?: unknown;
    }) {
        const variants = latest?.families.flatMap(family => family.variants) || [];
        const detailPagesDiscovered = latest ? variants.length : null;
        const detailPagesComplete = latest ? variants.filter(variant => variant.detailStatus === "complete").length : null;
        const detailPagesPartial = latest ? variants.filter(variant => variant.detailStatus !== "complete").length : null;
        const partialSpriteIds = latest
            ? variants.filter(variant => variant.detailStatus !== "complete").map(variant => variant.id).slice(0, 100)
            : null;

        this.telemetryCounters.catalogSyncRuns++;
        this.telemetryCounters.catalogDetailPages += detailPagesDiscovered || 0;
        this.telemetryCounters.catalogDetailFailures += detailPagesPartial || 0;
        if (error) this.telemetryCounters.catalogSyncFailures++;

        this.recordSpriteTelemetry({
            type: "catalog-sync",
            source: "fortnite.gg",
            scope: "current-season-list",
            trigger,
            initiatedByUsername: telemetryOrigin.initiatedByUsername,
            interactedByUsername: telemetryOrigin.interactedByUsername,
            messageId: telemetryOrigin.messageId,
            requestId: telemetryOrigin.requestId,
            currentSeason: latest?.seasonContext?.displayName || null,
            seasonKey: latest?.seasonContext?.seasonKey || null,
            spriteListPagesFetched: latest ? 1 : null,
            detailPagesDiscovered,
            detailPagesAttempted: detailPagesDiscovered,
            detailPagesComplete,
            detailPagesPartial,
            partialSpriteIds,
            historicalDetailPagesChecked: 0,
            changed,
            changedVariants: changeSummary.changedVariants,
            changedFieldCounts: changeSummary.changedFieldCounts,
            changedExamples: changeSummary.examples,
            dataFingerprintBefore,
            dataFingerprintAfter,
            durationMs: Math.max(0, Date.now() - startedAt),
            ...(error ? { error: error instanceof Error ? error.message : String(error) } : {})
        });

        console.log(`[FortniteSprites] Fortnite.GG catalog sync ${changed ? "detected changes" : "found no changes"}`
            + ` | current-season detail pages: ${detailPagesComplete ?? 0}/${detailPagesDiscovered ?? 0}`
            + ` | historical detail pages: 0`
            + ` | duration: ${Math.max(0, Date.now() - startedAt)}ms`
            + (error ? ` | failed: ${error instanceof Error ? error.message : String(error)}` : ""));
    }

    private recordRenderGenerationTelemetry(
        progress: RenderGenerationProgress,
        phase: "start" | "progress" | "complete" | "cancelled" | "failure",
        error?: unknown
    ) {
        const processed = progress.completed + progress.failed;
        const elapsedMs = Math.max(0, Date.now() - progress.startedAt);
        const elapsedSeconds = elapsedMs / 1000;
        const remaining = Math.max(0, progress.total - processed);
        const averageTaskDurationMs = processed > 0
            ? progress.taskDurationMs / processed
            : 0;

        this.recordSpriteTelemetry({
            type: "render-generation",
            phase,
            runId: progress.runId,
            reason: progress.reason,
            dataFingerprint: progress.dataFingerprint,
            total: progress.total,
            completed: progress.completed,
            failed: progress.failed,
            remaining,
            current: progress.current,
            durationMs: elapsedMs,
            screensPerSecond: elapsedSeconds > 0 ? progress.completed / elapsedSeconds : 0,
            processedPerSecond: elapsedSeconds > 0 ? processed / elapsedSeconds : 0,
            averageTaskDurationMs,
            lastTaskDurationMs: progress.lastTaskDurationMs,
            renderedBytes: progress.renderedBytes,
            reusedExistingCache: progress.reusedExistingCache,
            estimatedRemainingMs: processed > 0
                ? Math.round((elapsedMs / processed) * remaining)
                : null,
            ...(error ? { error: error instanceof Error ? error.message : String(error) } : {})
        });
    }

    private async updateRenderGenerationProgress(
        status: "running" | "complete" = "running",
        telemetryPhase: "start" | "progress" | "complete" = status === "complete" ? "complete" : "progress"
    ) {
        const progress = this.renderGenerationProgress;
        if (!progress) return;

        const processed = progress.completed + progress.failed;
        const remaining = Math.max(0, progress.total - processed);
        const elapsed = Date.now() - progress.startedAt;
        const eta = processed > 0
            ? this.formatDuration((elapsed / processed) * remaining)
            : "estimating";
        const percent = progress.total > 0 ? ((progress.completed / progress.total) * 100).toFixed(1) : "100.0";
        const cacheAlreadyFull = status === "complete" && progress.reusedExistingCache;
        const stateLabel = cacheAlreadyFull ? "already full" : status === "complete" ? "complete" : "in progress";
        const startedAt = new Date(progress.startedAt).toLocaleString("en-US", { timeZone: "America/New_York" });
        const current = this.truncate(
            cacheAlreadyFull ? "Cache already full; no rendering needed" : progress.current || "Waiting for the next screen",
            900
        );
        const reason = this.truncate(progress.reason, 900);
        const progressDescription = cacheAlreadyFull
            ? `${progress.completed} of ${progress.total} screens are ready (${percent}%). Existing images were verified; no new images were rendered.`
            : `${progress.completed} of ${progress.total} screens are ready (${percent}%).`;
        this.recordRenderGenerationTelemetry(progress, telemetryPhase);
        const progressEmbed = new MessageEmbed()
            .setColor(status === "complete" ? "#39B36B" : "#2186DB")
            .setTitle(`🖼️ Sprite image cache ${stateLabel}`)
            .setDescription(progressDescription)
            .setFooter({
                text: cacheAlreadyFull
                    ? "Startup validation · Fortnite.GG data and artwork checked"
                    : `1 background render worker · ${RENDER_GENERATION_DELAY_MS}ms pacing · active pages first`
            })
            .setTimestamp();

        if (!cacheAlreadyFull) {
            progressEmbed.addFields(
                { name: "Remaining", value: remaining.toLocaleString("en-US"), inline: true },
                { name: "Failed", value: progress.failed.toLocaleString("en-US"), inline: true },
                { name: "Elapsed", value: this.formatDuration(elapsed), inline: true },
                { name: "ETA", value: status === "complete" ? "Done" : eta, inline: true },
                { name: "Started", value: startedAt, inline: true },
                { name: "Reason", value: reason || "Startup build", inline: true },
                { name: "Current screen", value: current, inline: false }
            );
        }

        console.log(`[FortniteSprites] ${[
            `Sprite image cache ${stateLabel}`,
            progressDescription,
            `Remaining: ${remaining} · Failed: ${progress.failed}`,
            `Started: ${startedAt}`,
            `Elapsed: ${this.formatDuration(elapsed)} · ETA: ${status === "complete" ? "done" : eta}`,
            `Current: ${current}`
        ].join(" | ")}`);
        if (this.progressMessage) {
            const previous = this.progressMessageEditPromise;
            const next = previous
                .catch(() => { })
                .then(async () => {
                    await this.progressMessage!.edit({ embeds: [progressEmbed] }).catch((error) => {
                        console.warn("[FortniteSprites] Failed to update sprite render progress message:", error?.message || error);
                    });
                });
            this.progressMessageEditPromise = next;
            await next;
        }
    }

    private async pruneRenderDiskCache(dataFingerprint: string) {
        if (!PRODUCTION_RENDER_CACHE_ENABLED) return;
        try {
            const currentUiRoot = path.join(RENDER_CACHE_DIR, this.renderUiFingerprint);
            await fs.promises.mkdir(currentUiRoot, { recursive: true });
            const uiEntries = await fs.promises.readdir(RENDER_CACHE_DIR, { withFileTypes: true });
            await Promise.all(uiEntries
                .filter(entry => entry.isDirectory() && entry.name !== this.renderUiFingerprint)
                .map(entry => fs.promises.rm(path.join(RENDER_CACHE_DIR, entry.name), { recursive: true, force: true })));

            const dataEntries = await fs.promises.readdir(currentUiRoot, { withFileTypes: true });
            await Promise.all(dataEntries
                .filter(entry => entry.isDirectory() && entry.name !== dataFingerprint)
                .map(entry => fs.promises.rm(path.join(currentUiRoot, entry.name), { recursive: true, force: true })));
        } catch (error) {
            console.warn("[FortniteSprites] Failed to prune stale rendered image caches:", error?.message || error);
        }
    }

    private async invalidateRenderedImageDiskCache(dataFingerprint: string) {
        if (!PRODUCTION_RENDER_CACHE_ENABLED) return;
        try {
            await fs.promises.rm(
                path.join(RENDER_CACHE_DIR, this.renderUiFingerprint, dataFingerprint),
                { recursive: true, force: true }
            );
        } catch (error) {
            console.warn("[FortniteSprites] Failed to invalidate rendered images after sprite artwork changed:", error?.message || error);
        }
    }

    private async pruneSpriteAssetDiskCache(catalogDataFingerprint: string) {
        if (!PRODUCTION_RENDER_CACHE_ENABLED) return;
        try {
            await fs.promises.mkdir(SPRITE_ASSET_CACHE_DIR, { recursive: true });
            const entries = await fs.promises.readdir(SPRITE_ASSET_CACHE_DIR, { withFileTypes: true });
            await Promise.all(entries
                .filter(entry => entry.isDirectory() && entry.name !== catalogDataFingerprint)
                .map(entry => fs.promises.rm(path.join(SPRITE_ASSET_CACHE_DIR, entry.name), { recursive: true, force: true })));
        } catch (error) {
            console.warn("[FortniteSprites] Failed to prune stale sprite asset caches:", error?.message || error);
        }
    }

    public getDiagnostics() {
        return {
            familiesLoaded: this._data?.families.length || 0,
            variantsLoaded: this.getAllVariants().length,
            currentSeason: this._data?.seasonContext?.displayName || null,
            spriteHistoryRecords: this.spriteHistory.records.length,
            trackedMessages: this.trackedSpriteMessages.size,
            renderedImageEntries: this.imageCache.size,
            renderedImageBytes: this.imageCacheBytes,
            spriteAssetEntries: this.spriteAssetCache.size,
            spriteAssetBytes: this.spriteAssetCacheBytes,
            pendingImageRenders: this.pendingImageRenders.size,
            pendingAssetLoads: this.pendingSpriteAssetLoads.size,
            productionRenderCacheEnabled: PRODUCTION_RENDER_CACHE_ENABLED,
            renderGeneration: this.renderGenerationProgress,
            lastSuccessfulSyncAt: this.lastSuccessfulSyncAt,
            lastSyncError: this.lastSyncError,
            telemetry: {
                ...this.telemetryCounters,
                persisted: PRODUCTION_RENDER_CACHE_ENABLED,
                format: "jsonl",
                directory: PRODUCTION_RENDER_CACHE_ENABLED ? SPRITE_TELEMETRY_DIR : null,
                retention: "never automatically deleted"
            },
        };
    }

    private loadData() {
        try {
            if (!fs.existsSync(DATA_PATH)) {
                console.warn("[FortniteSprites] spriteData.json does not exist yet.");
                return;
            }

            const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as SpriteDataFile;
            validateSpriteData(parsed);
            const mergedCatalog = mergeSpriteCatalog(this.loadArchivedSpriteCatalog(), parsed);
            const catalog = this.spriteHistory.records.length > 0
                ? applySpriteHistory(mergedCatalog, this.spriteHistory)
                : mergedCatalog;
            catalog.families.forEach(family => {
                family.variants.sort((a, b) => a.summonCost - b.summonCost);
            });
            validateSpriteData(catalog);
            this._data = catalog;
            this.buildSearchIndex();
            this.clearRenderCaches();
            console.log(`[FortniteSprites] Loaded ${this.getAllVariants().length} sprites across ${catalog.families.length} families.`);
        } catch (e) {
            console.error("[FortniteSprites] Failed to load spriteData.json", e);
        }
    }

    private loadArchivedSpriteCatalog(): SpriteDataFile | null {
        const snapshots = new Map<string, SpriteDataFile>();
        for (const archiveRoot of SPRITE_ARCHIVE_ROOTS) {
            try {
                if (!fs.existsSync(archiveRoot)) continue;
                for (const entry of fs.readdirSync(archiveRoot, { withFileTypes: true })) {
                if (!entry.isDirectory()) continue;
                const archiveDir = path.join(archiveRoot, entry.name);
                const manifestPath = path.join(archiveDir, "manifest.json");
                if (!fs.existsSync(manifestPath)) continue;
                const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
                const seasonId = String(manifest?.season?.id || "");
                if (!seasonId) continue;

                // Prefer the largest complete snapshot in the archive. A merged
                // archive may keep the live source file in manifest.source while
                // spriteData.json contains the recovered full catalog.
                const dataFiles = Array.from(new Set([
                    String(manifest?.source?.dataFile || ""),
                    "spriteData.json",
                    "spriteData.local.json",
                    "spriteData.bot.json",
                    "spriteData.live.json"
                ].filter(Boolean)));
                const candidates: SpriteDataFile[] = [];
                for (const dataFile of dataFiles) {
                    const dataPath = path.resolve(archiveDir, dataFile);
                    if (!dataPath.startsWith(`${path.resolve(archiveDir)}${path.sep}`) || !fs.existsSync(dataPath)) continue;
                    try {
                        const candidate = JSON.parse(fs.readFileSync(dataPath, "utf8")) as SpriteDataFile;
                        validateSpriteData(candidate);
                        candidates.push(candidate);
                    } catch {
                        // Ignore incomplete/non-catalog files in an archive.
                    }
                }
                const snapshot = candidates.sort((a, b) => b.totalSprites - a.totalSprites)[0];
                if (!snapshot) continue;

                // Use the archived local image paths when available, so old
                // cards do not depend on fortnite.gg retaining their URLs.
                const localDataFile = String(manifest?.localDataFile || "");
                const localDataPath = localDataFile ? path.resolve(archiveDir, localDataFile) : "";
                if (localDataPath && localDataPath.startsWith(`${path.resolve(archiveDir)}${path.sep}`) && fs.existsSync(localDataPath)) {
                    try {
                        const localSnapshot = JSON.parse(fs.readFileSync(localDataPath, "utf8")) as SpriteDataFile;
                        validateSpriteData(localSnapshot);
                        const localImages = new Map(localSnapshot.families.flatMap(family => family.variants.map(variant => [
                            `${family.key}:${variant.id}:${variant.name}:${variant.variant}`.toLowerCase(),
                            variant.imageUrl
                        ] as [string, string])));
                        snapshot.families = snapshot.families.map(family => ({
                            ...family,
                            variants: family.variants.map(variant => {
                                const localImage = localImages.get(`${family.key}:${variant.id}:${variant.name}:${variant.variant}`.toLowerCase());
                                if (!localImage || localImage.startsWith("http")) return variant;
                                const localPath = path.resolve(archiveDir, localImage);
                                return localPath.startsWith(`${path.resolve(archiveDir)}${path.sep}`) && fs.existsSync(localPath)
                                    ? { ...variant, imageUrl: localPath }
                                    : variant;
                            })
                        }));
                    } catch {
                        // Remote image URLs remain a valid fallback.
                    }
                }
                const existing = snapshots.get(seasonId);
                if (!existing || snapshot.totalSprites > existing.totalSprites) snapshots.set(seasonId, snapshot);
                }
            } catch (error) {
                console.warn(`[FortniteSprites] Could not load archived sprite catalogs from ${archiveRoot}.`, error);
            }
        }
        return [...snapshots.values()].reduce<SpriteDataFile | null>((catalog, snapshot) => mergeSpriteCatalog(catalog, snapshot), null);
    }

    private getLegacySeasonContext(): FortniteSeasonContext {
        const id = process.env.FORTNITE_SPRITE_LEGACY_SEASON_ID || "chapter-7-season-3";
        const match = id.match(/^chapter-(\d+)-season-(.+)$/i);
        const chapter = Number(match?.[1] || 7);
        const season = match?.[2] || "3";
        return {
            id,
            chapter,
            season,
            displayName: `Chapter ${chapter} Season ${season}`,
            source: "fortnite-gg",
            validatedBy: ["fortnite-gg"]
        };
    }

    private loadSpriteHistory() {
        try {
            for (const historyPath of Array.from(new Set([BUNDLED_HISTORY_PATH, HISTORY_PATH]))) {
                if (!fs.existsSync(historyPath)) continue;
                const parsed = JSON.parse(fs.readFileSync(historyPath, "utf8")) as SpriteHistoryFile;
                if (parsed.schemaVersion === 1 && Array.isArray(parsed.records)) {
                    this.spriteHistory = this.mergeSpriteHistories(this.spriteHistory, parsed);
                }
            }

            if (this.spriteHistory.records.length === 0 && this._data) {
                const seedData = this._data.seasonContext
                    ? this._data
                    : { ...this._data, seasonContext: this.getLegacySeasonContext() };
                this.spriteHistory = updateSpriteHistory(this.spriteHistory, seedData);
                this.writeSpriteHistory(this.spriteHistory);
                console.log(`[FortniteSprites] Seeded sprite history with ${this.spriteHistory.records.length} legacy records.`);
            }

            const sanitizedHistory = sanitizeSpriteHistory(this.spriteHistory, this.getTrustedHistorySeasonIds());
            if (JSON.stringify(sanitizedHistory) !== JSON.stringify(this.spriteHistory)) {
                this.spriteHistory = sanitizedHistory;
                this.writeSpriteHistory(this.spriteHistory);
                console.log("[FortniteSprites] Removed untrusted season labels from sprite history.");
            }

            if (this._data && this.spriteHistory.records.length > 0) {
                this._data = applySpriteHistory(this._data, this.spriteHistory);
                this.buildSearchIndex();
                this.clearRenderCaches();
            }
        } catch (e) {
            console.error("[FortniteSprites] Failed to load spriteHistory.json", e);
            this.spriteHistory = { schemaVersion: 1, records: [] };
        }
    }

    private writeSpriteHistory(history: SpriteHistoryFile) {
        fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
        const tempPath = `${HISTORY_PATH}.tmp-${process.pid}`;
        fs.writeFileSync(tempPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
        fs.renameSync(tempPath, HISTORY_PATH);
    }

    private mergeSpriteHistories(left: SpriteHistoryFile, right: SpriteHistoryFile): SpriteHistoryFile {
        const records = new Map(left.records.map(record => [record.identityKey, { ...record, appearances: [...record.appearances] }]));
        for (const incoming of right.records) {
            const existing = records.get(incoming.identityKey);
            if (!existing) {
                records.set(incoming.identityKey, { ...incoming, appearances: [...incoming.appearances] });
                continue;
            }
            for (const appearance of incoming.appearances) {
                const current = existing.appearances.find(item => item.seasonId === appearance.seasonId);
                if (!current) existing.appearances.push({ ...appearance });
                else {
                    if (appearance.firstSeenAt < current.firstSeenAt) current.firstSeenAt = appearance.firstSeenAt;
                    if (appearance.lastSeenAt > current.lastSeenAt) current.lastSeenAt = appearance.lastSeenAt;
                }
            }
            const earliest = [...existing.appearances].sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt))[0];
            if (earliest) existing.introducedSeasonId = earliest.seasonId;
        }
        return { schemaVersion: 1, records: [...records.values()].sort((a, b) => a.spriteId - b.spriteId || a.identityKey.localeCompare(b.identityKey)) };
    }

    private getTrustedHistorySeasonIds() {
        const trusted = new Set<string>([this.getLegacySeasonContext().id]);
        if (this._data?.seasonContext?.id) trusted.add(this._data.seasonContext.id);
        for (const archiveRoot of SPRITE_ARCHIVE_ROOTS) {
            try {
                if (!fs.existsSync(archiveRoot)) continue;
                for (const entry of fs.readdirSync(archiveRoot, { withFileTypes: true })) {
                    if (!entry.isDirectory()) continue;
                    const manifestPath = path.join(archiveRoot, entry.name, "manifest.json");
                    if (!fs.existsSync(manifestPath)) continue;
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
                    if (manifest?.season?.id) trusted.add(String(manifest.season.id));
                }
            } catch {
                // Each archive root is optional.
            }
        }
        return trusted;
    }

    private async syncLatestSprites(
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN,
        trigger: SpriteSyncTrigger = "startup"
    ): Promise<SpriteSyncResult> {
        if (this.isSyncingSprites) {
            return {
                changed: false,
                syncedAt: this.lastSuccessfulSyncAt || new Date().toISOString()
            };
        }
        this.isSyncingSprites = true;
        const syncStartedAt = Date.now();
        const dataFingerprintBefore = this.getCatalogDataFingerprint();
        let latest: SpriteDataFile | null = null;
        let changeSummary: SpriteCatalogChangeSummary = {
            changedVariants: 0,
            changedFieldCounts: {},
            examples: []
        };
        let changed = false;

        try {
            latest = await fetchSpriteData(150, undefined, this._data?.seasonContext);
            const nextHistory = updateSpriteHistory(this.spriteHistory, latest);
            const enrichedLatest = applySpriteHistory(latest, nextHistory);
            const latestJson = stableSpriteDataJson(enrichedLatest);
            const existingJson = fs.existsSync(DATA_PATH) ? fs.readFileSync(DATA_PATH, "utf8") : "";
            const normalizeFetchedAt = (json: string) => json.replace(/"fetchedAt":\s*"[^"]+"/, '"fetchedAt": ""');
            changeSummary = this.summarizeSpriteCatalogChanges(existingJson, enrichedLatest);

            // Install and persist history before reloading the catalog. Historical
            // snapshots do not carry runtime availability fields on their own;
            // loadData must apply this history during an automatic refresh.
            this.spriteHistory = nextHistory;
            this.writeSpriteHistory(nextHistory);

            if (normalizeFetchedAt(latestJson) !== normalizeFetchedAt(existingJson)) {
                fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
                fs.writeFileSync(DATA_PATH, latestJson, "utf8");
                this.loadData();
                changed = true;
                console.log("[FortniteSprites] Sprite data cache updated.");
            } else if (this._data) {
                this._data = applySpriteHistory(this._data, nextHistory);
                this.buildSearchIndex();
                // The scrape completed successfully, but the normalized catalog
                // is unchanged. Keep the memory/deduplication caches warm so a
                // background refresh does not turn a RAM hit into a disk read or
                // discard an in-flight render. Render caches are invalidated by
                // loadData() when the catalog actually changes, and artwork sync
                // invalidates the affected render namespace separately.
            }

            this.lastSuccessfulSyncAt = new Date().toISOString();
            this.lastSyncError = null;
            const result = {
                changed,
                syncedAt: this.lastSuccessfulSyncAt
            };
            this.recordCatalogSyncTelemetry({
                startedAt: syncStartedAt,
                trigger,
                telemetryOrigin,
                latest,
                changed,
                dataFingerprintBefore,
                dataFingerprintAfter: this.getCatalogDataFingerprint(),
                changeSummary
            });
            return result;
        } catch (e: any) {
            this.lastSyncError = e?.message || String(e);
            this.recordCatalogSyncTelemetry({
                startedAt: syncStartedAt,
                trigger,
                telemetryOrigin,
                latest,
                changed,
                dataFingerprintBefore,
                dataFingerprintAfter: this.getCatalogDataFingerprint(),
                changeSummary,
                error: e
            });
            console.error("[FortniteSprites] Failed to sync sprite data:", this.lastSyncError);
            return {
                changed: false,
                syncedAt: new Date().toISOString()
            };
        } finally {
            this.isSyncingSprites = false;
        }
    }

    private parseSpriteDataForTelemetry(json: string): SpriteDataFile | null {
        if (!json) return null;
        try {
            const parsed = JSON.parse(json) as SpriteDataFile;
            return Array.isArray(parsed?.families) ? parsed : null;
        } catch {
            return null;
        }
    }

    private getSpriteVariantMap(data: SpriteDataFile | null) {
        const variants = new Map<string, SpriteVariant>();
        for (const family of data?.families || []) {
            for (const variant of family.variants) {
                const key = `${family.key}:${variant.id}:${variant.variant.toLowerCase()}`;
                variants.set(key, variant);
            }
        }
        return variants;
    }

    private summarizeSpriteCatalogChanges(existingJson: string, latest: SpriteDataFile): SpriteCatalogChangeSummary {
        const previousVariants = this.getSpriteVariantMap(this.parseSpriteDataForTelemetry(existingJson));
        const latestVariants = this.getSpriteVariantMap(latest);
        let changedVariants = 0;
        const changedFieldCounts: Record<string, number> = {};
        const examples: Array<Record<string, unknown>> = [];
        const comparableFields: Array<keyof SpriteVariant> = [
            "name",
            "rarity",
            "chancePercent",
            "chanceLabel",
            "spawnRates",
            "starter",
            "variant",
            "summonCost",
            "imageUrl",
            "effectText",
            "specialEffectText",
            "detailStatus",
            "sourceSeasonKey",
            "isUnreleased",
            "introducedSeasonId",
            "availableSeasonIds"
        ];

        const addChange = (variant: SpriteVariant, familyKey: string, fields: string[], previous?: SpriteVariant) => {
            if (fields.length === 0) return;
            changedVariants++;
            fields.forEach(field => {
                changedFieldCounts[field] = (changedFieldCounts[field] || 0) + 1;
            });
            if (examples.length >= 50) return;
            const example: Record<string, unknown> = {
                id: variant.id,
                familyKey,
                name: variant.name,
                variant: variant.variant,
                fields
            };
            if (fields.includes("summonCost")) {
                example.previousSummonCost = previous?.summonCost ?? null;
                example.currentSummonCost = variant.summonCost;
            }
            examples.push(example);
        };

        for (const [key, variant] of latestVariants.entries()) {
            const previous = previousVariants.get(key);
            const familyKey = key.split(":", 1)[0];
            if (!previous) {
                addChange(variant, familyKey, ["added"]);
                continue;
            }

            const fields = comparableFields.filter(field => JSON.stringify(previous[field] ?? null) !== JSON.stringify(variant[field] ?? null));
            addChange(variant, familyKey, fields, previous);
        }

        for (const [key, previous] of previousVariants.entries()) {
            if (latestVariants.has(key)) continue;
            const familyKey = key.split(":", 1)[0];
            addChange(previous, familyKey, ["removed"], previous);
        }

        return {
            changedVariants,
            changedFieldCounts,
            examples
        };
    }

    private normalizeWhitespace(value: string | null | undefined) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    private normalizePercentValue(value: unknown) {
        if (typeof value === "number" && Number.isFinite(value)) return value;
        if (typeof value === "string") {
            const parsed = parseFloat(value.replace("%", "").replace(/,/g, "").trim());
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    }

    private formatPercentLabel(percent: number) {
        if (!Number.isFinite(percent)) return "Unknown";
        if (percent === 0) return "0%";
        const fixed = percent >= 10 || Number.isInteger(percent) ? percent.toString() : percent.toFixed(percent < 1 ? 2 : 1);
        return `${fixed.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1")}%`;
    }

    private spawnRatePriority(key: string) {
        if (key === "spriteChest") return 0;
        if (key === "rareChest") return 1;
        if (key === "chest") return 2;
        if (key === "supplyDrop") return 3;
        if (key === "global") return 4;
        return 2;
    }

    private normalizeSpawnRateKey(key: string | undefined) {
        const rawKey = String(key || "").trim();
        if (!rawKey) return "global";
        const normalized = rawKey
            .replace(/[_\s]+/g, "-")
            .replace(/[^\w-]+/g, "")
            .toLowerCase();
        if (normalized === "sprite-chest" || normalized === "spritechest") return "spriteChest";
        if (normalized === "rare-chest" || normalized === "rarechest") return "rareChest";
        if (normalized === "supply-drop" || normalized === "supplydrop") return "supplyDrop";
        if (normalized === "global" || normalized === "overall" || normalized === "default") return "global";
        return normalized.replace(/-([a-z])/g, (_, char: string) => char.toUpperCase());
    }

    private spawnRateLabelForKey(key: string) {
        const labels: Record<string, string> = {
            spriteChest: "Sprite Chest",
            rareChest: "Rare Chest",
            chest: "Chest",
            supplyDrop: "Supply Drop",
            global: "Global"
        };
        if (labels[key]) return labels[key];
        return this.titleCase(key.replace(/([a-z])([A-Z])/g, "$1 $2"));
    }

    private isPercentLikeLabel(value: unknown) {
        return typeof value === "string" && value.includes("%") && this.normalizePercentValue(value) != null;
    }

    private createSpawnRateEntry(rawKey: string | undefined, rawValue: unknown): SpriteSpawnRateEntry | null {
        if (rawValue == null) return null;

        const objectValue = typeof rawValue === "object" ? rawValue as Record<string, unknown> : null;
        const key = this.normalizeSpawnRateKey(
            objectValue?.key as string
            || objectValue?.type as string
            || objectValue?.name as string
            || rawKey
        );
        const percent = this.normalizePercentValue(
            objectValue?.percent
            ?? objectValue?.chancePercent
            ?? objectValue?.rate
            ?? objectValue?.value
            ?? rawValue
        );

        if (percent == null) return null;

        const display = this.normalizeWhitespace(
            typeof rawValue === "string"
                ? rawValue
                : objectValue?.display as string
                || objectValue?.formatted as string
                || objectValue?.chanceLabel as string
                || objectValue?.label as string
        ) || this.formatPercentLabel(percent);

        const objectLabel = this.normalizeWhitespace(objectValue?.label as string);
        return {
            key,
            label: objectLabel && !this.isPercentLikeLabel(objectLabel) ? objectLabel : this.spawnRateLabelForKey(key),
            percent,
            display,
            priority: this.spawnRatePriority(key)
        };
    }

    private getSpawnRateEntries(variant: SpriteVariant): SpriteSpawnRateEntry[] {
        const rawVariant = variant as SpriteVariant & Record<string, unknown>;
        const entries = new Map<string, SpriteSpawnRateEntry>();
        const pushEntry = (rawKey: string | undefined, rawValue: unknown) => {
            const entry = this.createSpawnRateEntry(rawKey, rawValue);
            if (!entry) return;
            const existing = entries.get(entry.key);
            if (!existing || entry.priority < existing.priority) {
                entries.set(entry.key, entry);
            }
        };

        const rawSpawnRates = rawVariant.spawnRates;
        if (Array.isArray(rawSpawnRates)) {
            for (const rate of rawSpawnRates) {
                pushEntry(undefined, rate);
            }
        } else if (rawSpawnRates && typeof rawSpawnRates === "object") {
            for (const [key, value] of Object.entries(rawSpawnRates as Record<string, unknown>)) {
                pushEntry(key, value);
            }
        }

        const topLevelStructuredEntries: Array<[string, unknown]> = [
            ["spriteChest", rawVariant.spriteChestSpawnRate ?? rawVariant.spriteChestRate ?? rawVariant.spriteChestChance ?? rawVariant.spriteChest],
            ["global", rawVariant.globalSpawnRate ?? rawVariant.globalRate ?? rawVariant.globalChance]
        ];

        for (const [key, value] of topLevelStructuredEntries) {
            pushEntry(key, value);
        }

        if (!entries.has("spriteChest") && (rawVariant.spriteChestChancePercent != null || rawVariant.spriteChestChanceLabel != null)) {
            pushEntry("spriteChest", {
                chancePercent: rawVariant.spriteChestChancePercent,
                chanceLabel: rawVariant.spriteChestChanceLabel
            });
        }

        if (!entries.has("global") && (rawVariant.globalChancePercent != null || rawVariant.globalChanceLabel != null)) {
            pushEntry("global", {
                chancePercent: rawVariant.globalChancePercent,
                chanceLabel: rawVariant.globalChanceLabel
            });
        }

        if (entries.size === 0 && (variant.chanceLabel || Number.isFinite(variant.chancePercent))) {
            pushEntry("global", {
                chancePercent: variant.chancePercent,
                chanceLabel: variant.chanceLabel
            });
        }

        return Array.from(entries.values())
            .sort((a, b) => a.priority - b.priority || a.percent - b.percent || a.label.localeCompare(b.label));
    }

    private getPrimarySpawnRate(variant: SpriteVariant) {
        const entries = this.getSpawnRateEntries(variant);
        return entries.find(entry => entry.key === "spriteChest")
            || entries.find(entry => entry.key === "global")
            || entries[0]
            || null;
    }

    private getLowestSpawnRate(variant: SpriteVariant) {
        const entries = this.getSpawnRateEntries(variant).filter(entry => entry.percent > 0);
        if (entries.length === 0) return null;
        return [...entries].sort((a, b) => a.percent - b.percent || a.priority - b.priority)[0];
    }

    private findRarestVariant(variants = this.getAllVariants()) {
        const variantsWithRates = variants
            .map(variant => ({
                variant,
                lowestRate: this.getLowestSpawnRate(variant) || this.getPrimarySpawnRate(variant)
            }))
            .filter((entry): entry is { variant: SpriteVariant; lowestRate: SpriteSpawnRateEntry } => !!entry.lowestRate);

        return variantsWithRates
            .sort((a, b) =>
                a.lowestRate.percent - b.lowestRate.percent
                || a.lowestRate.priority - b.lowestRate.priority
                || a.variant.id - b.variant.id
            )[0]?.variant;
    }

    private maybeQueueRuntimeRefresh(
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN,
        trigger: SpriteSyncTrigger = "interaction"
    ) {
        if (this.runtimeRefreshPromise) return this.activeRefreshGeneration;
        if (Date.now() - this.lastRuntimeRefreshQueuedAt < this.runtimeRefreshCooldownMs) return null;

        this.lastRuntimeRefreshQueuedAt = Date.now();
        const generation = ++this.refreshGenerationCounter;
        this.activeRefreshGeneration = generation;
        this.runtimeRefreshPromise = this.runRuntimeRefresh(generation, telemetryOrigin, trigger)
            .catch((error) => {
                console.error("[FortniteSprites] Runtime refresh queue failed:", error);
            })
            .finally(() => {
                this.clearRefreshGeneration(generation);
                if (this.activeRefreshGeneration === generation) {
                    this.activeRefreshGeneration = null;
                }
                this.runtimeRefreshPromise = null;
            });

        return generation;
    }

    private async runRuntimeRefresh(
        generation: number,
        telemetryOrigin: SpriteTelemetryOrigin,
        trigger: SpriteSyncTrigger
    ) {
        // Always perform the full cooldown-gated sync so detail-page-only changes
        // are picked up even when the main sprite list page has not changed.
        const syncResult = await this.syncLatestSprites(telemetryOrigin, trigger);
        const assetSyncResult = await this.syncProductionSpriteAssets(undefined, telemetryOrigin);
        if (syncResult?.changed || assetSyncResult.changed) {
            await this.markTrackedMessagesRefreshing(generation);
            await this.refreshTrackedMessages(generation, syncResult.syncedAt);
            this.startProductionRenderGeneration("Fortnite data update");
        }
    }

    private clearRefreshGeneration(generation: number) {
        for (const [messageId, state] of this.trackedSpriteMessages.entries()) {
            if (state.refreshGeneration !== generation) continue;
            this.trackedSpriteMessages.set(messageId, {
                ...state,
                refreshGeneration: null
            });
        }
    }

    private pruneTrackedMessages() {
        if (this.trackedSpriteMessages.size <= this.maxTrackedMessages) return;
        const oldest = [...this.trackedSpriteMessages.values()]
            .sort((a, b) => a.updatedAt - b.updatedAt)
            .slice(0, this.trackedSpriteMessages.size - this.maxTrackedMessages);
        for (const state of oldest) {
            this.trackedSpriteMessages.delete(state.messageId);
        }
    }

    private queueMessageEdit(messageId: string, task: () => Promise<void>) {
        const previous = this.messageEditPipelines.get(messageId) || Promise.resolve();
        const next = previous
            .catch(() => { })
            .then(task)
            .finally(() => {
                if (this.messageEditPipelines.get(messageId) === next) {
                    this.messageEditPipelines.delete(messageId);
                }
            });
        this.messageEditPipelines.set(messageId, next);
        return next;
    }

    private beginInteraction(messageId: string) {
        const sequence = ++this.interactionSequenceCounter;
        this.latestInteractionSequences.set(messageId, sequence);
        return sequence;
    }

    private isLatestInteraction(messageId: string, sequence: number) {
        return this.latestInteractionSequences.get(messageId) === sequence;
    }

    private beginTrackedMessageTransition(
        message: Pick<Message, "id" | "channelId">,
        ownerId: string,
        author: SpriteAuthor,
        view: SpriteViewState,
        refreshGeneration: number | null,
        renderDataFingerprint = this.getRenderDataFingerprint()
    ) {
        const previous = this.trackedSpriteMessages.get(message.id);
        const nextState: SpriteMessageState = {
            messageId: message.id,
            channelId: message.channelId,
            ownerId,
            author,
            view,
            viewVersion: (previous?.viewVersion || 0) + 1,
            editToken: (previous?.editToken || 0) + 1,
            refreshGeneration,
            renderDataFingerprint,
            updatedAt: Date.now()
        };
        this.trackedSpriteMessages.set(message.id, nextState);
        this.pruneTrackedMessages();
        return nextState;
    }

    private rememberSpriteMessage(
        message: Message,
        ownerId: string,
        author: SpriteAuthor,
        view: SpriteViewState,
        refreshGeneration: number | null,
        renderDataFingerprint = this.getRenderDataFingerprint()
    ) {
        const previous = this.trackedSpriteMessages.get(message.id);
        this.trackedSpriteMessages.set(message.id, {
            messageId: message.id,
            channelId: message.channelId,
            ownerId,
            author,
            view,
            viewVersion: (previous?.viewVersion || 0) + 1,
            editToken: previous?.editToken || 1,
            refreshGeneration,
            renderDataFingerprint,
            updatedAt: Date.now()
        });
        this.pruneTrackedMessages();
    }

    private async fetchTrackedMessage(state: SpriteMessageState) {
        const channel = await this.client.channels.fetch(state.channelId).catch(() => null);
        if (!channel || !("messages" in channel)) return null;
        return (channel as any).messages.fetch(state.messageId).catch(() => null) as Promise<Message | null>;
    }

    private async forEachConcurrent<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
        const queue = [...items];
        const workers = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
            while (queue.length > 0) {
                const next = queue.shift();
                if (!next) continue;
                await worker(next);
            }
        });
        await Promise.all(workers);
    }

    private getRefreshTargets(generation: number) {
        const currentFingerprint = this.getRenderDataFingerprint();
        return [...this.trackedSpriteMessages.values()]
            .filter(state => state.refreshGeneration === generation || state.renderDataFingerprint !== currentFingerprint)
            .sort((a, b) => b.updatedAt - a.updatedAt);
    }

    private async markTrackedMessagesRefreshing(generation: number) {
        const targets = this.getRefreshTargets(generation);
        const targetIds = new Set(targets.map(state => state.messageId));
        for (const state of targets) {
            const liveState = this.trackedSpriteMessages.get(state.messageId);
            if (!liveState || !targetIds.has(state.messageId)) continue;
            const expectedVersion = liveState.viewVersion;
            const expectedToken = liveState.editToken;
            const message = await this.fetchTrackedMessage(liveState);
            if (!message) continue;

            await this.queueMessageEdit(state.messageId, async () => {
                const queuedState = this.trackedSpriteMessages.get(state.messageId);
                if (!queuedState || queuedState.viewVersion !== expectedVersion || queuedState.editToken !== expectedToken) return;
                await message.edit({ content: "Sprite fetch in progress" }).catch((error) => {
                    console.warn(`[FortniteSprites] Failed to mark tracked sprite message ${state.messageId} as refreshing:`, error);
                });
            });
        }
    }

    private async refreshTrackedMessages(generation: number, editedAt: string) {
        const targets = this.getRefreshTargets(generation);
        if (targets.length === 0) return;

        const refreshOne = async (state: SpriteMessageState) => {
            const liveState = this.trackedSpriteMessages.get(state.messageId);
            const currentFingerprint = this.getRenderDataFingerprint();
            if (!liveState || (liveState.refreshGeneration !== generation && liveState.renderDataFingerprint === currentFingerprint)) return;
            const expectedVersion = liveState.viewVersion;
            const expectedToken = liveState.editToken;
            const message = await this.fetchTrackedMessage(liveState);
            if (!message) return;

            const response = await this.generateResponseForView(
                liveState.view,
                liveState.ownerId,
                liveState.author,
                editedAt,
                liveState.messageId
            );
            const latestState = this.trackedSpriteMessages.get(state.messageId);
            if (!latestState || latestState.viewVersion !== expectedVersion || latestState.editToken !== expectedToken) return;
            if (latestState.refreshGeneration !== generation && latestState.renderDataFingerprint === currentFingerprint) return;

            await this.queueMessageEdit(state.messageId, async () => {
                const queuedState = this.trackedSpriteMessages.get(state.messageId);
                if (!queuedState || queuedState.viewVersion !== expectedVersion || queuedState.editToken !== expectedToken) return;

                await message.edit({ ...response, content: "", attachments: [] } as any).catch((error) => {
                    console.warn(`[FortniteSprites] Failed to refresh tracked sprite message ${state.messageId}:`, error);
                });
            });
            const refreshedState = this.trackedSpriteMessages.get(state.messageId);
            if (refreshedState && refreshedState.viewVersion === expectedVersion && refreshedState.editToken === expectedToken) {
                this.trackedSpriteMessages.set(state.messageId, {
                    ...refreshedState,
                    refreshGeneration: null,
                    renderDataFingerprint: this.getRenderDataFingerprint(),
                    updatedAt: Date.now()
                });
            }
        };

        // The newest page is the user's active page. Finish it first, then let
        // the remaining stale messages drain without racing that first refresh.
        const [priority, ...remaining] = targets;
        if (priority) await refreshOne(priority);
        await this.forEachConcurrent(remaining, this.refreshEditConcurrency, refreshOne);
    }

    private createAuthor(displayName: string, iconURL?: string, username?: string): SpriteAuthor {
        return { name: displayName, iconURL, username };
    }

    private createTelemetryOrigin(
        username?: string | null,
        messageId?: string | null,
        requestId?: string | null,
        interactedByUsername?: string | null
    ): SpriteTelemetryOrigin {
        return {
            initiatedByUsername: username || null,
            interactedByUsername: interactedByUsername || username || null,
            messageId: messageId || null,
            requestId: requestId || null
        };
    }

    private getTelemetryOrigin(user: User | SpriteAuthor, messageId?: string, requestId?: string) {
        const username = "username" in user && user.username
            ? user.username
            : "name" in user ? user.name : null;
        return this.createTelemetryOrigin(username, messageId, requestId);
    }

    private getAuthorIconURL(user: User | SpriteAuthor) {
        return "displayAvatarURL" in user ? user.displayAvatarURL({ dynamic: true }) : user.iconURL;
    }

    private async generateResponseForView(
        view: SpriteViewState,
        ownerId: string,
        author: SpriteAuthor,
        editedAt?: string,
        messageId?: string
    ) {
        const telemetryOrigin = this.getTelemetryOrigin(author, messageId);
        if (view.kind === "family") {
            return this.generateFamilyResponse(view.familyKey, ownerId, author, author.name, editedAt, view.state || {}, telemetryOrigin);
        }

        if (view.kind === "detail") {
            const match = this.findVariantInFamily(view.familyKey, view.variantId);
            if (!match) {
                return this.generateOverviewResponse({}, ownerId, author, author.name, editedAt, telemetryOrigin);
            }
            return this.generateDetailResponse(match.family, match.variant, ownerId, author, author.name, editedAt, view.state || {}, telemetryOrigin);
        }

        return this.generateOverviewResponse(view.state, ownerId, author, author.name, editedAt, telemetryOrigin);
    }

    private getFamilyAliases(familyKey?: string) {
        const aliases: Record<string, string[]> = {
            water: ["shield", "shields", "river", "beach"],
            earth: ["loot", "chest", "rare"],
            fire: ["burst", "damage", "fight", "combat"],
            duck: ["shield", "shields", "emote", "jam", "jamming"],
            ghost: ["shield", "cloak", "invisible", "reload", "night"],
            dream: ["loot", "chest", "random", "storage"],
            punk: ["secret", "mystery", "rare chest"],
            king: ["pickaxe", "melee", "damage"],
            "zero-point": ["heal", "healing", "shield", "bubble", "shield bubble"],
            demon: ["heal", "healing", "siphon", "health", "shield", "elimination"],
            "burnt-peanut": ["heal", "healing", "loot", "mythic", "elimination", "relic"]
        };
        return familyKey ? aliases[familyKey] || [] : [];
    }

    private getFamilySearchTokens(familyKey?: string) {
        const tokens: Record<string, string[]> = {
            water: ["droplet", "aqua", "blue"],
            earth: ["leaf", "nature", "green"],
            fire: ["flame", "heat", "red"],
            duck: ["bird", "yellow", "quack"],
            ghost: ["spirit", "haunt", "phantom"],
            dream: ["sleep", "nap", "cloud"],
            punk: ["guitar", "rock", "music"],
            king: ["crown", "royal", "gold"],
            "zero-point": ["portal", "rift", "orb"],
            demon: ["devil", "horns", "hellfire"],
            "burnt-peanut": ["peanut", "nut", "toast"]
        };

        if (!familyKey) return [];
        return [this.familyEmoji(familyKey), familyKey, ...(tokens[familyKey] || []), ...this.getFamilyAliases(familyKey)];
    }

    private getVariantSearchTokens(variant?: SpriteVariantName) {
        const tokens: Record<SpriteVariantName, string[]> = {
            Base: ["starter", "default", "seed", "green"],
            Candy: ["gummy", "candy", "sweet", "pink"],
            Galaxy: ["space", "cosmic", "stars", "purple"],
            Gold: ["gold", "shiny", "crown", "yellow"]
        };

        if (!variant) return [];
        return [this.variantEmoji(variant), variant, this.variantLabel(variant), ...(tokens[variant] || [])];
    }

    private getRaritySearchTokens(rarity?: SpriteRarity) {
        const tokens: Record<SpriteRarity, string[]> = {
            rare: ["blue"],
            epic: ["purple"],
            legendary: ["orange"],
            mythic: ["golden", "yellow"],
            special: ["teal", "unique"]
        };

        if (!rarity) return [];
        return [this.rarityEmoji(rarity), rarity, this.titleCase(rarity), ...(tokens[rarity] || [])];
    }

    private buildSearchText(...parts: Array<string | number | null | undefined | string[]>) {
        return parts
            .flatMap(part => Array.isArray(part) ? part : [part])
            .map(part => this.normalizeWhitespace(part == null ? "" : String(part)))
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
    }

    private expandSearchQuery(query: string) {
        const extras: string[] = [];

        for (const family of this._data?.families || []) {
            if (query.includes(this.familyEmoji(family.key))) extras.push(...this.getFamilySearchTokens(family.key));
        }

        for (const variant of this.getVariantNames()) {
            if (query.includes(this.variantEmoji(variant))) extras.push(...this.getVariantSearchTokens(variant));
        }

        for (const rarity of RARITY_ORDER) {
            if (query.includes(this.rarityEmoji(rarity))) extras.push(...this.getRaritySearchTokens(rarity));
        }

        return this.buildSearchText(query, extras);
    }

    private getDirectVariantIdMatches(query: string) {
        const trimmed = query.trim();
        const prefixedMatch = trimmed.match(/^(?:search:\s*)?(?:variant|id)\s*:\s*#?(\d+)$/i);
        const numericOnly = prefixedMatch ? prefixedMatch[1] : trimmed.replace(/^#/, "");
        if (!/^\d+$/.test(numericOnly)) return [];

        return this.searchItems
            .filter(item => item.type === "variant" && item.variantId != null && String(item.variantId).includes(numericOnly))
            .sort((a, b) => {
                const aId = String(a.variantId);
                const bId = String(b.variantId);
                const rank = (id: string) => id === numericOnly ? 0 : id.startsWith(numericOnly) ? 1 : 2;
                return rank(aId) - rank(bId) || aId.length - bId.length || b.sortId - a.sortId;
            });
    }

    private parseVariantIdQuery(value: string | undefined) {
        const rawValue = String(value || "").trim();
        if (!rawValue) return null;

        const directNumeric = rawValue.replace(/^#/, "");
        if (/^\d+$/.test(directNumeric)) {
            const id = parseInt(directNumeric, 10);
            return this.findVariant(id) ? id : null;
        }

        const prefixedMatch = rawValue.match(/^(?:search:\s*)?(?:variant|id)\s*:\s*#?(\d+)$/i);
        if (!prefixedMatch) return null;

        const id = parseInt(prefixedMatch[1], 10);
        return this.findVariant(id) ? id : null;
    }

    private buildSearchIndex() {
        if (!this._data) return;

        const items: SpriteSearchItem[] = [];

        for (const family of this._data.families) {
            const familyAliases = this.getFamilyAliases(family.key);
            const familyVariants = family.variants
                .map(v => `${v.name} ${this.variantLabel(v.variant)} ${v.rarity} ${this.formatChance(v)} #${v.id}`)
                .join(" ");

            items.push({
                type: "family",
                name: family.displayName,
                value: `family:${family.key}`,
                familyKey: family.key,
                searchable: this.buildSearchText(
                    family.displayName,
                    family.key,
                    this.getFamilySearchTokens(family.key),
                    family.effectSummary,
                    family.levelScaling,
                    family.location,
                    familyVariants,
                    familyAliases,
                    family.variants.map(variant => `#${variant.id} ${variant.id}`).join(" ")
                ),
                starter: family.variants.some(v => v.starter),
                priority: family.variants.some(v => v.starter) ? 0 : 1,
                sortId: Math.max(...family.variants.map(variant => variant.id))
            });

            for (const variant of family.variants) {
                const spawnRates = this.getSpawnRateEntries(variant).map(rate => `${rate.label} ${rate.display}`).join(" ");
                items.push({
                    type: "variant",
                    name: variant.name,
                    value: `variant:${family.key}:${variant.id}`,
                    familyKey: family.key,
                    variantId: variant.id,
                    rarity: variant.rarity,
                    variant: variant.variant,
                    searchable: this.buildSearchText(
                        variant.name,
                        `#${variant.id}`,
                        variant.id.toString(),
                        family.displayName,
                        family.key,
                        this.getFamilySearchTokens(family.key),
                        this.getVariantSearchTokens(variant.variant),
                        this.getRaritySearchTokens(variant.rarity),
                        variant.rarity,
                        this.variantLabel(variant.variant),
                        variant.variant,
                        this.formatChance(variant),
                        spawnRates,
                        variant.summonCost.toString(),
                        family.location,
                        family.effectSummary,
                        family.levelScaling,
                        familyAliases
                    ),
                    starter: variant.starter,
                    priority: variant.starter ? 0 : variant.variant === "Base" ? 1 : 2,
                    sortId: variant.id
                });
            }
        }

        this.searchItems = items;
        this.fuse = new Fuse(items, {
            keys: [
                { name: "name", weight: 1 },
                { name: "searchable", weight: 0.65 },
                { name: "rarity", weight: 0.3 },
                { name: "variant", weight: 0.35 }
            ],
            threshold: 0.35,
            includeScore: true
        });
    }

    private getAllVariants() {
        return this._data?.families.flatMap(f => f.variants) || [];
    }

    private hasReleasedArtwork(variant: SpriteVariant) {
        // The detail dataset includes future variants with temporary black placeholder
        // assets. A real image asset is sufficient to show a variant even when the
        // base /sprites listing has not started listing it yet.
        return !!variant.imageUrl && !/(?:^|\/)tmp_[^/]+(?:\.[^/]*)?$/i.test(variant.imageUrl);
    }

    private getDisplayFamilies(families: SpriteFamily[]) {
        // Match the main sprites page: visibility comes from having released artwork,
        // not from spawn chance or a second variant-ID list. This preserves valid assets
        // such as Zero Point Gem and Quack while excluding temporary black placeholders.
        return families
            .map(family => ({
                ...family,
                variants: family.variants.filter(variant => this.hasReleasedArtwork(variant))
            }))
            .filter(family => family.variants.length > 0);
    }

    private findFamily(key: string | undefined): SpriteFamily | undefined {
        return this._data?.families.find(f => f.key === key);
    }

    private findVariant(id: number | undefined): { family: SpriteFamily; variant: SpriteVariant } | undefined {
        if (!id || !this._data) return undefined;
        for (const family of this._data.families) {
            const variant = family.variants.find(v => v.id === id);
            if (variant) return { family, variant };
        }
        return undefined;
    }

    private findVariantInFamily(familyKey: string | undefined, id: number | undefined): { family: SpriteFamily; variant: SpriteVariant } | undefined {
        const family = this.findFamily(familyKey);
        const variant = family?.variants.find(candidate => candidate.id === id);
        return family && variant ? { family, variant } : undefined;
    }

    private resolveSearchIntent(value: string | undefined): SpriteSearchIntent {
        const rawValue = String(value || "").trim();
        if (!rawValue) return { kind: "overview", state: {} };
        const parsedVariantId = this.parseVariantIdQuery(rawValue);
        if (parsedVariantId) return { kind: "variant", variantId: parsedVariantId };

        if (rawValue === "browse:all") return { kind: "overview", state: {} };
        if (rawValue.startsWith("filter:rarity:")) {
            const rarity = rawValue.replace("filter:rarity:", "") as SpriteRarity;
            return { kind: "overview", state: { rarityFilter: rarity } };
        }
        if (rawValue.startsWith("filter:variant:")) {
            const variant = rawValue.replace("filter:variant:", "") as SpriteVariantName;
            return { kind: "overview", state: { variantFilter: variant } };
        }
        if (rawValue.startsWith("search:")) {
            const searchBody = rawValue.replace(/^search:\s*/i, "");
            const searchedVariantId = this.parseVariantIdQuery(searchBody);
            if (searchedVariantId) return { kind: "variant", variantId: searchedVariantId };
            return { kind: "overview", state: { searchQuery: searchBody } };
        }

        if (rawValue.startsWith("family:") || rawValue.startsWith("variant:")) {
            const item = this.searchItems.find(searchItem => searchItem.value === rawValue);
            if (item?.type === "family") return { kind: "family", familyKey: item.familyKey };
            if (item?.type === "variant" && item.variantId) return { kind: "variant", variantId: item.variantId, familyKey: item.familyKey };
            const legacyVariantId = rawValue.match(/^variant:(\d+)$/)?.[1];
            if (legacyVariantId) return { kind: "variant", variantId: Number(legacyVariantId) };
        }

        const q = rawValue.toLowerCase();
        if (["browse", "overview", "all", "list", "sprites"].includes(q)) return { kind: "overview", state: {} };

        const matchingRarity = RARITY_ORDER.find(rarity => rarity === q || this.titleCase(rarity).toLowerCase() === q);
        if (matchingRarity) return { kind: "overview", state: { rarityFilter: matchingRarity } };

        const matchingVariant = this.getVariantNames().find(variant =>
            variant.toLowerCase() === q || this.variantLabel(variant).toLowerCase() === q
        );
        if (matchingVariant) return { kind: "overview", state: { variantFilter: matchingVariant } };

        const exact = this.searchItems.find(item => item.name.toLowerCase() === q);
        if (exact?.type === "family") return { kind: "family", familyKey: exact.familyKey };
        if (exact?.type === "variant" && exact.variantId) return { kind: "variant", variantId: exact.variantId, familyKey: exact.familyKey };

        const best = this.fuse?.search(this.expandSearchQuery(rawValue))?.[0];
        if (best && (best.score ?? 1) <= 0.08) {
            if (best.item.type === "family") return { kind: "family", familyKey: best.item.familyKey };
            if (best.item.variantId) return { kind: "variant", variantId: best.item.variantId, familyKey: best.item.familyKey };
        }

        return { kind: "overview", state: { searchQuery: rawValue } };
    }

    private resolveAutocomplete(i: AutocompleteInteraction<CacheType>) {
        const query = String(i.options.getFocused(true).value || "").trim();
        if (!this._data || !this.fuse) return i.respond([]);

        const choices: { name: string; value: string }[] = [];
        if (!query) {
            const baseFamilies = this.searchItems.filter(item => item.type === "family");
            choices.push(
                { name: "🆕 Browse current-season sprites", value: "browse:all" },
                { name: "🌟 Show mythic sprites", value: "filter:rarity:mythic" },
                { name: "🍬 Show Gummy variants", value: "filter:variant:Candy" }
            );

            for (const item of baseFamilies) {
                choices.push(this.formatAutocompleteChoice(item));
                if (choices.length >= 25) break;
            }

            return i.respond(choices.slice(0, 25));
        }

        const q = query.toLowerCase();
        choices.push({ name: this.truncate(`🔎 Search results for "${query}"`, 100), value: `search:${this.truncate(query, 93)}` });

        for (const rarity of RARITY_ORDER) {
            if (rarity.includes(q) || q.includes(rarity)) {
                choices.push({ name: `${this.rarityEmoji(rarity)} Show ${this.titleCase(rarity)} sprites`, value: `filter:rarity:${rarity}` });
            }
        }

        for (const variant of this.getVariantNames()) {
            const label = this.variantLabel(variant);
            if (variant.toLowerCase().includes(q) || label.toLowerCase().includes(q) || q.includes(variant.toLowerCase()) || q.includes(label.toLowerCase())) {
                choices.push({ name: `${this.variantEmoji(variant)} Show ${label} variants`, value: `filter:variant:${variant}` });
            }
        }

        const results = this.fuse.search(query).map(r => r.item);
        const unique = new Map<string, SpriteSearchItem>();
        for (const item of results) {
            if (!unique.has(item.value)) unique.set(item.value, item);
        }

        const ranked = Array.from(unique.values())
            .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
            .map(item => this.formatAutocompleteChoice(item));

        const deduped = new Map<string, { name: string; value: string }>();
        for (const choice of [...choices, ...ranked]) {
            if (!deduped.has(choice.value)) deduped.set(choice.value, choice);
        }

        return i.respond(Array.from(deduped.values()).slice(0, 25));
    }

    private resolveAutocompleteLatest(i: AutocompleteInteraction<CacheType>) {
        const focused = i.options.getFocused(true);
        const query = String(focused.value || "").trim();
        if (focused.name === "season") return this.resolveSeasonAutocomplete(i, query);
        if (!this._data || !this.fuse) return i.respond([]);

        const choices: { name: string; value: string }[] = [];
        if (!query) {
            const newestVariants = this.searchItems
                .filter(item => item.type === "variant")
                .sort((a, b) => b.sortId - a.sortId);

            for (const item of newestVariants) {
                choices.push(this.formatAutocompleteChoice(item));
                if (choices.length >= 23) break;
            }

            choices.push(
                { name: `${this.familyEmoji()} Browse current-season sprites`, value: "browse:all" }
            );

            return i.respond(choices.slice(0, 25));
        }

        const q = this.expandSearchQuery(query);
        choices.push({ name: this.truncate(`Search results for "${query}"`, 100), value: `search:${this.truncate(query, 93)}` });

        for (const rarity of RARITY_ORDER) {
            if (rarity.includes(q) || q.includes(rarity)) {
                choices.push({ name: `${this.rarityEmoji(rarity)} Show ${this.titleCase(rarity)} sprites`, value: `filter:rarity:${rarity}` });
            }
        }

        for (const variant of this.getVariantNames()) {
            const label = this.variantLabel(variant);
            if (variant.toLowerCase().includes(q) || label.toLowerCase().includes(q) || q.includes(variant.toLowerCase()) || q.includes(label.toLowerCase())) {
                choices.push({ name: `${this.variantEmoji(variant)} Show ${label} variants`, value: `filter:variant:${variant}` });
            }
        }

        const directIdMatches = this.getDirectVariantIdMatches(query);
        const results = [...directIdMatches, ...this.fuse.search(q).map(result => result.item)];
        const unique = new Map<string, SpriteSearchItem>();
        for (const item of results) {
            if (!unique.has(item.value)) unique.set(item.value, item);
        }

        const ranked = Array.from(unique.values())
            .sort((a, b) => {
                const aDirect = directIdMatches.some(match => match.value === a.value) ? 0 : 1;
                const bDirect = directIdMatches.some(match => match.value === b.value) ? 0 : 1;
                return aDirect - bDirect || a.priority - b.priority || b.sortId - a.sortId || a.name.localeCompare(b.name);
            })
            .map(item => this.formatAutocompleteChoice(item));

        const deduped = new Map<string, { name: string; value: string }>();
        for (const choice of [...choices, ...ranked]) {
            if (!deduped.has(choice.value)) deduped.set(choice.value, choice);
        }

        return i.respond(Array.from(deduped.values()).slice(0, 25));
    }

    private resolveSeasonAutocomplete(i: AutocompleteInteraction<CacheType>, query: string) {
        const q = query.toLowerCase();
        const choices = [
            { name: "🗃️ All recorded seasons", value: "all" },
            ...this.getAvailableSeasonIds().map(id => ({ name: this.formatSeasonId(id), value: id }))
        ].filter(choice => !q || choice.name.toLowerCase().includes(q) || choice.value.includes(q));
        return i.respond(choices.slice(0, 25));
    }

    private async replySprites(i: BaseCommandInteraction<CacheType>) {
        const search = i.options.get("search")?.value as string | undefined;
        const requestedSeason = i.options.get("season")?.value as string | undefined;
        await i.deferReply();

        if (!this._data) {
            return i.editReply({ content: "Sprite data is not loaded yet. Try again in a minute." });
        }

        const displayName = await this.getDisplayName(i as CommandInteraction<CacheType>);
        const author = this.createAuthor(displayName, i.user.displayAvatarURL({ dynamic: true }), i.user.username);
        const telemetryOrigin = this.createTelemetryOrigin(i.user.username, null, i.id);
        const responseDataFingerprint = this.getRenderDataFingerprint();
        const result = this.resolveSearchIntent(search);
        const seasonFilter = requestedSeason
            ? this.normalizeSeasonFilter(requestedSeason)
            : result.kind === "overview" ? this.normalizeSeasonFilter() : "all";
        let response: any;
        let view: SpriteViewState;

        if (result.kind === "variant") {
            const match = result.familyKey
                ? this.findVariantInFamily(result.familyKey, result.variantId)
                : this.findVariant(result.variantId);
            if (!match) return i.editReply({ content: "I could not find that sprite variant." });
            if (!this.variantMatchesSeason(match.variant, seasonFilter)) return i.editReply({ content: `That sprite was not recorded in ${this.describeSeasonFilter(seasonFilter)}.` });
            view = { kind: "detail", familyKey: match.family.key, variantId: match.variant.id, state: { seasonFilter } };
            response = await this.generateDetailResponse(match.family, match.variant, i.user.id, i.user as User, displayName, undefined, { seasonFilter }, telemetryOrigin);
        } else if (result.kind === "family") {
            const family = this.findFamily(result.familyKey);
            if (!family) return i.editReply({ content: "I could not find that sprite family." });
            const filteredFamily = this.filterFamilyBySeason(family, seasonFilter);
            if (!filteredFamily) return i.editReply({ content: `That sprite family was not recorded in ${this.describeSeasonFilter(seasonFilter)}.` });
            view = { kind: "family", familyKey: family.key, state: { seasonFilter } };
            response = await this.generateFamilyResponse(family.key, i.user.id, i.user as User, displayName, undefined, { seasonFilter }, telemetryOrigin);
        } else {
            const state = { ...result.state, seasonFilter };
            view = { kind: "overview", state };
            response = await this.generateOverviewResponse(state, i.user.id, i.user as User, displayName, undefined, telemetryOrigin);
        }

        const message = await i.editReply(response as any) as Message;
        this.recordSpriteTelemetry({
            type: "message-binding",
            initiatedByUsername: telemetryOrigin.initiatedByUsername,
            interactedByUsername: telemetryOrigin.interactedByUsername,
            messageId: message.id,
            requestId: telemetryOrigin.requestId
        });
        this.rememberSpriteMessage(message, i.user.id, author, view, null, responseDataFingerprint);
        this.maybeQueueRuntimeRefresh({ ...telemetryOrigin, messageId: message.id }, "command");
        return message;
    }

    private getFilteredFamilies(state: SpriteBrowserState): SpriteFamily[] {
        if (!this._data) return [];
        const seasonFilter = state.seasonFilter || "current";
        const variantFilter = state.variantFilter || "all";
        const rarityFilter = state.rarityFilter || "all";

        return this.getDisplayFamilies(this._data.families)
            .map(family => ({
                ...family,
                variants: family.variants.filter(variant => {
                    const seasonMatches = this.variantMatchesSeason(variant, seasonFilter);
                    const variantMatches = variantFilter === "all" || variant.variant === variantFilter;
                    const rarityMatches = rarityFilter === "all" || variant.rarity === rarityFilter;
                    const searchMatches = !state.searchQuery || this.spriteMatchesQuery(family, variant, state.searchQuery);
                    return seasonMatches && variantMatches && rarityMatches && searchMatches;
                })
            }))
            .filter(family => family.variants.length > 0);
    }

    private getSeasonScopedFamilies(seasonFilter: string): SpriteFamily[] {
        if (!this._data) return [];
        return this.getDisplayFamilies(this._data.families)
            .map(family => this.filterFamilyBySeason(family, seasonFilter))
            .filter((family): family is SpriteFamily => Boolean(family));
    }

    private buildFooterText(editedAt?: string) {
        const fetchedAt = this._data?.fetchedAt ? new Date(this._data.fetchedAt).toLocaleString("en-US", { timeZone: "America/New_York" }) : "unknown";
        const seasonText = this._data?.seasonContext?.displayName ? `${this._data.seasonContext.displayName} | ` : "";
        const syncText = this.lastSyncError ? ` | Last sync error: ${this.lastSyncError}` : "";
        const editedText = editedAt ? ` | Edited ${new Date(editedAt).toLocaleString("en-US", { timeZone: "America/New_York" })}` : "";
        return `${appVersion} | ${seasonText}Data fetched ${fetchedAt}${editedText}${syncText}`;
    }

    private async generateOverviewResponse(
        state: SpriteBrowserState,
        ownerId: string,
        user: User | SpriteAuthor,
        displayName: string,
        editedAt?: string,
        telemetryOrigin: SpriteTelemetryOrigin = this.getTelemetryOrigin(user)
    ) {
        const families = this.getFilteredFamilies(state);
        const image = await this.renderOverviewImage(families, state, telemetryOrigin);
        const attachment = new MessageAttachment(image, "sprites-overview.png");
        const summary = this.describeOverviewState(state);

        const embed = new MessageEmbed()
            .setColor("#2186DB")
            .setAuthor({ name: displayName, iconURL: this.getAuthorIconURL(user) })
            .setFooter({ text: this.buildFooterText(editedAt) })
            .setTimestamp();

        if (summary) embed.setDescription(summary);

        return {
            embeds: [embed],
            files: [attachment],
            components: this.generateOverviewComponents(state, ownerId)
        };
    }

    private async generateFamilyResponse(
        familyKey: string,
        ownerId: string,
        user: User | SpriteAuthor,
        displayName: string,
        editedAt?: string,
        state: SpriteBrowserState = {},
        telemetryOrigin: SpriteTelemetryOrigin = this.getTelemetryOrigin(user)
    ) {
        const sourceFamily = this.findFamily(familyKey);
        const family = sourceFamily ? this.filterFamilyBySeason(sourceFamily, state.seasonFilter || "current") : undefined;
        if (!family) return { content: "Sprite family not found.", components: [] };
        const displayFamily = this.getDisplayFamilies([family])[0];
        if (!displayFamily) return { content: "That sprite family does not have released artwork yet.", components: this.generateOverviewComponents({}, ownerId) };

        const image = await this.renderFamilyImage(displayFamily, telemetryOrigin);
        const attachment = new MessageAttachment(image, `sprites-family-${displayFamily.key}.png`);

        const embed = new MessageEmbed()
            .setColor(this.getFamilyColor(displayFamily) as any)
            .setAuthor({ name: displayName, iconURL: this.getAuthorIconURL(user) })
            .setFooter({ text: this.buildFooterText(editedAt) })
            .setTimestamp();

        return {
            embeds: [embed],
            files: [attachment],
            components: this.generateFamilyComponents(displayFamily, ownerId, state)
        };
    }

    private async generateDetailResponse(
        family: SpriteFamily,
        variant: SpriteVariant,
        ownerId: string,
        user: User | SpriteAuthor,
        displayName: string,
        editedAt?: string,
        state: SpriteBrowserState = {},
        telemetryOrigin: SpriteTelemetryOrigin = this.getTelemetryOrigin(user)
    ) {
        if (!await this.hasRenderableSpriteArtwork(variant, telemetryOrigin)) {
            return { content: "That sprite variant does not have released artwork yet.", components: this.generateOverviewComponents({}, ownerId) };
        }

        const image = await this.renderVariantImage(family, variant, telemetryOrigin);
        const attachment = new MessageAttachment(image, `sprites-variant-${variant.id}.png`);

        const embed = new MessageEmbed()
            .setColor(RARITY_HEX_COLORS[variant.rarity] as any)
            .setAuthor({ name: displayName, iconURL: this.getAuthorIconURL(user) })
            .setFooter({ text: this.buildFooterText(editedAt) })
            .setTimestamp();

        return {
            embeds: [embed],
            files: [attachment],
            components: this.generateDetailComponents(this.filterFamilyBySeason(family, state.seasonFilter || "current") || family, variant, ownerId, state)
        };
    }
    private generateOverviewComponents(state: SpriteBrowserState, ownerId: string) {
        const ownerSuffix = `|${ownerId}`;
        const seasonFilter = state.seasonFilter || "current";
        const families = this.getSeasonScopedFamilies(seasonFilter);
        const selectedFamily = state.familyKey && families.some(f => f.key === state.familyKey) ? state.familyKey : undefined;
        const familyPage = state.familyPage || 0;
        const familiesPerPage = 25;
        const totalFamilyPages = Math.max(1, Math.ceil(families.length / familiesPerPage));
        const clampedFamilyPage = Math.max(0, Math.min(familyPage, totalFamilyPages - 1));
        const visibleFamilies = families.slice(clampedFamilyPage * familiesPerPage, (clampedFamilyPage + 1) * familiesPerPage);

        const familyRow = new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`fn_sprites_family_select${ownerSuffix}`)
                .setPlaceholder(totalFamilyPages > 1 ? `🧬 Choose a sprite family (${clampedFamilyPage + 1}/${totalFamilyPages})` : "🧬 Choose a sprite family")
                .addOptions(visibleFamilies.map(family => ({
                    label: `${this.familyEmoji(family.key)} ${family.displayName}`,
                    description: this.truncate(family.effectSummary, 90),
                    value: family.key,
                    default: family.key === selectedFamily
                })))
        );

        const variantFilter = state.variantFilter || "all";
        const rarityFilter = state.rarityFilter || "all";
        const activeQuickFilter = seasonFilter === "all" && variantFilter === "all" && rarityFilter === "all"
            ? "all"
            : rarityFilter !== "all"
                ? `rarity:${rarityFilter}`
                : variantFilter !== "all"
                    ? `variant:${variantFilter}`
                    : `season:${seasonFilter}`;
        const quickFilterRow = new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`fn_sprites_quick_filter${ownerSuffix}`)
                .setPlaceholder("🔎 Choose a view")
                .addOptions([
                    seasonFilter === "all"
                        ? { label: "🧚 All sprites", description: "Reset filters and show the full recorded catalog", value: "all", default: activeQuickFilter === "all" }
                        : { label: `🧚 All ${this.describeSeasonFilter(seasonFilter)} sprites`, description: "Clear variant and rarity filters within this season", value: "filters:clear", default: variantFilter === "all" && rarityFilter === "all" },
                    ...this.getVariantNames(families).slice(0, 8).map(variant => ({
                        label: `${this.variantEmoji(variant)} ${this.variantLabel(variant)} variants`,
                        description: `Show every ${this.variantLabel(variant)} variant`,
                        value: `variant:${variant}`,
                        default: activeQuickFilter === `variant:${variant}`
                    })),
                    ...RARITY_ORDER.map(rarity => ({
                        label: `${this.rarityEmoji(rarity)} ${this.titleCase(rarity)} sprites`,
                        description: `Show ${this.titleCase(rarity)} rarity sprites`,
                        value: `rarity:${rarity}`,
                        default: activeQuickFilter === `rarity:${rarity}`
                    }))
                ])
        );

        const seasonRow = new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`fn_sprites_season_filter${ownerSuffix}`)
                .setPlaceholder(this.describeSeasonFilter(seasonFilter))
                .addOptions([
                    { label: "🗃️ All recorded seasons", description: "Show the complete recorded sprite catalog", value: "all", default: seasonFilter === "all" },
                    ...this.getAvailableSeasonIds().map(id => ({
                        label: this.formatSeasonId(id),
                        description: `Show sprites available in ${this.formatSeasonId(id)}`,
                        value: id,
                        default: seasonFilter === id
                    }))
                ].slice(0, 25))
        );

        const quickRow = new MessageActionRow().addComponents(
            new MessageButton().setCustomId(`fn_sprites_quick_rarest${ownerSuffix}`).setLabel("🌟 Rarest").setStyle("SECONDARY"),
            new MessageButton().setCustomId(`fn_sprites_quick_cost${ownerSuffix}`).setLabel("💎 Highest Cost").setStyle("SECONDARY"),
            new MessageButton().setCustomId(`fn_sprites_quick_random${ownerSuffix}`).setLabel("🎲 Random").setStyle("SUCCESS")
        );

        const rows = [familyRow, seasonRow, quickFilterRow];
        if (totalFamilyPages > 1) {
            rows.push(new MessageActionRow().addComponents(
                new MessageButton().setCustomId(`fn_sprites_family_page_${clampedFamilyPage - 1}${ownerSuffix}`).setLabel("⬅️ Families").setStyle("SECONDARY").setDisabled(clampedFamilyPage === 0),
                new MessageButton().setCustomId(`fn_sprites_family_page_${clampedFamilyPage + 1}${ownerSuffix}`).setLabel("Families  ➡️").setStyle("SECONDARY").setDisabled(clampedFamilyPage >= totalFamilyPages - 1)
            ));
        }
        rows.push(quickRow);
        return rows;
    }

    private generateFamilyComponents(family: SpriteFamily, ownerId: string, state: SpriteBrowserState = {}) {
        const ownerSuffix = `|${ownerId}`;
        const scopedFamilies = this.getSeasonScopedFamilies(state.seasonFilter || "current");
        const currentIndex = scopedFamilies.findIndex(candidate => candidate.key === family.key);
        const prev = currentIndex > 0 ? scopedFamilies[currentIndex - 1] : null;
        const next = currentIndex >= 0 && currentIndex < scopedFamilies.length - 1 ? scopedFamilies[currentIndex + 1] : null;
        const variantRows = this.generateVariantComponents(family, ownerId);
        const navRow = new MessageActionRow().addComponents(
            new MessageButton().setCustomId(`fn_sprites_family_${prev?.key || family.key}${ownerSuffix}`).setLabel("⬅️ Family").setStyle("SECONDARY").setDisabled(!prev),
            new MessageButton().setCustomId(`fn_sprites_overview${ownerSuffix}`).setLabel("⬅️ Overview").setStyle("PRIMARY"),
            new MessageButton().setCustomId(`fn_sprites_family_${next?.key || family.key}${ownerSuffix}`).setLabel("Family  ➡️").setStyle("SECONDARY").setDisabled(!next)
        );

        return [...variantRows, navRow];
    }

    private generateDetailComponents(family: SpriteFamily, selectedVariant: SpriteVariant, ownerId: string, state: SpriteBrowserState = {}) {
        const ownerSuffix = `|${ownerId}`;
        const variantRows = this.generateVariantComponents(family, ownerId, selectedVariant.id);
        const navRow = new MessageActionRow().addComponents(
            new MessageButton().setCustomId(`fn_sprites_family_${family.key}${ownerSuffix}`).setLabel("⬅️ Family").setStyle("PRIMARY"),
            new MessageButton().setCustomId(`fn_sprites_overview${ownerSuffix}`).setLabel("⏪ Overview").setStyle("SECONDARY")
        );

        return [...variantRows, navRow];
    }

    private generateVariantComponents(family: SpriteFamily, ownerId: string, selectedVariantId?: number) {
        const ownerSuffix = `|${ownerId}`;

        if (family.variants.length > 5) {
            return [
                new MessageActionRow().addComponents(
                    new MessageSelectMenu()
                        .setCustomId(`fn_sprites_variant_select_${family.key}${ownerSuffix}`)
                        .setPlaceholder("🧪 Choose a variant")
                        .addOptions(family.variants.slice(0, 25).map(variant => ({
                            label: `${this.variantEmoji(variant.variant)} ${this.variantLabel(variant.variant)}`,
                            description: this.truncate(`${this.rarityEmoji(variant.rarity)} ${this.titleCase(variant.rarity)} | ${this.formatChance(variant)} | ${variant.summonCost.toLocaleString("en-US")} cost`, 90),
                            value: variant.id.toString(),
                            default: variant.id === selectedVariantId
                        })))
                )
            ];
        }

        const variantRow = new MessageActionRow();
        for (const variant of family.variants) {
            variantRow.addComponents(
                new MessageButton()
                    .setCustomId(`fn_sprites_variant_${variant.id}${ownerSuffix}`)
                    .setLabel(`${this.variantEmoji(variant.variant)} ${this.variantLabel(variant.variant)}`)
                    .setStyle(variant.id === selectedVariantId || variant.variant === "Base" ? "PRIMARY" : "SECONDARY")
                    .setDisabled(variant.id === selectedVariantId)
            );
        }

        return [variantRow];
    }




    private async getBrowser(): Promise<Browser> {
        if (this.isBrowserConnected(this.browser)) return this.browser as Browser;
        if (this.browserPromise) return this.browserPromise;

        const launchPromise = (async () => {
            // Using Function bypasses TypeScript's CommonJS transform,
            // allowing us to properly load Puppeteer's ESM module in Node.
            const { default: puppeteerModule } = await Function('return import("puppeteer")')();
            const configuredExecutable = process.env.GOOGLE_CHROME_BIN || process.env.PUPPETEER_EXECUTABLE_PATH;
            const executablePath = configuredExecutable
                || (process.platform === "linux" && fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined)
                || (process.platform === "linux" && fs.existsSync("/usr/bin/chromium-browser") ? "/usr/bin/chromium-browser" : undefined)
                || undefined;
            const browser = await puppeteerModule.launch({
                headless: true,
                executablePath: this.getChromiumExecutablePath(),
                protocolTimeout: RENDER_PROTOCOL_TIMEOUT_MS,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            });
            browser.on("disconnected", () => {
                if (this.browser === browser) {
                    this.browser = null;
                }
                if (this.browserPromise === launchPromise) {
                    this.browserPromise = null;
                }
                this.resetRenderPagePool(new Error("Sprite render browser disconnected."));
            });
            this.browser = browser;
            return browser;
        })();

        this.browserPromise = launchPromise;

        try {
            return await launchPromise;
        } catch (error) {
            if (this.browserPromise === launchPromise) {
                this.browserPromise = null;
            }
            throw error;
        }
    }

    private getChromiumExecutablePath(): string | undefined {
        const configuredPath = process.env.GOOGLE_CHROME_BIN || process.env.PUPPETEER_EXECUTABLE_PATH;
        if (configuredPath) return configuredPath;
        if (process.platform !== "linux") return undefined;

        return [
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium"
        ].find(candidate => fs.existsSync(candidate));
    }

    private clearRenderCaches() {
        this.imageCache.clear();
        this.imageCacheBytes = 0;
        this.pendingImageRenders.clear();
        this.spriteAssetCache.clear();
        this.spriteAssetCacheBytes = 0;
        this.pendingSpriteAssetLoads.clear();
    }

    private computeRenderUiFingerprint() {
        // Keep this signature stable across ordinary builds. It changes when the
        // actual rendered UI implementation, render assets, or explicit cache
        // schema changes—not merely when the bot version or deployment changes.
        const renderImplementation = [
            this.buildRenderGenerationTasks,
            this.getFilteredFamilies,
            this.getDisplayFamilies,
            this.hasReleasedArtwork,
            this.filterFamilyBySeason,
            this.variantMatchesSeason,
            this.getAvailableSeasonIds,
            this.getVariantNames,
            this.getFamilySeasonDetails,
            this.getVariantSeasonDetails,
            this.getCanonicalOverviewCacheKey,
            this.getPrimarySpawnRate,
            this.getLowestSpawnRate,
            this.getSpawnRateEntries,
            this.createSpawnRateEntry,
            this.renderOverviewImage,
            this.renderVariantImage,
            this.renderFamilyImage,
            this.renderHtmlToBuffer,
            this.buildRenderDocument,
            this.getRenderTokensCss,
            this.renderMetaChip,
            this.renderRarityPill,
            this.renderSpriteThumb,
            this.renderDustAmount,
            this.renderSpawnRateIcon,
            this.renderSpawnRateStack,
            this.renderPageBackTrail,
            this.getFamilyColor,
            this.normalizeWhitespace,
            this.expandSearchQuery,
            this.normalizeSeasonFilter,
            this.renderSeasonFilterHeading,
            this.renderSeasonLabel,
            this.renderSeasonCard,
            this.renderFamilyHistory,
            this.renderVariantTypeDebutBadge,
            this.getSeasonEmojiAssetUrl,
            this.sortSeasonIds,
            this.parseSeasonId,
            this.formatSeasonId,
            this.formatCompactSeasonId,
            this.escapeHtml,
            this.alphaColor,
            this.formatChance,
            this.variantLabel,
            this.titleCase,
            this.truncate,
            this.resolveSpriteImageSrc,
            this.prewarmSpriteImages
        ].map(method => method.toString()).join("\n");

        return crypto.createHash("sha1")
            .update(RENDER_CACHE_SCHEMA)
            .update(renderImplementation)
            .update(this.renderTokensCss)
            .update(this.dustIconDataUrl || "")
            .update(JSON.stringify(this.spawnRateIconDataUrls))
            .update(JSON.stringify(RARITY_ORDER))
            .update(JSON.stringify(RARITY_CSS_COLORS))
            .update(JSON.stringify(RARITY_HEX_COLORS))
            .update(getFortniteSeasonEmoji.toString())
            .digest("hex");
    }

    private getCatalogDataFingerprint() {
        return crypto.createHash("sha1")
            .update(JSON.stringify(this._data ? { ...this._data, fetchedAt: "" } : null))
            .digest("hex");
    }

    private getRenderDataFingerprint() {
        return crypto.createHash("sha1")
            .update(this.getCatalogDataFingerprint())
            .update(this.spriteAssetContentFingerprint)
            .digest("hex");
    }

    private touchCacheEntry<T>(cache: Map<string, T>, key: string, value: T) {
        cache.delete(key);
        cache.set(key, value);
    }

    private cacheBytesForText(value: string) {
        return Buffer.byteLength(value);
    }

    private isBrowserConnected(browser: Browser | null | undefined) {
        return !!browser && browser.connected !== false;
    }

    private setRenderedImageCacheEntry(key: string, buffer: Buffer) {
        const existing = this.imageCache.get(key);
        if (existing) {
            this.imageCacheBytes -= existing.bytes;
        }

        const entry: RenderedImageCacheEntry = {
            buffer,
            bytes: buffer.byteLength
        };
        this.touchCacheEntry(this.imageCache, key, entry);
        this.imageCacheBytes += entry.bytes;

        while (this.imageCacheBytes > MAX_RENDERED_IMAGE_CACHE_BYTES && this.imageCache.size > 1) {
            const oldestKey = this.imageCache.keys().next().value;
            if (oldestKey == null) break;
            const oldest = this.imageCache.get(oldestKey);
            if (!oldest) {
                this.imageCache.delete(oldestKey);
                continue;
            }
            this.imageCache.delete(oldestKey);
            this.imageCacheBytes -= oldest.bytes;
        }
    }

    private setSpriteAssetCacheEntry(key: string, src: string, dataFingerprint = this.getCatalogDataFingerprint()) {
        const existing = this.spriteAssetCache.get(key);
        if (existing) {
            this.spriteAssetCacheBytes -= existing.bytes;
        }

        const entry: SpriteAssetCacheEntry = {
            src,
            bytes: this.cacheBytesForText(src),
            dataFingerprint
        };
        this.touchCacheEntry(this.spriteAssetCache, key, entry);
        this.spriteAssetCacheBytes += entry.bytes;

        while (this.spriteAssetCacheBytes > MAX_SPRITE_ASSET_CACHE_BYTES && this.spriteAssetCache.size > 1) {
            const oldestKey = this.spriteAssetCache.keys().next().value;
            if (oldestKey == null) break;
            const oldest = this.spriteAssetCache.get(oldestKey);
            if (!oldest) {
                this.spriteAssetCache.delete(oldestKey);
                continue;
            }
            this.spriteAssetCache.delete(oldestKey);
            this.spriteAssetCacheBytes -= oldest.bytes;
        }
    }

    private getSpriteAssetDiskCachePath(imageUrl: string, dataFingerprint = this.getCatalogDataFingerprint()) {
        const cacheKey = crypto.createHash("sha1")
            .update(`${SPRITE_ASSET_CACHE_VERSION}:${dataFingerprint}:${imageUrl}`)
            .digest("hex");
        return path.join(SPRITE_ASSET_CACHE_DIR, dataFingerprint, `${cacheKey}.bin`);
    }

    private getSpriteAssetManifestPath(dataFingerprint = this.getCatalogDataFingerprint()) {
        return path.join(SPRITE_ASSET_CACHE_DIR, dataFingerprint, "manifest.json");
    }

    private async readSpriteAssetManifest(dataFingerprint: string): Promise<SpriteAssetDiskManifest> {
        const emptyManifest: SpriteAssetDiskManifest = {
            schemaVersion: SPRITE_ASSET_MANIFEST_VERSION,
            dataFingerprint,
            assets: {}
        };
        if (!PRODUCTION_RENDER_CACHE_ENABLED) return emptyManifest;

        try {
            const parsed = JSON.parse(await fs.promises.readFile(this.getSpriteAssetManifestPath(dataFingerprint), "utf8")) as SpriteAssetDiskManifest;
            if (
                parsed?.schemaVersion !== SPRITE_ASSET_MANIFEST_VERSION
                || parsed.dataFingerprint !== dataFingerprint
                || !parsed.assets
                || typeof parsed.assets !== "object"
            ) {
                return emptyManifest;
            }
            return parsed;
        } catch {
            return emptyManifest;
        }
    }

    private async persistSpriteAssetManifest(manifest: SpriteAssetDiskManifest) {
        if (!PRODUCTION_RENDER_CACHE_ENABLED) return;

        const targetPath = this.getSpriteAssetManifestPath(manifest.dataFingerprint);
        const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
        await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
        await fs.promises.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
        await fs.promises.rename(tempPath, targetPath);
    }

    private getResponseHeader(response: any, name: string): string | undefined {
        const value = response?.headers?.[name.toLowerCase()] ?? response?.headers?.[name];
        if (Array.isArray(value)) return value[0] ? String(value[0]) : undefined;
        return value == null || value === "" ? undefined : String(value);
    }

    private normalizeSpriteContentType(contentType: string | undefined) {
        const normalized = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
        return normalized.startsWith("image/") ? normalized : null;
    }

    private inferSpriteContentType(buffer: Buffer) {
        if (
            buffer.length >= 8
            && buffer[0] === 0x89
            && buffer[1] === 0x50
            && buffer[2] === 0x4e
            && buffer[3] === 0x47
        ) return "image/png";
        if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
        if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
        return null;
    }

    private spriteAssetDataUrl(contentType: string, buffer: Buffer) {
        return `data:${contentType};base64,${buffer.toString("base64")}`;
    }

    private hashSpriteAsset(buffer: Buffer) {
        return crypto.createHash("sha256").update(buffer).digest("hex");
    }

    private getSpriteAssetContentFingerprint(assets: Record<string, SpriteAssetDiskEntry>) {
        return crypto.createHash("sha1")
            .update(JSON.stringify(Object.keys(assets).sort().map(imageUrl => [imageUrl, assets[imageUrl]?.contentSha256 || ""])))
            .digest("hex");
    }

    private inferLocalSpriteAssetType(localPath: string) {
        const extension = path.extname(localPath).toLowerCase();
        if (extension === ".png") return "image/png";
        if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
        return "image/webp";
    }

    private async fetchSpriteAssetCandidate(
        imageUrl: string,
        dataFingerprint: string,
        candidateUrl: string,
        previous: SpriteAssetDiskEntry | undefined
    ): Promise<SpriteAssetRefreshResult | null> {
        const cached = await this.readSpriteAssetBytesFromDisk(imageUrl, dataFingerprint, previous?.contentType);
        const canValidateWithCache = !!cached
            && !!previous
            && previous.resolvedUrl === candidateUrl
            && !!(previous.etag || previous.lastModified)
            && (!previous.contentSha256 || this.hashSpriteAsset(cached.buffer) === previous.contentSha256);

        const request = (useValidators: boolean) => {
            const headers: Record<string, string> = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
                Accept: "image/avif,image/webp,image/png,image/apng,image/*,*/*;q=0.8",
                "Cache-Control": "no-cache",
                Pragma: "no-cache"
            };
            if (useValidators && previous?.etag) headers["If-None-Match"] = previous.etag;
            if (useValidators && previous?.lastModified) headers["If-Modified-Since"] = previous.lastModified;

            return axios.get<ArrayBuffer>(candidateUrl, {
                responseType: "arraybuffer",
                timeout: 15_000,
                maxContentLength: 30 * 1024 * 1024,
                httpsAgent: IMAGE_HTTPS_AGENT,
                headers,
                validateStatus: status => status === 200 || status === 304 || status === 404
            });
        };

        let response = await request(canValidateWithCache);
        if (response.status === 404) return null;

        if (response.status === 304) {
            if (cached && previous?.contentSha256 && this.hashSpriteAsset(cached.buffer) === previous.contentSha256) {
                return {
                    src: this.spriteAssetDataUrl(cached.contentType, cached.buffer),
                    buffer: cached.buffer,
                    metadata: {
                        ...previous,
                        resolvedUrl: candidateUrl,
                        checkedAt: new Date().toISOString()
                    }
                };
            }

            // A validator survived but the corresponding asset file did not.
            // Retry without validators so a 304 cannot leave us without usable artwork.
            response = await request(false);
            if (response.status !== 200) return null;
        }

        if (response.status !== 200) return null;
        const contentType = (this.getResponseHeader(response, "content-type") || "").split(";", 1)[0].toLowerCase();
        if (!contentType.startsWith("image/")) return null;

        const imageBuffer = Buffer.from(response.data as any);
        if (!await this.isUsableSpriteArtwork(imageBuffer)) return null;

        const contentSha256 = this.hashSpriteAsset(imageBuffer);
        const src = `data:${contentType};base64,${imageBuffer.toString("base64")}`;

        const etag = this.getResponseHeader(response, "etag");
        const lastModified = this.getResponseHeader(response, "last-modified");
        return {
            src,
            buffer: imageBuffer,
            metadata: {
                resolvedUrl: candidateUrl,
                contentSha256,
                contentType,
                ...(etag ? { etag } : {}),
                ...(lastModified ? { lastModified } : {}),
                checkedAt: new Date().toISOString()
            }
        };
    }

    private async refreshSpriteAsset(
        imageUrl: string,
        dataFingerprint: string,
        previous: SpriteAssetDiskEntry | undefined
    ): Promise<SpriteAssetRefreshResult | null> {
        let localPath = imageUrl;
        if (imageUrl.startsWith("file://")) {
            try {
                localPath = fileURLToPath(imageUrl);
            } catch {
                localPath = imageUrl;
            }
        }

        if (path.isAbsolute(localPath)) {
            try {
                const imageBuffer = await fs.promises.readFile(localPath);
                if (!await this.isUsableSpriteArtwork(imageBuffer)) return null;
                const contentType = this.inferLocalSpriteAssetType(localPath);
                const contentSha256 = this.hashSpriteAsset(imageBuffer);
                return {
                    src: `data:${contentType};base64,${imageBuffer.toString("base64")}`,
                    buffer: imageBuffer,
                    metadata: {
                        resolvedUrl: imageUrl,
                        contentSha256,
                        contentType,
                        checkedAt: new Date().toISOString()
                    }
                };
            } catch {
                return null;
            }
        }

        const candidates = this.getSpriteImageUrlCandidates(imageUrl);
        if (previous?.resolvedUrl) {
            candidates.unshift(previous.resolvedUrl);
        }

        for (const candidateUrl of Array.from(new Set(candidates))) {
            try {
                const refreshed = await this.fetchSpriteAssetCandidate(imageUrl, dataFingerprint, candidateUrl, previous);
                if (refreshed) return refreshed;
            } catch {
                // Try the next known image extension before retaining the prior asset.
            }
        }

        return null;
    }

    private syncProductionSpriteAssets(
        dataFingerprint = this.getCatalogDataFingerprint(),
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN
    ): Promise<SpriteAssetSyncResult> {
        const emptyResult = {
            changed: false,
            checked: 0,
            failed: 0,
            dataFingerprint
        };
        if (!PRODUCTION_RENDER_CACHE_ENABLED || !this._data) return Promise.resolve(emptyResult);

        if (
            this.lastSpriteAssetSyncDataFingerprint === dataFingerprint
            && Date.now() - this.lastSpriteAssetSyncAt < SPRITE_ASSET_SYNC_COOLDOWN_MS
        ) {
            return Promise.resolve(emptyResult);
        }
        if (this.spriteAssetSyncPromise) return this.spriteAssetSyncPromise;

        const syncPromise = this.runProductionSpriteAssetSync(dataFingerprint, telemetryOrigin).catch(error => {
            console.warn("[FortniteSprites] Sprite artwork sync failed:", error?.message || error);
            return {
                ...emptyResult,
                failed: 1
            };
        });
        this.spriteAssetSyncPromise = syncPromise;
        void syncPromise.finally(() => {
            if (this.spriteAssetSyncPromise === syncPromise) this.spriteAssetSyncPromise = null;
        });
        return syncPromise;
    }

    private async runProductionSpriteAssetSync(
        dataFingerprint: string,
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN
    ): Promise<SpriteAssetSyncResult> {
        const syncStartedAt = Date.now();
        const previousManifest = await this.readSpriteAssetManifest(dataFingerprint);
        const previousAssetContentFingerprint = this.getSpriteAssetContentFingerprint(previousManifest.assets);
        this.spriteAssetContentFingerprint = previousAssetContentFingerprint;
        const previousRenderDataFingerprint = this.getRenderDataFingerprint();
        const imageUrls = Array.from(new Set(
            // Prewarm only artwork that can appear in the rendered UI. Archived
            // variants with temporary placeholder URLs remain in the catalog for
            // history/search, but must not create repeated startup misses.
            this.getDisplayFamilies(this._data.families)
                .flatMap(family => family.variants)
                .map(variant => variant.imageUrl)
                .filter((imageUrl): imageUrl is string => !!imageUrl)
        ));
        const nextAssets: Record<string, SpriteAssetDiskEntry> = {};
        let checked = 0;
        let failed = 0;

        await this.forEachConcurrent(imageUrls, SPRITE_IMAGE_PREWARM_CONCURRENCY, async imageUrl => {
            const previous = previousManifest.assets[imageUrl];
            try {
                const refreshed = await this.refreshSpriteAsset(imageUrl, dataFingerprint, previous);
                if (!refreshed) {
                    failed++;
                    if (previous) nextAssets[imageUrl] = previous;
                    return;
                }

                checked++;
                nextAssets[imageUrl] = refreshed.metadata;
                await this.persistSpriteAssetToDisk(
                    imageUrl,
                    refreshed.buffer,
                    refreshed.metadata.contentType,
                    dataFingerprint
                );
                this.setSpriteAssetCacheEntry(imageUrl, refreshed.src, dataFingerprint);
            } catch (error) {
                failed++;
                if (previous) nextAssets[imageUrl] = previous;
                console.warn(`[FortniteSprites] Failed to sync sprite artwork ${imageUrl}:`, error?.message || error);
            }
        });

        const nextAssetContentFingerprint = this.getSpriteAssetContentFingerprint(nextAssets);
        const assetContentChanged = previousAssetContentFingerprint !== nextAssetContentFingerprint;
        this.spriteAssetContentFingerprint = nextAssetContentFingerprint;

        try {
            await this.persistSpriteAssetManifest({
                schemaVersion: SPRITE_ASSET_MANIFEST_VERSION,
                dataFingerprint,
                assets: nextAssets
            });
        } catch (error) {
            failed++;
            console.warn("[FortniteSprites] Failed to persist sprite artwork manifest:", error?.message || error);
        }

        this.lastSpriteAssetSyncAt = Date.now();
        this.lastSpriteAssetSyncDataFingerprint = dataFingerprint;

        if (assetContentChanged) {
            // The rendered PNG cache has no safe way to know which screen used a
            // changed asset, so invalidate the current data namespace as a unit.
            this.imageCache.clear();
            this.imageCacheBytes = 0;
            await this.invalidateRenderedImageDiskCache(previousRenderDataFingerprint);
        }

        console.log(`[FortniteSprites] Sprite artwork sync checked ${checked}/${imageUrls.length} assets; ${assetContentChanged ? "changes detected" : "no changes detected"}${failed ? `; ${failed} failed` : ""}.`);
        const result = { changed: assetContentChanged, checked, failed, dataFingerprint };
        this.recordAssetSyncTelemetry(result, syncStartedAt, telemetryOrigin);
        return result;
    }

    private async readSpriteAssetBytesFromDisk(
        imageUrl: string,
        dataFingerprint: string,
        contentType?: string
    ): Promise<SpriteAssetDiskContent | null> {
        if (!PRODUCTION_RENDER_CACHE_ENABLED) return null;

        try {
            const buffer = await fs.promises.readFile(this.getSpriteAssetDiskCachePath(imageUrl, dataFingerprint));
            if (buffer.length === 0) return null;
            const normalizedContentType = this.normalizeSpriteContentType(contentType) || this.inferSpriteContentType(buffer);
            return normalizedContentType ? { buffer, contentType: normalizedContentType } : null;
        } catch {
            return null;
        }
    }

    private async readSpriteAssetFromDisk(imageUrl: string, dataFingerprint?: string) {
        if (!PRODUCTION_RENDER_CACHE_ENABLED) return null;
        const resolvedDataFingerprint = dataFingerprint || this.getCatalogDataFingerprint();
        const manifest = await this.readSpriteAssetManifest(resolvedDataFingerprint);
        const metadata = manifest.assets[imageUrl];

        const cached = await this.readSpriteAssetBytesFromDisk(
            imageUrl,
            resolvedDataFingerprint,
            metadata?.contentType
        );
        if (!cached) return null;
        if (metadata?.contentSha256 && this.hashSpriteAsset(cached.buffer) !== metadata.contentSha256) return null;
        return this.spriteAssetDataUrl(cached.contentType, cached.buffer);
    }

    private async persistSpriteAssetToDisk(
        imageUrl: string,
        buffer: Buffer,
        contentType: string,
        dataFingerprint?: string
    ) {
        if (!PRODUCTION_RENDER_CACHE_ENABLED) return;
        const normalizedContentType = this.normalizeSpriteContentType(contentType);
        if (!normalizedContentType) return;

        const targetPath = this.getSpriteAssetDiskCachePath(imageUrl, dataFingerprint);
        const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
        try {
            await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.promises.writeFile(tempPath, buffer);
            await fs.promises.rename(tempPath, targetPath);
        } catch (error) {
            console.warn(`[FortniteSprites] Failed to persist sprite asset cache for ${imageUrl}:`, error);
            await fs.promises.rm(tempPath, { force: true }).catch(() => { });
        }
    }

    private async resetRenderPagePool(error: Error) {
        const pooledPages = this.renderPagePool.splice(0);
        this.liveRenderPages.clear();

        const waiters = this.pendingRenderPageAcquires.splice(0);
        for (const waiter of waiters) {
            waiter.reject(error);
        }

        await Promise.all(pooledPages.map(async (page) => {
            if (page.isClosed()) return;
            await page.close().catch(() => { });
        }));
    }

    private isRenderPageReusable(page: Page) {
        try {
            return !page.isClosed() && this.isBrowserConnected(page.browser());
        } catch {
            return false;
        }
    }

    private removeRenderPageFromPool(page: Page) {
        const index = this.renderPagePool.indexOf(page);
        if (index >= 0) {
            this.renderPagePool.splice(index, 1);
        }
    }

    private async disposeRenderPage(page: Page) {
        this.removeRenderPageFromPool(page);
        this.liveRenderPages.delete(page);
        if (!page.isClosed()) {
            await page.close().catch(() => { });
        }
    }

    private onRenderPageClosed(page: Page) {
        this.removeRenderPageFromPool(page);
        const wasTracked = this.liveRenderPages.delete(page);
        if (wasTracked && this.pendingRenderPageAcquires.length > 0) {
            const waiter = this.pendingRenderPageAcquires.shift();
            waiter?.reject(new Error("Sprite render page closed."));
        }
    }

    private waitForRenderPage(): Promise<Page> {
        return new Promise<Page>((resolve, reject) => {
            this.pendingRenderPageAcquires.push({ resolve, reject });
        });
    }

    private async acquireRenderPage(): Promise<Page> {
        while (true) {
            while (this.renderPagePool.length > 0) {
                const pooledPage = this.renderPagePool.pop()!;
                if (this.isRenderPageReusable(pooledPage)) {
                    return pooledPage;
                }
                await this.disposeRenderPage(pooledPage);
            }

            const browser = await this.getBrowser();

            if (this.liveRenderPages.size < RENDER_PAGE_POOL_SIZE) {
                try {
                    const page = await browser.newPage();
                    this.liveRenderPages.add(page);
                    page.on("close", () => this.onRenderPageClosed(page));
                    return page;
                } catch (error) {
                    if (!this.isBrowserConnected(browser)) {
                        this.browser = null;
                        if (this.browserPromise) {
                            this.browserPromise = null;
                        }
                        await this.resetRenderPagePool(new Error("Sprite render browser became unavailable."));
                        continue;
                    }
                    throw error;
                }
            }

            try {
                return await this.waitForRenderPage();
            } catch {
                continue;
            }
        }
    }

    private async releaseRenderPage(page: Page) {
        if (!this.liveRenderPages.has(page) || !this.isRenderPageReusable(page)) {
            await this.disposeRenderPage(page);
            if (this.pendingRenderPageAcquires.length > 0) {
                const waiter = this.pendingRenderPageAcquires.shift();
                waiter?.reject(new Error("Sprite render page was disposed."));
            }
            return;
        }

        const next = this.pendingRenderPageAcquires.shift();
        if (next) {
            next.resolve(page);
            return;
        }

        this.renderPagePool.push(page);
    }

    private async resolveSpriteImageSrc(
        imageUrl: string | undefined,
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN
    ): Promise<string | undefined> {
        if (!imageUrl) return undefined;

        const dataFingerprint = this.getCatalogDataFingerprint();
        const assetStartedAt = Date.now();

        const cached = this.spriteAssetCache.get(imageUrl);
        if (cached) {
            if (cached.dataFingerprint === dataFingerprint) {
                this.touchCacheEntry(this.spriteAssetCache, imageUrl, cached);
                this.recordAssetTelemetry("memory-hit", imageUrl, dataFingerprint, assetStartedAt, telemetryOrigin);
                return cached.src;
            }
            this.spriteAssetCache.delete(imageUrl);
            this.spriteAssetCacheBytes -= cached.bytes;
        }

        const pending = this.pendingSpriteAssetLoads.get(imageUrl);
        if (pending) {
            const resolved = await pending;
            return resolved || undefined;
        }

        const loadPromise = (async () => {
            try {
                const localPath = imageUrl.startsWith("file://") ? fileURLToPath(imageUrl) : imageUrl;
                if (path.isAbsolute(localPath)) {
                    const buffer = await fs.promises.readFile(localPath);
                    if (dataFingerprint !== this.getCatalogDataFingerprint()) return null;
                    const extension = path.extname(localPath).toLowerCase();
                    const mime = extension === ".png" ? "image/png" : extension === ".jpg" || extension === ".jpeg" ? "image/jpeg" : "image/webp";
                    const src = `data:${mime};base64,${buffer.toString("base64")}`;
                    this.setSpriteAssetCacheEntry(imageUrl, src, dataFingerprint);
                    this.recordAssetTelemetry("local", imageUrl, dataFingerprint, assetStartedAt, telemetryOrigin);
                    return src;
                }
                const diskCached = await this.readSpriteAssetFromDisk(imageUrl, dataFingerprint);
                if (diskCached) {
                    if (dataFingerprint !== this.getCatalogDataFingerprint()) return null;
                    this.setSpriteAssetCacheEntry(imageUrl, diskCached, dataFingerprint);
                    this.recordAssetTelemetry("disk-hit", imageUrl, dataFingerprint, assetStartedAt, telemetryOrigin);
                    return diskCached;
                }

                for (const candidateUrl of this.getSpriteImageUrlCandidates(imageUrl)) {
                    try {
                        const res = await axios.get<ArrayBuffer>(candidateUrl, {
                            responseType: "arraybuffer",
                            timeout: 15000,
                            httpsAgent: IMAGE_HTTPS_AGENT,
                            headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                                "Accept": "image/webp,image/png,image/apng,image/*,*/*;q=0.8"
                            }
                        });
                        const contentType = String(res.headers["content-type"] || "").toLowerCase();
                        if (!contentType.includes("image/")) {
                            continue;
                        }
                        const imageBuffer = Buffer.from(res.data);
                        if (!await this.isUsableSpriteArtwork(imageBuffer)) {
                            continue;
                        }
                        if (dataFingerprint !== this.getCatalogDataFingerprint()) return null;
                        const mimeType = contentType.includes("image/") ? contentType.split(";")[0] : "image/png";
                        const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
                        this.setSpriteAssetCacheEntry(imageUrl, dataUrl, dataFingerprint);
                        await this.persistSpriteAssetToDisk(imageUrl, imageBuffer, mimeType, dataFingerprint);
                        this.recordAssetTelemetry("network", imageUrl, dataFingerprint, assetStartedAt, telemetryOrigin);
                        return dataUrl;
                    } catch {
                        // Try the next known Fortnite image extension before giving up.
                    }
                }

                this.recordAssetTelemetry("miss", imageUrl, dataFingerprint, assetStartedAt, telemetryOrigin);
                return null;
            } catch (error) {
                this.recordAssetTelemetry("failure", imageUrl, dataFingerprint, assetStartedAt, telemetryOrigin, error);
                return null;
            }
        })().finally(() => {
            this.pendingSpriteAssetLoads.delete(imageUrl);
        });

        this.pendingSpriteAssetLoads.set(imageUrl, loadPromise);
        const resolved = await loadPromise;
        return resolved || undefined;
    }

    private async prewarmSpriteImages(
        imageUrls: Array<string | undefined>,
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN
    ) {
        const uniqueUrls = Array.from(new Set(imageUrls.filter((url): url is string => !!url)));
        const resolvedAssets = new Map<string, string>();
        await this.forEachConcurrent(uniqueUrls, SPRITE_IMAGE_PREWARM_CONCURRENCY, async (url) => {
            const src = await this.resolveSpriteImageSrc(url, telemetryOrigin);
            if (src) resolvedAssets.set(url, src);
        });
        return resolvedAssets;
    }

    private async hasRenderableSpriteArtwork(
        variant: SpriteVariant,
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN
    ) {
        return !!await this.resolveSpriteImageSrc(variant.imageUrl, telemetryOrigin);
    }

    private async isUsableSpriteArtwork(imageBuffer: Buffer) {
        try {
            const image = await loadImage(imageBuffer);
            const canvas = createCanvas(image.width, image.height);
            const ctx = canvas.getContext("2d");
            ctx.drawImage(image, 0, 0);

            const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
            let opaquePixels = 0;
            let darkPixels = 0;
            let colorfulPixels = 0;
            let lumaTotal = 0;

            for (let index = 0; index < pixels.length; index += 4) {
                const red = pixels[index];
                const green = pixels[index + 1];
                const blue = pixels[index + 2];
                const alpha = pixels[index + 3];
                if (alpha < 24) continue;

                opaquePixels += 1;
                const max = Math.max(red, green, blue);
                const min = Math.min(red, green, blue);
                const saturation = max === 0 ? 0 : (max - min) / max;
                const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

                lumaTotal += luma;
                if (max < 45) darkPixels += 1;
                if (saturation > 0.18 && max > 55) colorfulPixels += 1;
            }

            if (opaquePixels === 0) return false;

            const darkRatio = darkPixels / opaquePixels;
            const colorfulRatio = colorfulPixels / opaquePixels;
            const averageLuma = lumaTotal / opaquePixels;

            return !(darkRatio > 0.98 && colorfulRatio < 0.01 && averageLuma < 8);
        } catch {
            return false;
        }
    }

    private getSpriteImageUrlCandidates(imageUrl: string): string[] {
        if (!imageUrl.includes("fortnite.gg")) return [imageUrl];

        const webpUrl = imageUrl.replace(/\.(?:png|webp)(\?.*)?$/i, ".webp$1");
        const pngUrl = imageUrl.replace(/\.(?:png|webp)(\?.*)?$/i, ".png$1");
        return Array.from(new Set([webpUrl, imageUrl, pngUrl]));
    }

    private async readChromiumProcessMemoryBytes() {
        if (process.platform !== "linux") return null;

        const browserProcess = this.browser?.process?.();
        const rootPid = browserProcess?.pid;
        if (!rootPid) return null;

        const pendingPids = [rootPid];
        const visited = new Set<number>();
        let totalBytes = 0;

        while (pendingPids.length > 0) {
            const pid = pendingPids.shift();
            if (!pid || visited.has(pid)) continue;
            visited.add(pid);

            try {
                const status = await fs.promises.readFile(`/proc/${pid}/status`, "utf8");
                const rssMatch = status.match(/^VmRSS:\s+(\d+)\s+kB$/m);
                if (rssMatch) totalBytes += Number(rssMatch[1]) * 1024;
            } catch {
                continue;
            }

            try {
                const children = await fs.promises.readFile(`/proc/${pid}/task/${pid}/children`, "utf8");
                for (const child of children.trim().split(/\s+/)) {
                    const childPid = Number(child);
                    if (Number.isInteger(childPid) && childPid > 0) pendingPids.push(childPid);
                }
            } catch {
                // The process may exit between reading its status and children.
            }
        }

        return totalBytes || null;
    }

    private async renderHtmlToBuffer(
        html: string,
        width: number,
        height: number,
        deviceScaleFactor = 2,
        telemetry?: RenderTelemetryContext
    ): Promise<Buffer> {
        const pageAcquireStartedAt = Date.now();
        const wasQueued = this.pendingRenderPageAcquires.length > 0
            || (this.liveRenderPages.size >= RENDER_PAGE_POOL_SIZE && this.renderPagePool.length === 0);
        const page = await this.acquireRenderPage();
        if (telemetry) telemetry.pageQueueWaitMs = wasQueued ? Math.max(0, Date.now() - pageAcquireStartedAt) : 0;
        let pageHealthy = true;
        try {
            await page.setExtraHTTPHeaders({
                "Referer": "https://fortnite.gg/",
                "Accept-Language": "en-US,en;q=0.9"
            });
            await page.setViewport({ width, height, deviceScaleFactor });
            // Fully reset the document between renders. This keeps Chromium's
            // memory and renderer state bounded during long pre-render runs.
            await page.setContent(html, { waitUntil: "load", timeout: 15000 });
            await page.evaluate(async () => {
                await (document as any).fonts?.ready;
                const images = Array.from(document.images || []);
                await Promise.all(images.map(async img => {
                    if (img.complete) return;
                    await new Promise(resolve => {
                        img.addEventListener("load", resolve, { once: true });
                        img.addEventListener("error", resolve, { once: true });
                    });
                }));
            });
            const screenshot = Buffer.from(await page.screenshot({ type: "png" }));
            if (telemetry) {
                telemetry.renderedPixels = Math.max(1, Math.round(width * deviceScaleFactor))
                    * Math.max(1, Math.round(height * deviceScaleFactor));
                telemetry.chromiumMemoryBytes = await this.readChromiumProcessMemoryBytes();
            }
            return screenshot;
        } catch (error) {
            // A timed-out Page.captureScreenshot can leave the renderer/page
            // busy even though Puppeteer reports the promise as rejected.
            // Never return that page to the pool; retries must get a clean page.
            pageHealthy = false;
            await this.disposeRenderPage(page);
            throw error;
        } finally {
            if (pageHealthy) {
                await this.releaseRenderPage(page);
            }
        }
    }

    private getRenderTokensCss(): string {
        return this.renderTokensCss;
    }

    private getDistinctSpriteSupplemental(primary: string | undefined, supplemental: string | undefined): string {
        const main = String(primary || "").trim();
        const extra = String(supplemental || "").trim();

        if (!extra || /^No level scaling available\.?$/i.test(extra) || !main) return extra;

        const normalizedMain = main.replace(/\s+/g, " ").toLowerCase();
        const normalizedExtra = extra.replace(/\s+/g, " ").toLowerCase();
        return normalizedMain.includes(normalizedExtra) ? "" : extra;
    }

    private escapeHtml(value: string | number | null | undefined): string {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    private alphaColor(hex: string, alphaPercent: string | number) {
        return `color-mix(in srgb, ${hex} ${alphaPercent}%, transparent)`;
    }

    private renderMetaChip(value: string | number) {
        return `<span class="meta-chip">${this.escapeHtml(value)}</span>`;
    }

    private renderRarityPill(rarity: SpriteRarity) {
        const color = RARITY_CSS_COLORS[rarity];
        return `<span class="rarity-pill" style="--rarity-color:${color}; --rarity-bg:${this.alphaColor(color, 16)}">${this.escapeHtml(rarity)}</span>`;
    }

    private renderSpriteThumb(
        imageUrl: string | undefined,
        className: string,
        fallback = "No asset",
        resolvedAssets?: ReadonlyMap<string, string>
    ) {
        const resolvedSrc = imageUrl
            ? resolvedAssets?.get(imageUrl) || this.spriteAssetCache.get(imageUrl)?.src
            : undefined;
        return `
            <div class="sprite-thumb ${className}">
                ${resolvedSrc ? `<img src="${this.escapeHtml(resolvedSrc)}" alt="">` : `<span class="metric-label">${this.escapeHtml(fallback)}</span>`}
            </div>
        `;
    }

    private renderDustAmount(amount: number) {
        if (!amount) return `<span class="dust-unknown">Unknown</span>`;
        return `
            <span class="dust-amount">
                ${this.dustIconDataUrl ? `<img src="${this.dustIconDataUrl}" alt="Dust">` : `<em>dust</em>`}
                <strong>${amount.toLocaleString("en-US")}</strong>
            </span>
        `;
    }

    private renderSpawnRateIcon(key: string, label: string) {
        const iconSrc = this.spawnRateIconDataUrls[key];
        if (!iconSrc) return "";
        return `<img src="${iconSrc}" alt="${this.escapeHtml(label)} icon">`;
    }

    private renderSpawnRateStack(variant: SpriteVariant) {
        const entries = this.getSpawnRateEntries(variant);
        if (entries.length === 0) return "";

        return `
            <div class="spawn-rate-stack">
                <span class="metric-label">Spawn rates</span>
                <ul class="list-reset spawn-rate-list">
                    ${entries.map(entry => `
                        <li class="spawn-rate-row">
                            <span class="spawn-rate-copy">
                                <span class="spawn-rate-copy-main">
                                    <em>${this.escapeHtml(entry.label)}</em>
                                    ${this.renderSpawnRateIcon(entry.key, entry.label)}
                                </span>
                            </span>
                            <strong>${this.escapeHtml(entry.display)}</strong>
                        </li>
                    `).join("")}
                </ul>
            </div>
        `;
    }

    private renderPageBackTrail(items: string[]) {
        if (items.length === 0) return "";
        return `
            <div class="page-backtrail" aria-hidden="true">
                ${items.map(item => {
            const normalized = item.trim();
            const arrowMatch = normalized.match(/^([←→])\s*(.+)$/);
            if (!arrowMatch) return `<span class="page-backtrail-chip">${this.escapeHtml(normalized)}</span>`;
            return `
                        <span class="page-backtrail-chip">
                            <span class="page-backtrail-arrow">${this.escapeHtml(arrowMatch[1])}</span>
                            <span>${this.escapeHtml(arrowMatch[2])}</span>
                        </span>
                    `;
        }).join("")}
            </div>
        `;
    }

    private buildRenderDocument(content: string, extraCss: string) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
                <style>
                    ${this.getRenderTokensCss()}
                    html, body { overflow: clip; }
                    * { box-sizing: border-box; }
                    body {
                        margin: 0;
                        font-family: var(--font-body);
                        background: var(--color-canvas);
                        color: var(--color-ink);
                        -webkit-font-smoothing: antialiased;
                        text-rendering: optimizeLegibility;
                    }
                    img { display: block; max-width: 100%; }
                    .sprite-render-root {
                        width: 100%;
                        height: 100%;
                        padding: 26px;
                        background:
                            linear-gradient(180deg, color-mix(in oklch, var(--color-panel-3) 22%, transparent), transparent 36%),
                            var(--color-canvas);
                    }
                    .shell {
                        width: 100%;
                        height: 100%;
                        border-radius: var(--radius-lg);
                        border: 1px solid var(--color-rule);
                        background:
                            linear-gradient(180deg, color-mix(in oklch, var(--color-panel-2) 58%, transparent), transparent 30%),
                            var(--color-paper);
                        box-shadow: var(--shadow-panel);
                        overflow: hidden;
                        position: relative;
                    }
                    .shell::before {
                        content: "";
                        position: absolute;
                        inset: 0;
                        pointer-events: none;
                        background-image:
                            linear-gradient(var(--color-rule) 1px, transparent 1px),
                            linear-gradient(90deg, var(--color-rule) 1px, transparent 1px);
                        background-size: 44px 44px;
                        opacity: 0.12;
                    }
                    .content {
                        position: relative;
                        z-index: 1;
                        padding: 30px;
                        height: 100%;
                    }
                    .eyebrow {
                        display: inline-flex;
                        align-items: center;
                        width: max-content;
                        margin: 0 0 10px;
                        padding: 0.34rem 0.52rem;
                        border: 1px solid color-mix(in oklch, var(--color-accent) 35%, var(--color-rule));
                        border-radius: var(--radius-sm);
                        background: color-mix(in oklch, var(--color-accent) 10%, transparent);
                        color: var(--color-accent);
                        font: 700 0.68rem/1 var(--font-body);
                        text-transform: uppercase;
                        letter-spacing: 0;
                    }
                    .headline {
                        margin: 0;
                        font-family: var(--font-display);
                        font-size: var(--text-2xl);
                        line-height: 0.98;
                        color: var(--color-ink);
                        font-style: normal;
                        overflow-wrap: anywhere;
                    }
                    .season-emoji {
                        display: inline-block;
                        margin-left: 0.24em;
                        width: 1.05em;
                        height: 1.05em;
                        vertical-align: -0.14em;
                        object-fit: contain;
                    }
                    .lede {
                        margin: 8px 0 0;
                        max-width: 58ch;
                        color: var(--color-muted);
                        font-size: var(--text-sm);
                        line-height: 1.35;
                    }
                    .panel {
                        background: color-mix(in oklch, var(--color-panel) 92%, black);
                        border: 1px solid var(--color-rule);
                        border-radius: var(--radius-md);
                        overflow: hidden;
                    }
                    .meta-chip {
                        display: inline-flex;
                        align-items: center;
                        min-height: 32px;
                        padding: 0.45rem 0.68rem;
                        border-radius: var(--radius-sm);
                        border: 1px solid var(--color-rule);
                        background: var(--color-panel-2);
                        color: var(--color-ink);
                        font: 700 0.72rem/1 var(--font-body);
                        text-transform: uppercase;
                        white-space: nowrap;
                    }
                    .metric-label {
                        color: var(--color-ink-2);
                        font: 700 0.7rem/1.2 var(--font-body);
                        text-transform: uppercase;
                    }
                    .copy-title {
                        margin: 0;
                        color: var(--color-ink);
                        font: 700 0.78rem/1.1 var(--font-body);
                        text-transform: uppercase;
                    }
                    .dust-amount {
                        display: inline-flex;
                        align-items: center;
                        justify-content: flex-end;
                        gap: 7px;
                        color: var(--color-ink);
                        text-align: right;
                        white-space: nowrap;
                    }
                    .dust-amount strong {
                        font: 700 0.95rem/1 var(--font-mono);
                    }
                    .dust-amount img {
                        width: 22px;
                        height: 22px;
                        object-fit: contain;
                        filter: drop-shadow(0 8px 14px color-mix(in oklch, black 42%, transparent));
                    }
                    .dust-amount em {
                        color: var(--color-muted);
                        font: 600 0.6rem/1 var(--font-body);
                        font-style: normal;
                        text-transform: uppercase;
                    }
                    .dust-unknown {
                        color: var(--color-muted);
                        font: 600 0.72rem/1 var(--font-body);
                        text-align: right;
                        white-space: nowrap;
                    }
                    .sprite-thumb {
                        display: grid;
                        place-items: center;
                        border-radius: var(--radius-md);
                        background:
                            linear-gradient(180deg, var(--color-panel-3), var(--color-panel-2));
                        border: 1px solid var(--color-rule);
                        overflow: hidden;
                    }
                    .sprite-thumb img {
                        object-fit: contain;
                        filter: drop-shadow(0 15px 22px color-mix(in oklch, black 46%, transparent));
                    }
                    .rarity-pill {
                        display: inline-flex;
                        align-items: center;
                        padding: 0.3rem 0.46rem;
                        border-radius: var(--radius-sm);
                        border: 1px solid color-mix(in srgb, var(--rarity-color) 34%, transparent);
                        background: var(--rarity-bg);
                        color: var(--rarity-color);
                        font: 700 0.64rem/1 var(--font-body);
                        text-transform: uppercase;
                        white-space: nowrap;
                    }
                    .kicker {
                        color: var(--color-muted);
                        font: 700 0.68rem/1 var(--font-body);
                        text-transform: uppercase;
                    }
                    .page-head {
                        display: flex;
                        align-items: end;
                        justify-content: space-between;
                        gap: 24px;
                        min-width: 0;
                    }
                    .page-copy { min-width: 0; }
                    .page-backtrail {
                        display: inline-flex;
                        gap: 8px;
                        flex-wrap: wrap;
                        margin: 0 0 12px;
                    }
                    .page-backtrail-chip {
                        display: inline-flex;
                        align-items: center;
                        gap: 0.44rem;
                        min-height: 32px;
                        padding: 0.42rem 0.76rem;
                        border-radius: 999px;
                        border: 1px solid var(--color-rule);
                        background: color-mix(in oklch, var(--color-panel-2) 82%, transparent);
                        color: var(--color-ink-2);
                        font: 700 0.7rem/1 var(--font-body);
                        text-transform: uppercase;
                        white-space: nowrap;
                    }
                    .page-backtrail-arrow {
                        color: var(--color-muted);
                        font: 800 0.78rem/1 var(--font-body);
                    }
                    .page-meta {
                        display: flex;
                        gap: 8px;
                        flex-wrap: wrap;
                        justify-content: flex-end;
                        align-items: center;
                    }
                    .section-title {
                        margin: 0;
                        font-family: var(--font-display);
                        font-size: 1.35rem;
                        line-height: 1.05;
                        font-style: normal;
                    }
                    .list-reset { list-style: none; padding: 0; margin: 0; }
                    ${extraCss}
                </style>
            </head>
            <body>${content}</body>
            </html>
        `;
    }

    private async getOrRenderImage(
        cacheKey: string,
        render: (telemetry: RenderTelemetryContext) => Promise<Buffer>,
        dataFingerprint = this.getRenderDataFingerprint(),
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN
    ) {
        if (PRODUCTION_RENDER_CACHE_ENABLED && this.spriteAssetSyncPromise) {
            await this.spriteAssetSyncPromise.catch(() => undefined);
        }

        const cacheLookupStartedAt = Date.now();
        const cached = this.imageCache.get(cacheKey);
        if (cached) {
            this.touchCacheEntry(this.imageCache, cacheKey, cached);
            this.recordRenderTelemetry(
                "memory-hit",
                cacheKey,
                dataFingerprint,
                cacheLookupStartedAt,
                { pageQueueWaitMs: 0, renderedPixels: 0, chromiumMemoryBytes: null },
                telemetryOrigin
            );
            return cached.buffer;
        }

        const pending = this.pendingImageRenders.get(cacheKey);
        if (pending) {
            this.recordRenderTelemetry(
                "pending-hit",
                cacheKey,
                dataFingerprint,
                cacheLookupStartedAt,
                { pageQueueWaitMs: 0, renderedPixels: 0, chromiumMemoryBytes: null },
                telemetryOrigin
            );
            return pending;
        }

        const renderPromise = (async () => {
            const renderStartedAt = Date.now();
            const telemetry: RenderTelemetryContext = {
                pageQueueWaitMs: 0,
                renderedPixels: 0,
                chromiumMemoryBytes: null
            };

            try {
                if (PRODUCTION_RENDER_CACHE_ENABLED) {
                    const diskCached = await this.readRenderedImageFromDisk(cacheKey, dataFingerprint);
                    if (diskCached) {
                        this.setRenderedImageCacheEntry(cacheKey, diskCached);
                        this.recordRenderTelemetry("disk-hit", cacheKey, dataFingerprint, renderStartedAt, telemetry, telemetryOrigin);
                        return diskCached;
                    }
                }

                const buffer = await render(telemetry);
                this.setRenderedImageCacheEntry(cacheKey, buffer);
                if (PRODUCTION_RENDER_CACHE_ENABLED) {
                    await this.persistRenderedImageToDisk(cacheKey, buffer, dataFingerprint);
                }
                this.recordRenderTelemetry("cold-render", cacheKey, dataFingerprint, renderStartedAt, telemetry, telemetryOrigin);
                return buffer;
            } catch (error) {
                this.recordRenderTelemetry("failure", cacheKey, dataFingerprint, renderStartedAt, telemetry, telemetryOrigin, error);
                throw error;
            }
        })()
            .finally(() => {
                this.pendingImageRenders.delete(cacheKey);
            });

        this.pendingImageRenders.set(cacheKey, renderPromise);
        return renderPromise;
    }

    private getRenderedImageDiskCachePath(cacheKey: string, dataFingerprint = this.getRenderDataFingerprint()) {
        const digest = crypto.createHash("sha1").update(cacheKey).digest("hex");
        return path.join(RENDER_CACHE_DIR, this.renderUiFingerprint, dataFingerprint, `${digest}.png`);
    }

    private async readRenderedImageFromDisk(cacheKey: string, dataFingerprint?: string) {
        try {
            const buffer = await fs.promises.readFile(this.getRenderedImageDiskCachePath(cacheKey, dataFingerprint));
            const isPng = buffer.length >= 8
                && buffer[0] === 0x89
                && buffer[1] === 0x50
                && buffer[2] === 0x4e
                && buffer[3] === 0x47;
            return isPng ? buffer : null;
        } catch {
            return null;
        }
    }

    private async getCompleteRenderCacheBytes(tasks: RenderGenerationTask[], dataFingerprint: string): Promise<number | null> {
        if (!PRODUCTION_RENDER_CACHE_ENABLED || tasks.length === 0) return null;

        let totalBytes = 0;
        for (const task of tasks) {
            const cached = await this.readRenderedImageFromDisk(task.cacheKey(dataFingerprint), dataFingerprint);
            if (!cached) return null;
            totalBytes += cached.byteLength;
        }
        return totalBytes;
    }

    private async persistRenderedImageToDisk(cacheKey: string, buffer: Buffer, dataFingerprint?: string) {
        try {
            const targetPath = this.getRenderedImageDiskCachePath(cacheKey, dataFingerprint);
            await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
            const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`;
            await fs.promises.writeFile(tempPath, buffer);
            await fs.promises.rename(tempPath, targetPath);
        } catch (error) {
            console.warn(`[FortniteSprites] Failed to persist rendered image cache:`, error?.message || error);
        }
    }

    private getCanonicalOverviewCacheKey(state: SpriteBrowserState, dataFingerprint: string) {
        const variantFilter = state.variantFilter && state.variantFilter !== "all"
            ? this.getVariantNames().find(variant => variant.toLowerCase() === state.variantFilter!.toLowerCase()) || state.variantFilter
            : "all";
        const rarityFilter = state.rarityFilter && state.rarityFilter !== "all"
            ? RARITY_ORDER.find(rarity => rarity.toLowerCase() === state.rarityFilter!.toLowerCase()) || state.rarityFilter.toLowerCase()
            : "all";
        const searchQuery = state.searchQuery
            ? this.expandSearchQuery(this.normalizeWhitespace(state.searchQuery))
            : "";

        return `overview:${JSON.stringify({
            ui: this.renderUiFingerprint,
            data: dataFingerprint,
            season: this.normalizeSeasonFilter(state.seasonFilter || "current"),
            variant: variantFilter,
            rarity: rarityFilter,
            search: searchQuery
        })}`;
    }

    private async renderOverviewImage(
        families: SpriteFamily[],
        state: SpriteBrowserState,
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN
    ): Promise<Buffer> {
        const dataFingerprint = this.getRenderDataFingerprint();
        const cacheKey = this.getCanonicalOverviewCacheKey(state, dataFingerprint);
        return this.getOrRenderImage(cacheKey, async (telemetry) => {
            const displayFamilies = this.getDisplayFamilies(families);
            const resolvedAssets = await this.prewarmSpriteImages(
                displayFamilies.flatMap(family => family.variants.map(variant => variant.imageUrl)),
                telemetryOrigin
            );
            const renderFamilies = displayFamilies
                .map(family => ({
                    ...family,
                    variants: family.variants.filter(variant => !!variant.imageUrl && resolvedAssets.has(variant.imageUrl))
                }))
                .filter(family => family.variants.length > 0);
            const variants = renderFamilies.flatMap(family => family.variants.map(variant => ({ family, variant })));
            const variantColumns = this.getVariantNames(renderFamilies);
            const allSeasonsView = (state.seasonFilter || "current") === "all";
            const width = allSeasonsView ? 2500 : 2100;
            const rowHeight = allSeasonsView ? 108 : 92;
            const height = Math.max(allSeasonsView ? 1500 : 1300, 520 + Math.max(renderFamilies.length, 1) * rowHeight);
            const deviceScaleFactor = allSeasonsView ? 2.1 : 2;
            const tagSuffixes = [
                state.searchQuery ? `Search: "${state.searchQuery}"` : null,
                state.variantFilter && state.variantFilter !== "all" ? this.variantLabel(state.variantFilter) : null,
                state.rarityFilter && state.rarityFilter !== "all" ? this.titleCase(state.rarityFilter) : null
            ].filter(Boolean) as string[];
            const renderedTags = `<span class="meta-chip">${this.renderSeasonFilterHeading(state.seasonFilter || "current")}${tagSuffixes.length ? ` / ${tagSuffixes.map(tag => this.escapeHtml(tag)).join(" / ")}` : ""}</span>`;

            const html = this.buildRenderDocument(`
            <div class="sprite-render-root">
                <div class="shell">
                    <div class="content overview-layout">
                        <section class="page-head">
                            <div class="page-copy">
                                <p class="eyebrow">Fortnite sprites</p>
                                <h1 class="headline">${this.renderSeasonFilterHeading(state.seasonFilter || "current")}</h1>
                            </div>
                            <div class="page-meta">
                                ${this.renderMetaChip(`${renderFamilies.length} families`)}
                                ${this.renderMetaChip(`${variants.length} shown`)}
                                ${renderedTags}
                            </div>
                        </section>

                        <section class="panel overview-panel">
                            <div class="overview-board">
                                <div class="overview-table" style="--variant-count:${variantColumns.length}">
                                    ${renderFamilies.length === 0 ? `
                                        <article class="empty-state">
                                            <h3>No sprites found</h3>
                                            <p>Try a broader search, reset to all sprites, or pick a family from the menu.</p>
                                        </article>
                                    ` : `
                                        <div class="overview-table-head">
                                            ${variantColumns.map(variantName => `<span>${this.escapeHtml(this.variantLabel(variantName))}</span>`).join("")}
                                        </div>
                                        <div class="overview-family-list">
                                            ${renderFamilies.map(family => {
                return `
                                                    <article class="family-row">
                                                        ${variantColumns.map(variantName => {
                    const variant = family.variants.find(familyVariant => familyVariant.variant === variantName);
                    if (!variant) {
                        return `
                                                                    <div class="variant-cell variant-cell--empty" aria-hidden="true"></div>
                                                                `;
                    }
                    return `
                                                                <div class="variant-cell">
                                                                    ${this.renderSpriteThumb(variant.imageUrl, "overview-variant-thumb", "No asset", resolvedAssets)}
                                                                    <div class="overview-variant-copy">
                                                                        <h4>${this.escapeHtml(variant.name)}</h4>
                                                                        <p>${this.escapeHtml(this.formatChance(variant))}</p>
                                                                    </div>
                                                                    ${this.renderRarityPill(variant.rarity)}
                                                                </div>
                                                            `;
                }).join("")}
                                                    </article>
                                                `;
            }).join("")}
                                        </div>
                                    `}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        `, `
            .overview-layout { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 18px; }
            .overview-panel {
                display: grid;
                grid-template-rows: minmax(0, 1fr);
                padding: ${allSeasonsView ? 22 : 18}px;
                min-height: 0;
                background: color-mix(in oklch, var(--color-panel-2) 72%, black);
            }
            .overview-board {
                min-width: 0;
                min-height: 0;
            }
            .overview-table {
                display: grid;
                grid-template-rows: auto minmax(0, 1fr);
                gap: 10px;
                height: 100%;
            }
            .overview-table-head {
                display: grid;
                grid-template-columns: repeat(var(--variant-count), minmax(0, 1fr));
                gap: 10px;
                align-items: center;
                color: var(--color-muted);
                font: 700 0.78rem/1 var(--font-body);
                text-transform: uppercase;
            }
            .overview-table-head span {
                padding: 0 12px;
            }
            .overview-family-list {
                display: grid;
                gap: 10px;
                min-height: 0;
            }
            .family-row {
                display: grid;
                grid-template-columns: repeat(var(--variant-count), minmax(0, 1fr));
                gap: 10px;
                min-height: ${allSeasonsView ? 88 : 74}px;
            }
            .variant-cell {
                min-width: 0;
                border-radius: var(--radius-sm);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
            }
            .variant-cell {
                display: grid;
                grid-template-columns: ${allSeasonsView ? 82 : 68}px minmax(0, 1fr) auto;
                gap: ${allSeasonsView ? 16 : 14}px;
                align-items: center;
                padding: ${allSeasonsView ? 11 : 9}px ${allSeasonsView ? 14 : 12}px ${allSeasonsView ? 11 : 9}px ${allSeasonsView ? 11 : 9}px;
            }
            .variant-cell--empty {
                display: block;
                border-style: dashed;
                opacity: 0.42;
                background: color-mix(in oklch, var(--color-panel) 44%, transparent);
            }
            .overview-variant-thumb {
                width: ${allSeasonsView ? 80 : 66}px;
                height: ${allSeasonsView ? 78 : 64}px;
                overflow: visible;
            }
            .overview-variant-thumb img {
                width: ${allSeasonsView ? 72 : 58}px;
                height: ${allSeasonsView ? 72 : 58}px;
            }
            .overview-variant-copy {
                min-width: 0;
            }
            .overview-variant-copy h4 {
                margin: 0;
                color: var(--color-ink);
                font: 600 ${allSeasonsView ? 1.04 : 0.96}rem/1.08 var(--font-body);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .overview-variant-copy p {
                margin: 6px 0 0;
                color: var(--color-muted);
                font: 500 ${allSeasonsView ? 0.8 : 0.74}rem/1 var(--font-mono);
            }
            .variant-cell .rarity-pill {
                padding: 0.26rem 0.44rem;
                font-size: ${allSeasonsView ? 0.68 : 0.62}rem;
            }
            .empty-state {
                display: grid;
                place-items: center;
                min-height: 590px;
                padding: 28px;
                text-align: center;
                border-radius: var(--radius-md);
                border: 1px dashed var(--color-rule-2);
                background: var(--color-panel);
                color: var(--color-muted);
            }
            .empty-state h3 {
                margin: 0;
                color: var(--color-ink);
                font: 700 1.5rem/1 var(--font-display);
            }
            .empty-state p {
                margin: 8px 0 0;
                font-size: 0.88rem;
            }
        `);
            return this.renderHtmlToBuffer(html, width, height, deviceScaleFactor, telemetry);
        }, dataFingerprint, telemetryOrigin);
    }
    private async renderVariantImage(
        family: SpriteFamily,
        variant: SpriteVariant,
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN
    ): Promise<Buffer> {
        const dataFingerprint = this.getRenderDataFingerprint();
        const cacheKey = `variant:${this.renderUiFingerprint}:${dataFingerprint}:${family.key}:${variant.id}:${variant.name}`;
        return this.getOrRenderImage(cacheKey, async (telemetry) => {
            const width = 1000;
            const seasonCount = this.getVariantSeasonDetails(variant).availableSeasonIds.length;
            const height = 760 + Math.max(0, Math.ceil((seasonCount - 3) / 3)) * 20;
            const resolvedAssets = await this.prewarmSpriteImages([variant.imageUrl], telemetryOrigin);
            const rarityColor = RARITY_CSS_COLORS[variant.rarity];
            const effect = variant.effectText || family.effectSummary || "No effect description available.";
            const levelScaling = this.getDistinctSpriteSupplemental(effect, family.levelScaling);
            const perk = variant.specialEffectText || "";
            const location = family.location || "Unknown location";
            const bannerChance = this.formatChance(variant);
            const seasonDetails = this.getVariantSeasonDetails(variant);

            const html = this.buildRenderDocument(`
            <div class="sprite-render-root">
                <div class="shell">
                    <div class="content variant-layout">
                        <section class="page-head">
                            <div class="page-copy">
                                ${this.renderPageBackTrail(["← Overview", "← Family"])}
                                <h1 class="headline variant-headline">${this.escapeHtml(variant.name)}</h1>
                                <p class="lede">${this.escapeHtml(family.displayName)}</p>
                            </div>
                            <div class="page-meta">
                                ${this.renderVariantTypeDebutBadge(variant.variant)}
                            </div>
                        </section>

                        <section class="variant-main">
                            <article class="panel variant-art-card">
                                <div class="variant-art-stage">
                            ${this.renderSpriteThumb(variant.imageUrl, "variant-art", "No asset", resolvedAssets)}
                                </div>
                                <div class="variant-stat-strip">
                                    <div class="unique-banner">
                                        ${this.renderRarityPill(variant.rarity)}
                                        <strong>${this.escapeHtml(bannerChance)}</strong>
                                    </div>
                                    <div class="stat-tile stat-tile--cost">
            
                                        ${this.renderDustAmount(variant.summonCost)}
                                    </div>
                                    <div class="stat-tile">
                                        <span>Variant</span>
                                        <strong>${this.escapeHtml(this.variantLabel(variant.variant))}</strong>
                                    </div>
                                </div>
                            </article>

                            <article class="panel variant-info-card">
                                <div class="location-card">
                                    <span class="metric-label">Location</span>
                                    <strong>${this.escapeHtml(location)}</strong>
                                </div>

                                ${this.renderSeasonCard(seasonDetails)}

                                <div class="copy-block">
                                    <h3 class="copy-title">Effect</h3>
                                    <p>${this.escapeHtml(effect)}</p>
                                </div>

                                ${perk ? `
                                    <div class="copy-block copy-block--perk">
                                        <h3 class="copy-title">Variant perk</h3>
                                        <p>${this.escapeHtml(perk)}</p>
                                    </div>
                                ` : ""}

                                ${levelScaling ? `
                                    <div class="copy-block copy-block--scaling">
                                        <h3 class="copy-title">Level scaling</h3>
                                        <p>${this.escapeHtml(levelScaling)}</p>
                                    </div>
                                ` : ""}

                                ${this.renderSpawnRateStack(variant)}
                            </article>
                        </section>
                    </div>
                </div>
            </div>
        `, `
            .variant-layout { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 12px; }
            .variant-headline { font-size: 2.42rem; }
            .variant-debut {
                display: grid;
                justify-items: end;
                gap: 6px;
            }
            .variant-debut-label {
                color: var(--color-muted);
                font: 700 0.56rem/1 var(--font-body);
                letter-spacing: 0.09em;
                text-transform: uppercase;
            }
            .variant-debut-pills {
                display: flex;
                justify-content: flex-end;
                gap: 5px;
            }
            .variant-debut-pill {
                display: inline-flex;
                padding: 5px 8px;
                border-radius: 999px;
                border: 1px solid var(--color-rule);
                background: color-mix(in oklch, var(--color-panel-2) 78%, transparent);
                color: var(--color-ink);
                font: 700 0.66rem/1 var(--font-mono);
                white-space: nowrap;
            }
            .variant-main {
                display: grid;
                grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
                gap: 14px;
                min-height: 0;
            }
            .variant-art-card,
            .variant-info-card {
                padding: 10px;
                background: color-mix(in oklch, var(--color-panel-2) 78%, black);
            }
            .variant-art-card {
                display: grid;
                grid-template-rows: 1fr auto;
                gap: 8px;
            }
            .variant-art-stage { min-height: 0; }
            .variant-art {
                height: 368px;
                background:
                    linear-gradient(160deg, color-mix(in srgb, ${rarityColor} 18%, transparent), transparent 42%),
                    var(--color-panel);
            }
            .variant-art img {
                width: 330px;
                height: 330px;
            }
            .spawn-rate-stack {
                min-width: 0;
                width: 100%;
                max-width: 220px;
                justify-self: start;
                align-self: flex-start;
                margin-top: 12px;
                padding: 8px 10px;
                border: 1px solid color-mix(in srgb, ${rarityColor} 22%, var(--color-rule));
                border-radius: var(--radius-md);
                background: color-mix(in oklch, var(--color-panel-2) 86%, black);
            }
            .spawn-rate-list {
                display: grid;
                gap: 4px;
                margin: 6px 0 0;
            }
            .spawn-rate-row {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                min-height: 30px;
                padding: 4px 6px 4px 6px;
                border-radius: var(--radius-sm);
                background: color-mix(in oklch, var(--color-panel) 72%, transparent);
                color: var(--color-ink-2);
                font: 600 0.69rem/1.05 var(--font-body);
            }
            .spawn-rate-copy {
                display: grid;
                min-width: 0;
            }
            .spawn-rate-copy-main {
                display: inline-flex;
                align-items: center;
                gap: 14px;
                min-width: 0;
            }
            .spawn-rate-copy em {
                color: var(--color-ink);
                font: 700 0.7rem/1.05 var(--font-body);
                font-style: normal;
            }
            .spawn-rate-copy img {
                width: 20px;
                height: 20px;
                object-fit: contain;
                flex: 0 0 auto;
                display: block;
                margin-left: 1px;
                transform: scale(2.15);
                transform-origin: center;
            }
            .spawn-rate-row strong {
                color: var(--color-ink);
                min-width: 56px;
                text-align: right;
                font: 700 0.7rem/1 var(--font-mono);
                white-space: nowrap;
            }
            .variant-stat-strip {
                display: grid;
                grid-template-columns: minmax(0, 1.7fr) minmax(0, 0.85fr) minmax(0, 0.75fr);
                gap: 8px;
                min-height: 58px;
                padding: 8px;
                border: 1px solid var(--color-rule);
                border-radius: var(--radius-md);
                background: var(--color-panel);
            }
            .unique-banner {
                min-width: 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 8px 10px;
                border-radius: calc(var(--radius-md) - 4px);
                border: 1px solid color-mix(in srgb, ${rarityColor} 30%, var(--color-rule));
                background:
                    linear-gradient(90deg, color-mix(in srgb, ${rarityColor} 10%, transparent), transparent 62%),
                    color-mix(in oklch, var(--color-panel-2) 68%, transparent);
            }
            .unique-banner .rarity-pill {
                flex: 0 0 auto;
            }
            .unique-banner strong {
                color: var(--color-ink);
                font: 800 0.86rem/1 var(--font-display);
                white-space: nowrap;
            }
            .stat-tile {
                min-width: 0;
                display: grid;
                align-content: center;
                gap: 5px;
                padding: 8px 10px;
                border-radius: calc(var(--radius-md) - 4px);
                border: 1px solid color-mix(in oklch, var(--color-rule) 78%, transparent);
                background: color-mix(in oklch, var(--color-panel-2) 70%, transparent);
            }
            .stat-tile span {
                color: var(--color-muted);
                font: 700 0.58rem/1 var(--font-body);
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }
            .stat-tile strong,
            .stat-tile .dust-amount,
            .stat-tile .dust-unknown {
                color: var(--color-ink);
                font: 700 0.82rem/1.05 var(--font-display);
                letter-spacing: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .stat-tile--rarity {
                border-color: color-mix(in srgb, ${rarityColor} 35%, var(--color-rule));
            }
            .stat-tile--cost .dust-amount {
                display: inline-flex;
                justify-content: flex-start;
                gap: 6px;
                flex-direction: row;
            }
            .stat-tile--cost .dust-amount img {
                width: 18px;
                height: 18px;
            }
            .variant-info-card {
                display: flex;
                flex-direction: column;
                gap: 8px;
                min-height: 0;
            }
            .location-card {
                padding: 10px;
                border-radius: var(--radius-md);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
            }
            .location-card strong {
                display: block;
                margin-top: 5px;
                color: var(--color-ink);
                font: 700 0.98rem/1.14 var(--font-display);
                overflow-wrap: anywhere;
            }
            .season-card {
                display: grid;
                gap: 0;
                padding: 7px 10px;
                border-radius: var(--radius-md);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
            }
            .season-detail {
                min-width: 0;
                display: grid;
                grid-template-columns: 82px minmax(0, 1fr);
                gap: 8px;
                align-items: center;
                padding: 7px 2px;
                border-bottom: 1px solid color-mix(in oklch, var(--color-rule) 70%, transparent);
            }
            .season-detail .metric-label { white-space: nowrap; }
            .season-detail:last-child { border-bottom: 0; }
            .season-detail strong {
                color: var(--color-ink);
                font: 700 0.72rem/1.15 var(--font-body);
                overflow-wrap: anywhere;
            }
            .season-list {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
            }
            .season-list span {
                display: inline-flex;
                padding: 4px 6px;
                border-radius: 999px;
                border: 1px solid color-mix(in oklch, var(--color-rule) 78%, transparent);
                background: color-mix(in oklch, var(--color-panel-2) 72%, transparent);
                color: var(--color-ink);
                font: 700 0.61rem/1 var(--font-mono);
            }
            .copy-block {
                min-height: 0;
                padding: 10px;
                border-radius: var(--radius-md);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
            }
            .copy-block p {
                margin: 6px 0 0;
                color: var(--color-ink-2);
                font-weight: 400;
                font-size: 0.84rem;
                line-height: 1.24;
            }
            .copy-block--scaling {
                flex: 1 1 auto;
                display: grid;
                align-content: start;
            }
            .copy-block--scaling p {
                font-size: 0.78rem;
                line-height: 1.2;
                overflow-wrap: anywhere;
            }
            .copy-block--perk {
                border-color: color-mix(in srgb, ${rarityColor} 45%, var(--color-rule));
                background: linear-gradient(90deg, color-mix(in srgb, ${rarityColor} 9%, transparent), var(--color-panel));
            }
        `);
            return this.renderHtmlToBuffer(html, width, height, 2, telemetry);
        }, dataFingerprint, telemetryOrigin);
    }

    private async renderFamilyImage(
        family: SpriteFamily,
        telemetryOrigin: SpriteTelemetryOrigin = BACKGROUND_TELEMETRY_ORIGIN
    ): Promise<Buffer> {
        const variantIds = family.variants.map(variant => variant.id).join(",");
        const dataFingerprint = this.getRenderDataFingerprint();
        const cacheKey = `family:${this.renderUiFingerprint}:${dataFingerprint}:${family.key}:${variantIds}`;
        return this.getOrRenderImage(cacheKey, async (telemetry) => {
            const width = 1200;
            const resolvedAssets = await this.prewarmSpriteImages(family.variants.map(variant => variant.imageUrl), telemetryOrigin);
            const renderVariants = family.variants.filter(variant => !!variant.imageUrl && resolvedAssets.has(variant.imageUrl));
            const sortedVariants = [...renderVariants].sort((a, b) => {
                if (a.variant === "Base" && b.variant !== "Base") return -1;
                if (a.variant !== "Base" && b.variant === "Base") return 1;
                return b.chancePercent - a.chancePercent || a.id - b.id;
            });
            // The collection is a full list. Reserve space for the header, panel chrome, and
            // every row so the shell's overflow clipping cannot hide the last variant.
            const height = Math.max(820, 590 + sortedVariants.length * 124);
            const baseVariant = sortedVariants.find(variant => variant.variant === "Base") || sortedVariants[0];
            const familySeasonDetails = this.getFamilySeasonDetails(sortedVariants);
            const effect = family.effectSummary || "No effect description available.";
            const levelScaling = this.getDistinctSpriteSupplemental(effect, family.levelScaling);

            const html = this.buildRenderDocument(`
            <div class="sprite-render-root">
                <div class="shell">
                    <div class="content family-layout">
                        <section class="page-head">
                            <div class="page-copy">
                                ${this.renderPageBackTrail(["← Overview"])}
                                <p class="eyebrow">Sprite family</p>
                                <h1 class="headline family-headline">${this.escapeHtml(family.displayName)}</h1>
                                <p class="lede">${this.escapeHtml(family.location)}</p>
                            </div>
                            <div class="page-meta">
                                ${this.renderMetaChip(`${sortedVariants.length} variants`)}
                            </div>
                        </section>

                        <section class="family-main">
                            <article class="panel family-card">
                                ${this.renderSpriteThumb(baseVariant?.imageUrl, "featured-thumb", "No asset", resolvedAssets)}
                                <div class="family-summary">
                                    ${baseVariant ? this.renderRarityPill(baseVariant.rarity) : ""}
                                    <span>${sortedVariants.length} variants</span>
                                </div>
                                <div class="family-copy">
                                    <h3 class="copy-title">Effect</h3>
                                    <p>${this.escapeHtml(effect)}</p>
                                    ${levelScaling ? `
                                        <h3 class="copy-title">Level scaling</h3>
                                        <p>${this.escapeHtml(levelScaling)}</p>
                                    ` : ""}
                                </div>
                                ${this.renderFamilyHistory(familySeasonDetails)}
                            </article>

                            <article class="panel variant-panel">
                                <div class="panel-head">
                                    <div>
                                        <div class="kicker">Variants</div>
                                        <h2 class="section-title">Collection</h2>
                                    </div>
                                </div>
                                <ul class="list-reset variant-list">
                                    ${sortedVariants.map(variant => {
                return `
                                            <li class="variant-row">
                                                ${this.renderSpriteThumb(variant.imageUrl, "variant-thumb", "No asset", resolvedAssets)}
                                                <div class="variant-copy">
                                                    <h3>${this.escapeHtml(variant.name)}</h3>
                                                    <p>${this.escapeHtml(this.formatChance(variant))} chance</p>
                                                </div>
                                                ${this.renderRarityPill(variant.rarity)}
                                                <div class="variant-cost">${this.renderDustAmount(variant.summonCost)}</div>
                                            </li>
                                        `;
            }).join("")}
                                </ul>
                            </article>
                        </section>
                    </div>
                </div>
            </div>
        `, `
            .family-layout { display: grid; grid-template-rows: auto 1fr; gap: 20px; }
            .family-headline { font-size: 2.55rem; }
            .family-main {
                display: grid;
                grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.42fr);
                gap: 16px;
            }
            .family-card,
            .variant-panel {
                padding: 16px;
                background: color-mix(in oklch, var(--color-panel-2) 78%, black);
            }
            .family-card {
                display: grid;
                grid-template-rows: 328px auto auto auto;
                align-content: start;
                gap: 10px;
            }
            .featured-thumb { height: 328px; background: var(--color-panel); }
            .featured-thumb img { width: 300px; height: 300px; }
            .family-summary {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                min-height: 42px;
                padding: 9px 10px;
                border-radius: var(--radius-md);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
                color: var(--color-muted);
                font: 600 0.74rem/1 var(--font-body);
                text-transform: uppercase;
            }
            .family-copy {
                display: grid;
                gap: 8px;
                color: var(--color-ink);
                align-content: start;
            }
            .family-copy p {
                margin: 0 0 9px;
                color: var(--color-ink-2);
                font-weight: 400;
                font-size: 0.94rem;
                line-height: 1.36;
            }
            .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
            .variant-list { display: grid; gap: 10px; }
            .variant-row {
                display: grid;
                grid-template-columns: 92px minmax(0, 1fr) auto 86px;
                gap: 14px;
                align-items: center;
                padding: 10px;
                border-radius: var(--radius-md);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
            }
            .variant-thumb { height: 92px; background: var(--color-panel-2); }
            .variant-thumb img { width: 88px; height: 88px; }
            .variant-copy h3 {
                margin: 0;
                font: 700 0.96rem/1.05 var(--font-body);
                color: var(--color-ink);
            }
            .variant-copy p {
                margin: 6px 0 0;
                color: var(--color-ink-2);
                font-weight: 400;
                font-size: 0.82rem;
            }
            .family-history {
                display: grid;
                gap: 7px;
                margin-top: 2px;
                padding: 11px 12px;
                border-radius: var(--radius-md);
                border: 1px solid var(--color-rule);
                background: color-mix(in oklch, var(--color-panel-2) 68%, transparent);
            }
            .family-history-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }
            .family-history-row + .family-history-row {
                padding-top: 7px;
                border-top: 1px solid color-mix(in oklch, var(--color-rule) 68%, transparent);
            }
            .family-history-row > span {
                color: var(--color-muted);
                font: 750 0.62rem/1 var(--font-body);
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }
            .family-history-row strong {
                color: var(--color-ink);
                font: 700 0.72rem/1.1 var(--font-mono);
                text-align: right;
            }
            .family-history .season-list {
                display: flex;
                flex-wrap: wrap;
                justify-content: flex-end;
                gap: 4px;
            }
            .family-history .season-list span {
                display: inline-flex;
                padding: 4px 6px;
                border-radius: 999px;
                border: 1px solid color-mix(in oklch, var(--color-rule) 78%, transparent);
                background: color-mix(in oklch, var(--color-panel) 76%, transparent);
                color: var(--color-ink);
                font: 700 0.61rem/1 var(--font-mono);
            }
            .variant-cost {
                display: grid;
                justify-content: end;
                width: 86px;
                color: var(--color-ink);
            }
        `);
            return this.renderHtmlToBuffer(html, width, height, 2, telemetry);
        }, dataFingerprint, telemetryOrigin);
    }
    private getFamilyColor(family: SpriteFamily): string {
        const base = family.variants.find(v => v.variant === "Base") || family.variants[0];
        return RARITY_HEX_COLORS[base.rarity];
    }

    private getVariantSeasonDetails(variant: SpriteVariant) {
        const introducedSeasonId = variant.introducedSeasonId;
        const availableSeasonIds = this.sortSeasonIds(variant.availableSeasonIds || (introducedSeasonId ? [introducedSeasonId] : []));
        return { introducedSeasonId, availableSeasonIds };
    }

    private getFamilySeasonDetails(variants: SpriteVariant[]) {
        const introducedSeasonId = this.sortSeasonIds(variants
            .map(variant => variant.introducedSeasonId)
            .filter((seasonId): seasonId is string => Boolean(seasonId)))[0];
        const availableSeasonIds = this.sortSeasonIds(variants.flatMap(variant =>
            variant.availableSeasonIds || (variant.introducedSeasonId ? [variant.introducedSeasonId] : [])));
        return { introducedSeasonId, availableSeasonIds };
    }

    private getAvailableSeasonIds() {
        const historyIds = this.spriteHistory.records.flatMap(record => record.appearances.map(appearance => appearance.seasonId));
        const dataIds = this._data?.families.flatMap(family => family.variants.flatMap(variant => variant.availableSeasonIds || [])) || [];
        const currentId = this._data?.seasonContext?.id;
        return this.sortSeasonIds([...historyIds, ...dataIds, ...(currentId ? [currentId] : [])]).reverse();
    }

    private normalizeSeasonFilter(value?: string): string {
        if (value === "all") return value;
        const availableSeasonIds = this.getAvailableSeasonIds();
        const currentSeasonId = this._data?.seasonContext?.id;
        if (!value || value === "current") return currentSeasonId && availableSeasonIds.includes(currentSeasonId) ? currentSeasonId : availableSeasonIds[0] || "all";
        return availableSeasonIds.includes(value) ? value : currentSeasonId || availableSeasonIds[0] || "all";
    }

    private variantMatchesSeason(variant: SpriteVariant, seasonFilter: string) {
        if (seasonFilter === "all") return true;
        const targetSeasonId = seasonFilter === "current" ? this._data?.seasonContext?.id : seasonFilter;
        if (!targetSeasonId) return seasonFilter === "current";
        if (variant.availableSeasonIds?.length) return variant.availableSeasonIds.includes(targetSeasonId);
        if (variant.introducedSeasonId) return variant.introducedSeasonId === targetSeasonId;
        return seasonFilter === "current" && (!this._data?.seasonContext?.seasonKey || !variant.sourceSeasonKey || variant.sourceSeasonKey === this._data.seasonContext.seasonKey);
    }

    private filterFamilyBySeason(family: SpriteFamily, seasonFilter: string): SpriteFamily | undefined {
        if (seasonFilter === "all") return family;
        const variants = family.variants.filter(variant => this.variantMatchesSeason(variant, seasonFilter));
        return variants.length ? { ...family, variants } : undefined;
    }

    private describeSeasonFilter(seasonFilter: string) {
        if (seasonFilter === "all") return "All recorded seasons";
        if (seasonFilter === "current") {
            const currentSeasonId = this._data?.seasonContext?.id;
            return currentSeasonId ? this.formatSeasonId(currentSeasonId) : "Current season";
        }
        return this.formatSeasonId(seasonFilter);
    }

    private renderSeasonFilterHeading(seasonFilter: string) {
        const label = this.describeSeasonFilter(seasonFilter);
        const seasonId = seasonFilter === "current" ? this._data?.seasonContext?.id : seasonFilter;
        return seasonFilter !== "all" && seasonId ? this.renderSeasonLabel(seasonId) : this.escapeHtml(label);
    }

    private renderSeasonLabel(id: string, compact = false) {
        const label = compact ? this.formatCompactSeasonId(id) : this.formatSeasonId(id);
        const parsed = this.parseSeasonId(id);
        const emoji = parsed ? getFortniteSeasonEmoji(parsed.chapter, Number(parsed.season)) : undefined;
        if (!emoji || !label.endsWith(emoji)) return this.escapeHtml(label);
        const text = label.slice(0, -emoji.length).trimEnd();
        const emojiUrl = this.getSeasonEmojiAssetUrl(emoji);
        return `${this.escapeHtml(text)} <img class="season-emoji" src="${this.escapeHtml(emojiUrl)}" alt="${this.escapeHtml(emoji)}">`;
    }

    private getSeasonEmojiAssetUrl(emoji: string) {
        const codepoints = Array.from(emoji)
            .map(character => character.codePointAt(0)?.toString(16))
            .filter(Boolean)
            .join("-");
        return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoints}.svg`;
    }

    private renderSeasonCard(details: { introducedSeasonId?: string; availableSeasonIds: string[] }) {
        if (!details.introducedSeasonId && details.availableSeasonIds.length === 0) return "";
        const introducedText = details.introducedSeasonId ? this.formatSeasonId(details.introducedSeasonId) : "Unknown";
        const introduced = details.introducedSeasonId ? this.renderSeasonLabel(details.introducedSeasonId) : introducedText;
        const available = details.availableSeasonIds.map(id => this.formatSeasonId(id));
        const duplicatesIntroduction = available.length === 1 && available[0] === introducedText;
        return `
            <div class="season-card">
                <div class="season-detail">
                    <span class="metric-label">Introduced</span>
                    <strong>${introduced}</strong>
                </div>
                ${duplicatesIntroduction || available.length === 0 ? "" : `
                    <div class="season-detail">
                        <span class="metric-label">Available in</span>
                        <div class="season-list">${details.availableSeasonIds.map((id, index) => `<span title="${this.escapeHtml(available[index])}">${this.renderSeasonLabel(id, true)}</span>`).join("")}</div>
                    </div>
                `}
            </div>
        `;
    }

    private renderFamilyHistory(details: { introducedSeasonId?: string; availableSeasonIds: string[] }) {
        if (!details.introducedSeasonId && details.availableSeasonIds.length === 0) return "";
        const introduced = details.introducedSeasonId ? this.renderSeasonLabel(details.introducedSeasonId) : "Unknown";
        const showAvailable = details.availableSeasonIds.length > 1
            || (details.availableSeasonIds.length === 1 && details.availableSeasonIds[0] !== details.introducedSeasonId);
        return `
            <div class="family-history">
                <div class="family-history-row"><span>Introduced</span><strong>${introduced}</strong></div>
                ${showAvailable ? `<div class="family-history-row"><span>Available in</span><div class="season-list">${details.availableSeasonIds.map(id => `<span title="${this.escapeHtml(this.formatSeasonId(id))}">${this.renderSeasonLabel(id, true)}</span>`).join("")}</div></div>` : ""}
            </div>
        `;
    }

    private renderVariantTypeDebutBadge(variantName: SpriteVariantName) {
        if (variantName === "Base") return "";
        const historySeasonIds = this.spriteHistory.records
            .filter(record => record.variant === variantName)
            .map(record => record.introducedSeasonId)
            .filter(Boolean);
        const dataSeasonIds = this._data?.families.flatMap(family => family.variants
            .filter(variant => variant.variant === variantName && variant.introducedSeasonId)
            .map(variant => variant.introducedSeasonId as string)) || [];
        const introducedSeasonId = this.sortSeasonIds([...historySeasonIds, ...dataSeasonIds])[0];
        if (!introducedSeasonId) return "";
        return `<div class="variant-debut"><span class="variant-debut-label">Variant debut</span><div class="variant-debut-pills"><span class="variant-debut-pill">${this.escapeHtml(this.variantLabel(variantName))}</span><span class="variant-debut-pill" title="${this.escapeHtml(this.formatSeasonId(introducedSeasonId))}">${this.renderSeasonLabel(introducedSeasonId, true)}</span></div></div>`;
    }

    private sortSeasonIds(ids: string[]) {
        return Array.from(new Set(ids)).sort((a, b) => {
            const left = this.parseSeasonId(a);
            const right = this.parseSeasonId(b);
            if (left && right) return left.chapter - right.chapter || left.season.localeCompare(right.season, undefined, { numeric: true });
            return a.localeCompare(b, undefined, { numeric: true });
        });
    }

    private parseSeasonId(id: string) {
        const match = id.match(/^chapter-(\d+)-season-(.+)$/i);
        return match ? { chapter: Number(match[1]), season: match[2].replace(/-/g, " ") } : null;
    }

    private formatSeasonId(id: string) {
        const parsed = this.parseSeasonId(id);
        if (!parsed) return this.titleCase(id.replace(/-/g, " "));
        const emoji = getFortniteSeasonEmoji(parsed.chapter, Number(parsed.season));
        return `Chapter ${parsed.chapter} Season ${this.titleCase(parsed.season)}${emoji ? ` ${emoji}` : ""}`;
    }

    private formatCompactSeasonId(id: string) {
        const parsed = this.parseSeasonId(id);
        if (!parsed) return this.titleCase(id.replace(/-/g, " "));
        const emoji = getFortniteSeasonEmoji(parsed.chapter, Number(parsed.season));
        return `C${parsed.chapter} S${this.titleCase(parsed.season)}${emoji ? ` ${emoji}` : ""}`;
    }

    private formatAutocompleteChoice(item: SpriteSearchItem) {
        const name = item.type === "family"
            ? `${this.familyEmoji(item.familyKey)} ${item.name} family`
            : `${this.variantEmoji(item.variant)} ${item.name} - ${this.formatVariantBrief(this.findVariantInFamily(item.familyKey, item.variantId)?.variant)}`;

        return {
            name: this.truncate(name, 100),
            value: item.value
        };
    }

    private spriteMatchesQuery(family: SpriteFamily, variant: SpriteVariant, query: string) {
        const q = this.expandSearchQuery(query);
        const haystack = this.buildSearchText(
            family.displayName,
            family.key,
            this.getFamilySearchTokens(family.key),
            family.effectSummary,
            family.levelScaling,
            family.location,
            variant.name,
            `#${variant.id}`,
            variant.id,
            variant.rarity,
            this.getRaritySearchTokens(variant.rarity),
            variant.variant,
            this.getVariantSearchTokens(variant.variant),
            this.variantLabel(variant.variant),
            this.formatChance(variant),
            this.getSpawnRateEntries(variant).map(rate => `${rate.label} ${rate.display}`),
            variant.summonCost.toString(),
            variant.effectText,
            variant.specialEffectText
        );

        return haystack.includes(q) || q.split(/\s+/).filter(Boolean).every(part => haystack.includes(part));
    }

    private describeOverviewState(state: SpriteBrowserState) {
        const parts = [
            this.describeSeasonFilter(state.seasonFilter || "current"),
            state.searchQuery ? `Results for "${state.searchQuery}"` : null,
            state.variantFilter && state.variantFilter !== "all" ? `${this.variantEmoji(state.variantFilter)} ${this.variantLabel(state.variantFilter)} variants` : null,
            state.rarityFilter && state.rarityFilter !== "all" ? `${this.rarityEmoji(state.rarityFilter)} ${this.titleCase(state.rarityFilter)} rarity` : null
        ].filter(Boolean);

        return parts.join(" / ");
    }

    private stateFromQuickFilter(value: string): SpriteBrowserState {
        if (value === "all") return { seasonFilter: "all", variantFilter: "all", rarityFilter: "all", searchQuery: undefined, familyKey: undefined };
        if (value === "filters:clear") return { variantFilter: "all", rarityFilter: "all", searchQuery: undefined, familyKey: undefined };
        if (value === "season:current") return { seasonFilter: "current", variantFilter: "all", rarityFilter: "all", searchQuery: undefined, familyKey: undefined };
        if (value === "season:all") return { seasonFilter: "all" };
        if (value.startsWith("variant:")) return { variantFilter: value.replace("variant:", "") as SpriteVariantName };
        if (value.startsWith("rarity:")) return { rarityFilter: value.replace("rarity:", "") as SpriteRarity };
        return {};
    }

    private familyEmoji(familyKey?: string) {
        const emojis: Record<string, string> = {
            water: "🫧",
            earth: "🪵",
            fire: "❤️‍🔥",
            duck: "🐤",
            ghost: "🫥",
            dream: "☁️",
            punk: "🎸",
            king: "☠️",
            "zero-point": "🔮",
            demon: "👹",
            "burnt-peanut": "🥜",
            boss: "😎",
            seven: "7️⃣",
            fishy: "🐡",
            striker: "⚽",
            aura: "🪄",
            air: "🪁",
            "john-wick": "🐶",
            batman: "🦇",
            grim: "🪦",
            pollo: "🎮",
            "vini-jr": "🇧🇷",
            ironmouse: "🎀",
            llama: "🪅",
            peely: "🍌",
            jackrabbit: "🐇",
            shadow: "🌑",
            bush: "🌿",
            tails: "🦊",
            killswitch: "🔌",
            adventure: "🧭",
            klombo: "🦕",
            jonesy: "🪖",
            sonic: "🦔",
            crown: "👑",
            "8-bit": "👾",
            "storm-scout": "⛈️"
        };
        return familyKey ? emojis[familyKey] || "🧚" : "🧚";
    }

    private rarityEmoji(rarity?: SpriteRarity) {
        const emojis: Record<SpriteRarity, string> = {
            rare: "🔵",
            epic: "🟣",
            legendary: "🟠",
            mythic: "🟡",
            special: "✨"
        };
        return rarity ? emojis[rarity] || "💠" : "💠";
    }

    private variantEmoji(variant?: SpriteVariantName) {
        const emojis: Record<SpriteVariantName, string> = {
            Base: "🌱",
            Candy: "🍬",
            Galaxy: "🌌",
            Gold: "🏆",
            Holofoil: "🪩",
            Gem: "💎",
            Cube: "🧊",
            Quack: "🐥",
            Cheatmaster: "🃏"
        };
        return variant ? emojis[variant] || "🧩" : "🎭";
    }

    private formatVariantBrief(variant?: SpriteVariant) {
        if (!variant) return "Sprite";
        return `${this.rarityEmoji(variant.rarity)} ${this.titleCase(variant.rarity)}, ${this.formatChance(variant)}, ${variant.summonCost.toLocaleString("en-US")} cost`;
    }

    private formatChance(variant: SpriteVariant) {
        const primaryRate = this.getPrimarySpawnRate(variant);
        if (primaryRate) return primaryRate.display;
        if (variant.chancePercent === 0) return "Unavailable";
        return variant.chanceLabel || "Unknown";
    }

    private variantLabel(variant: SpriteVariantName) {
        return variant === "Candy" ? "Gummy" : variant;
    }

    private getVariantNames(families?: SpriteFamily[]) {
        const variants = families ? families.flatMap(family => family.variants) : this.getDisplayFamilies(this._data?.families || []).flatMap(family => family.variants);
        const names = Array.from(new Set(variants.map(variant => variant.variant)));
        const preferredOrder = ["Base", "Gold", "Candy", "Galaxy", "Holofoil"];
        return names.sort((a, b) => {
            const aIndex = preferredOrder.indexOf(a);
            const bIndex = preferredOrder.indexOf(b);
            if (aIndex !== -1 || bIndex !== -1) {
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            }
            return this.variantLabel(a).localeCompare(this.variantLabel(b));
        });
    }

    private titleCase(value: string) {
        return value.split(/[\s_-]+/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
    }

    private truncate(value: string, length: number) {
        if (value.length <= length) return value;
        return value.substring(0, length - 3) + "...";
    }

    private extractOwnerId(customId: string): string | null {
        const pipeIndex = customId.lastIndexOf("|");
        if (pipeIndex === -1) return null;
        return customId.substring(pipeIndex + 1);
    }

    private stripOwnerId(customId: string): string {
        const pipeIndex = customId.lastIndexOf("|");
        if (pipeIndex === -1) return customId;
        return customId.substring(0, pipeIndex);
    }

    private async getDisplayName(i: SelectMenuInteraction<CacheType> | ButtonInteraction<CacheType> | CommandInteraction<CacheType>): Promise<string> {
        let member = i.member as any;

        if (i.guild && (!member || (!member.nickname && !member.nick))) {
            try {
                member = await i.guild.members.fetch(i.user.id);
            } catch (e) { }
        }

        const user = i.user as any;
        const nickname = member?.nickname || member?.nick;
        let globalName = user?.globalName || user?.global_name;

        if (!nickname && !globalName) {
            try {
                const res = await axios.get(`https://discord.com/api/v10/users/${i.user.id}`, {
                    headers: { Authorization: `Bot ${i.client.token}` }
                });
                globalName = res.data.global_name;
            } catch (e) {
                console.error("[FortniteSprites] Failed to fetch raw user for global_name", e);
            }
        }

        return nickname || globalName || user?.username || "User";
    }

    private async handleSelectMenu(i: SelectMenuInteraction<CacheType>) {
        if (!this._data) return i.reply({ content: "Sprite data is not loaded yet.", ephemeral: true });

        const rawId = this.stripOwnerId(i.customId);
        const ownerId = this.extractOwnerId(i.customId) || i.user.id;
        const isOriginalUser = i.user.id === ownerId;
        const spawnsNewPage = rawId === "fn_sprites_family_select" || rawId.startsWith("fn_sprites_variant_select_");

        if (spawnsNewPage || !isOriginalUser) {
            await i.deferReply({ ephemeral: !isOriginalUser && !spawnsNewPage });
        } else {
            await i.deferUpdate();
        }

        const interactionSequence = this.beginInteraction(i.message.id);
        const displayName = await this.getDisplayName(i);
        const author = this.createAuthor(displayName, i.user.displayAvatarURL({ dynamic: true }), i.user.username);
        const responseOwnerId = isOriginalUser ? ownerId : i.user.id;
        const responseDataFingerprint = this.getRenderDataFingerprint();

        const trackedMessage = this.trackedSpriteMessages.get(i.message.id);
        const telemetryOrigin = this.createTelemetryOrigin(
            trackedMessage?.author.username || i.user.username,
            i.message.id,
            i.id,
            i.user.username
        );
        const currentState = trackedMessage && 'state' in trackedMessage.view ? (trackedMessage.view.state || {}) : {};

        let response: any;
        let view: SpriteViewState | null = null;
        if (rawId === "fn_sprites_family_select") {
            const familyKey = i.values[0];
            const sourceFamily = this.findFamily(familyKey);
            const family = sourceFamily ? this.filterFamilyBySeason(sourceFamily, currentState.seasonFilter || "current") : undefined;
            let targetVariant: SpriteVariant | undefined;
            
            if (currentState.variantFilter || currentState.rarityFilter) {
                targetVariant = family?.variants.find(v => 
                    (!currentState.variantFilter || currentState.variantFilter === "all" || v.variant === currentState.variantFilter) &&
                    (!currentState.rarityFilter || currentState.rarityFilter === "all" || v.rarity === currentState.rarityFilter)
                );
            }
            
            if (targetVariant) {
                view = { kind: "detail", familyKey, variantId: targetVariant.id, state: currentState };
                response = await this.generateDetailResponse(family!, targetVariant, responseOwnerId, i.user, displayName, undefined, currentState, telemetryOrigin);
            } else {
                view = { kind: "family", familyKey, state: currentState };
                response = await this.generateFamilyResponse(familyKey, responseOwnerId, i.user, displayName, undefined, currentState, telemetryOrigin);
            }
        } else if (rawId.startsWith("fn_sprites_variant_select_")) {
            const id = parseInt(i.values[0], 10);
            const familyKey = rawId.replace("fn_sprites_variant_select_", "");
            const sourceFamily = this.findFamily(familyKey);
            const family = sourceFamily ? this.filterFamilyBySeason(sourceFamily, currentState.seasonFilter || "current") : undefined;
            const variant = family?.variants.find(candidate => candidate.id === id);
            if (!family || !variant) return i.editReply({ content: "That sprite variant is not available in the selected season.", components: [] });
            view = { kind: "detail", familyKey: family.key, variantId: variant.id, state: currentState };
            response = await this.generateDetailResponse(family, variant, responseOwnerId, i.user, displayName, undefined, currentState, telemetryOrigin);
        } else if (rawId === "fn_sprites_quick_filter") {
            const state = { ...currentState, ...this.stateFromQuickFilter(i.values[0]), familyPage: 0 };
            view = { kind: "overview", state };
            response = await this.generateOverviewResponse(state, responseOwnerId, i.user, displayName, undefined, telemetryOrigin);
        } else if (rawId === "fn_sprites_season_filter") {
            const state = {
                ...currentState,
                seasonFilter: this.normalizeSeasonFilter(i.values[0]),
                variantFilter: "all" as const,
                rarityFilter: "all" as const,
                searchQuery: undefined,
                familyKey: undefined,
                familyPage: 0
            };
            view = { kind: "overview", state };
            response = await this.generateOverviewResponse(state, responseOwnerId, i.user, displayName, undefined, telemetryOrigin);
        } else if (rawId === "fn_sprites_variant_filter") {
            const state = { ...currentState, variantFilter: i.values[0] as any, familyPage: 0 };
            view = { kind: "overview", state };
            response = await this.generateOverviewResponse(state, responseOwnerId, i.user, displayName, undefined, telemetryOrigin);
        } else if (rawId === "fn_sprites_rarity_filter") {
            const state = { ...currentState, rarityFilter: i.values[0] as any, familyPage: 0 };
            view = { kind: "overview", state };
            response = await this.generateOverviewResponse(state, responseOwnerId, i.user, displayName, undefined, telemetryOrigin);
        }

        if (!response) {
            if (spawnsNewPage || !isOriginalUser) return i.editReply({ content: "That sprite control is no longer available.", components: [] });
            return i.followUp({ content: "That sprite control is no longer available.", ephemeral: true });
        }

        if (spawnsNewPage || !isOriginalUser) {
            const message = await i.editReply(response) as Message;
            if (view && (spawnsNewPage || isOriginalUser)) {
                this.rememberSpriteMessage(message, responseOwnerId, author, view, null, responseDataFingerprint);
            }
            this.maybeQueueRuntimeRefresh(telemetryOrigin, "interaction");
            return message;
        }

        if (!this.isLatestInteraction(i.message.id, interactionSequence)) return i.message as Message;
        const trackedState = view
            ? this.beginTrackedMessageTransition({ id: i.message.id, channelId: i.channelId }, responseOwnerId, author, view, null, responseDataFingerprint)
            : null;
        let message: Message | null = null;
        await this.queueMessageEdit(i.message.id, async () => {
            const latestState = trackedState ? this.trackedSpriteMessages.get(i.message.id) : null;
            if (!this.isLatestInteraction(i.message.id, interactionSequence)) return;
            if (trackedState && (!latestState || latestState.editToken !== trackedState.editToken || latestState.viewVersion !== trackedState.viewVersion)) return;
            message = await i.editReply({ ...response, attachments: [] } as any) as Message;
        });
        if (!message) {
            return i.message as Message;
        }
        if (view) {
            const latestState = this.trackedSpriteMessages.get(message.id);
            if (!latestState || (trackedState && latestState.editToken !== trackedState.editToken)) {
                return message;
            }
            this.trackedSpriteMessages.set(message.id, {
                ...latestState,
                channelId: message.channelId,
                updatedAt: Date.now()
            });
        }
        this.maybeQueueRuntimeRefresh(telemetryOrigin, "interaction");
        return message;
    }

    private async handleButton(i: ButtonInteraction<CacheType>) {
        if (!this._data) return i.reply({ content: "Sprite data is not loaded yet.", ephemeral: true });

        const rawId = this.stripOwnerId(i.customId);
        const ownerId = this.extractOwnerId(i.customId) || i.user.id;
        const isOriginalUser = i.user.id === ownerId;
        if (isOriginalUser) {
            await i.deferUpdate();
        } else {
            await i.deferReply();
        }

        const interactionSequence = this.beginInteraction(i.message.id);
        const displayName = await this.getDisplayName(i);
        const author = this.createAuthor(displayName, i.user.displayAvatarURL({ dynamic: true }), i.user.username);
        const responseOwnerId = isOriginalUser ? ownerId : i.user.id;
        const responseDataFingerprint = this.getRenderDataFingerprint();
        const trackedMessage = this.trackedSpriteMessages.get(i.message.id);
        const telemetryOrigin = this.createTelemetryOrigin(
            trackedMessage?.author.username || i.user.username,
            i.message.id,
            i.id,
            i.user.username
        );
        const currentState = trackedMessage && 'state' in trackedMessage.view ? (trackedMessage.view.state || {}) : {};
        const currentFamilyKey = trackedMessage?.view.kind === "family" || trackedMessage?.view.kind === "detail" ? trackedMessage.view.familyKey : null;

        let response: any;
        let view: SpriteViewState | null = null;

        if (rawId === "fn_sprites_overview") {
            view = { kind: "overview", state: currentState };
            response = await this.generateOverviewResponse(currentState, responseOwnerId, i.user, displayName, undefined, telemetryOrigin);
        } else if (rawId.startsWith("fn_sprites_family_page_")) {
            const page = parseInt(rawId.replace("fn_sprites_family_page_", ""), 10);
            const state = { ...currentState, familyPage: Number.isFinite(page) ? page : 0 };
            view = { kind: "overview", state };
                response = await this.generateOverviewResponse(state, responseOwnerId, i.user, displayName, undefined, telemetryOrigin);
        } else if (rawId.startsWith("fn_sprites_family_")) {
            const familyKey = rawId.replace("fn_sprites_family_", "");
            const sourceFamily = this.findFamily(familyKey);
            const family = sourceFamily ? this.filterFamilyBySeason(sourceFamily, currentState.seasonFilter || "current") : undefined;
            let targetVariant: SpriteVariant | undefined;
            
            if (familyKey !== currentFamilyKey && (currentState.variantFilter || currentState.rarityFilter)) {
                targetVariant = family?.variants.find(v => 
                    (!currentState.variantFilter || currentState.variantFilter === "all" || v.variant === currentState.variantFilter) &&
                    (!currentState.rarityFilter || currentState.rarityFilter === "all" || v.rarity === currentState.rarityFilter)
                );
            }

            if (targetVariant) {
                view = { kind: "detail", familyKey, variantId: targetVariant.id, state: currentState };
                response = await this.generateDetailResponse(family!, targetVariant, responseOwnerId, i.user, displayName, undefined, currentState, telemetryOrigin);
            } else {
                view = { kind: "family", familyKey, state: currentState };
                response = await this.generateFamilyResponse(familyKey, responseOwnerId, i.user, displayName, undefined, currentState, telemetryOrigin);
            }
        } else if (rawId.startsWith("fn_sprites_variant_")) {
            const id = parseInt(rawId.replace("fn_sprites_variant_", ""), 10);
            const fallbackVariant = this.findVariant(id);
            const sourceFamily = currentFamilyKey ? this.findFamily(currentFamilyKey) : fallbackVariant?.family;
            const family = sourceFamily ? this.filterFamilyBySeason(sourceFamily, currentState.seasonFilter || "current") : undefined;
            const variant = family?.variants.find(candidate => candidate.id === id) || (fallbackVariant?.family.key === family?.key ? fallbackVariant.variant : undefined);
            if (!family || !variant) {
                if (isOriginalUser) return i.followUp({ content: "Sprite variant not found.", ephemeral: true });
                return i.editReply({ content: "Sprite variant not found.", components: [] });
            }
            view = { kind: "detail", familyKey: family.key, variantId: variant.id, state: currentState };
            response = await this.generateDetailResponse(family, variant, responseOwnerId, i.user, displayName, undefined, currentState, telemetryOrigin);
        } else if (rawId === "fn_sprites_quick_rarest") {
            const filteredFamilies = this.getFilteredFamilies(currentState);
            const filteredVariants = filteredFamilies.flatMap(family => family.variants);
            const variant = this.findRarestVariant(filteredVariants);
            const family = variant ? filteredFamilies.find(candidate => candidate.variants.includes(variant)) : undefined;
            if (family && variant) {
                view = { kind: "detail", familyKey: family.key, variantId: variant.id, state: currentState };
                response = await this.generateDetailResponse(family, variant, responseOwnerId, i.user, displayName, undefined, currentState, telemetryOrigin);
            }
        } else if (rawId === "fn_sprites_quick_cost") {
            const filteredFamilies = this.getFilteredFamilies(currentState);
            const variant = filteredFamilies.flatMap(family => family.variants).sort((a, b) => b.summonCost - a.summonCost)[0];
            const family = variant ? filteredFamilies.find(candidate => candidate.variants.includes(variant)) : undefined;
            if (family && variant) {
                view = { kind: "detail", familyKey: family.key, variantId: variant.id, state: currentState };
                response = await this.generateDetailResponse(family, variant, responseOwnerId, i.user, displayName, undefined, currentState, telemetryOrigin);
            }
        } else if (rawId === "fn_sprites_quick_random") {
            const filteredFamilies = this.getFilteredFamilies(currentState);
            const variants = filteredFamilies.flatMap(family => family.variants);
            const variant = variants[Math.floor(Math.random() * variants.length)];
            const family = variant ? filteredFamilies.find(candidate => candidate.variants.includes(variant)) : undefined;
            if (family && variant) {
                view = { kind: "detail", familyKey: family.key, variantId: variant.id, state: currentState };
                response = await this.generateDetailResponse(family, variant, responseOwnerId, i.user, displayName, undefined, currentState, telemetryOrigin);
            }
        }

        if (!response) {
            if (isOriginalUser) return i.followUp({ content: "That sprite control is no longer available.", ephemeral: true });
            return i.editReply({ content: "That sprite control is no longer available.", components: [] });
        }

        if (!isOriginalUser) {
            const message = await i.editReply(response) as Message;
            if (view) {
                this.rememberSpriteMessage(message, responseOwnerId, author, view, null, responseDataFingerprint);
            }
            this.maybeQueueRuntimeRefresh(telemetryOrigin, "interaction");
            return message;
        }

        if (!this.isLatestInteraction(i.message.id, interactionSequence)) return i.message as Message;
        const trackedState = view
            ? this.beginTrackedMessageTransition({ id: i.message.id, channelId: i.channelId }, responseOwnerId, author, view, null, responseDataFingerprint)
            : null;
        let message: Message | null = null;
        await this.queueMessageEdit(i.message.id, async () => {
            const latestState = trackedState ? this.trackedSpriteMessages.get(i.message.id) : null;
            if (!this.isLatestInteraction(i.message.id, interactionSequence)) return;
            if (trackedState && (!latestState || latestState.editToken !== trackedState.editToken || latestState.viewVersion !== trackedState.viewVersion)) return;
            message = await i.editReply({ ...response, attachments: [] } as any) as Message;
        });
        if (!message) {
            return i.message as Message;
        }
        if (view) {
            const latestState = this.trackedSpriteMessages.get(message.id);
            if (!latestState || (trackedState && latestState.editToken !== trackedState.editToken)) {
                return message;
            }
            this.trackedSpriteMessages.set(message.id, {
                ...latestState,
                channelId: message.channelId,
                updatedAt: Date.now()
            });
        }
        this.maybeQueueRuntimeRefresh(telemetryOrigin, "interaction");
        return message;
    }
}
