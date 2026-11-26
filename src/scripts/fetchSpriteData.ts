import "dotenv/config";
import { randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fetchSpriteData, mergeSpriteHistories, sanitizeSpriteHistory, SpriteDataFile, SpriteHistoryFile, updateSpriteHistory, validateSpriteData } from "../Fortnite/FortniteSprites/spriteDataSource";
import { archiveSpriteSnapshot, fetchSpriteArchiveAsset } from "../Fortnite/FortniteSprites/spriteArchive";
import { backupSpriteArchive, backupSpriteHistory, getSpriteArchiveBackupDirectory } from "../Fortnite/FortniteSprites/spriteArchiveBackup";
import { SPRITE_STORAGE_NAMESPACE } from "../Fortnite/FortniteSprites/spriteStorage";
import type { FortniteSeasonContext } from "../Fortnite/FortniteSprites/fortniteSeason";
import { syncSpriteCatalog } from "../Fortnite/FortniteSprites/spriteSyncService";

const productionLinux = process.platform === "linux" && process.env.NODE_ENV === "production";
const automaticArchiveEnabled = process.platform === "linux"
    && (productionLinux || Boolean(process.env.FORTNITE_SPRITE_ARCHIVE_DIR));
const SPRITE_CACHE_ROOT = path.join(process.cwd(), ".cache", "fortnite-sprites", SPRITE_STORAGE_NAMESPACE);
const DATA_PATH = path.resolve(process.env.FORTNITE_SPRITE_DATA_PATH || (
    productionLinux
        ? path.join(SPRITE_CACHE_ROOT, "spriteData.json")
        : path.join(process.cwd(), "src", "Fortnite", "FortniteSprites", "spriteData.json")
));
const LEGACY_SEASON_ID = process.env.FORTNITE_SPRITE_LEGACY_SEASON_ID || "chapter-7-season-3";
const ARCHIVE_ROOT = process.env.FORTNITE_SPRITE_ARCHIVE_DIR
    ? path.resolve(process.env.FORTNITE_SPRITE_ARCHIVE_DIR)
    : path.join(SPRITE_CACHE_ROOT, "archives");
const BUNDLED_ARCHIVE_ROOT = path.join(process.cwd(), "sprite-archives");
const BACKUP_ARCHIVE_ROOT = getSpriteArchiveBackupDirectory();
const ARCHIVE_CANONICAL_ROOTS = Array.from(new Set([ARCHIVE_ROOT, BUNDLED_ARCHIVE_ROOT]));
const ARCHIVE_ROOTS = Array.from(new Set([
    ...ARCHIVE_CANONICAL_ROOTS,
    ...(BACKUP_ARCHIVE_ROOT ? [BACKUP_ARCHIVE_ROOT] : [])
]));
const HISTORY_PATH = process.env.FORTNITE_SPRITE_HISTORY_PATH
    ? path.resolve(process.env.FORTNITE_SPRITE_HISTORY_PATH)
    : path.join(ARCHIVE_ROOT, "spriteHistory.json");
const HISTORY_READ_PATHS = Array.from(new Set([
    path.join(BUNDLED_ARCHIVE_ROOT, "spriteHistory.json"),
    HISTORY_PATH,
    ...(BACKUP_ARCHIVE_ROOT ? [path.join(BACKUP_ARCHIVE_ROOT, "spriteHistory.json")] : [])
]));

function legacySeasonContext(): FortniteSeasonContext {
    const match = LEGACY_SEASON_ID.match(/^chapter-(\d+)-season-(.+)$/i);
    const chapter = Number(match?.[1] || 7);
    const season = match?.[2] || "3";
    return {
        id: LEGACY_SEASON_ID,
        chapter,
        season,
        displayName: `Chapter ${chapter} Season ${season}`,
        source: "fortnite-gg",
        validatedBy: ["fortnite-gg"]
    };
}

function archivedSeasonContext(manifest: any, seasonId: string): FortniteSeasonContext {
    const chapter = Number(manifest?.season?.chapter) || Number(manifestChapter(seasonId)) || 7;
    const season = String(manifest?.season?.season || manifestSeason(seasonId));
    return {
        id: seasonId,
        chapter,
        season,
        displayName: String(manifest?.season?.displayName || seasonId.replace(/-/g, " ")),
        source: "fortnite-gg",
        validatedBy: ["fortnite-gg"]
    };
}

function readLargestArchivedCatalog(archiveDirectory: string, manifest: any): SpriteDataFile | null {
    const dataFiles = Array.from(new Set([
        String(manifest?.source?.dataFile || ""),
        String(manifest?.source?.botDataFile || ""),
        String(manifest?.localDataFile || ""),
        "spriteData.json",
        "spriteData.bot.json",
        "spriteData.live.json"
    ].filter(Boolean)));
    const archiveRoot = path.resolve(archiveDirectory);
    const candidates: SpriteDataFile[] = [];
    for (const dataFile of dataFiles) {
        const dataPath = path.resolve(archiveRoot, dataFile);
        if (!dataPath.startsWith(`${archiveRoot}${path.sep}`) || !fs.existsSync(dataPath)) continue;
        try {
            const candidate = JSON.parse(fs.readFileSync(dataPath, "utf8")) as SpriteDataFile;
            validateSpriteData(candidate);
            candidates.push(candidate);
        } catch {
            // An incomplete/non-catalog candidate is recoverable through the
            // next file in the archive.
        }
    }
    return candidates.sort((left, right) => {
        const leftCount = left.families.reduce((total, family) => total + family.variants.length, 0);
        const rightCount = right.families.reduce((total, family) => total + family.variants.length, 0);
        return rightCount - leftCount;
    })[0] || null;
}

function loadHistory(existingData: any): SpriteHistoryFile {
    const legacySeason = legacySeasonContext();
    const archivedSnapshots: Array<{ data: SpriteDataFile; seasonId: string }> = [];
    const trustedSeasonIds = new Set<string>([legacySeason.id, existingData?.seasonContext?.id].filter(Boolean));
    for (const archiveRoot of ARCHIVE_ROOTS) {
        if (!fs.existsSync(archiveRoot)) continue;
        for (const entry of fs.readdirSync(archiveRoot, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            try {
                const archiveDirectory = path.resolve(archiveRoot, entry.name);
                const manifest = JSON.parse(fs.readFileSync(path.join(archiveDirectory, "manifest.json"), "utf8"));
                const seasonId = manifest?.season?.id;
                if (!seasonId) continue;
                const catalog = readLargestArchivedCatalog(archiveDirectory, manifest);
                if (!catalog?.fetchedAt) continue;
                const data = {
                    ...catalog,
                    // The manifest is the archive identity. Do not let a
                    // legacy source file with no/stale season context label
                    // recovered history under the wrong season.
                    seasonContext: archivedSeasonContext(manifest, seasonId)
                };
                trustedSeasonIds.add(seasonId);
                archivedSnapshots.push({ data, seasonId });
            } catch {
                // An incomplete archive should not prevent a fresh scrape.
            }
        }
    }

    const withArchivedHistory = (history: SpriteHistoryFile) => archivedSnapshots
        .sort((a, b) => String(a.data.fetchedAt).localeCompare(String(b.data.fetchedAt)))
        .reduce((current, snapshot) => updateSpriteHistory(current, {
            ...snapshot.data,
            seasonContext: snapshot.data.seasonContext || {
                id: snapshot.seasonId,
                chapter: Number(manifestChapter(snapshot.seasonId)),
                season: manifestSeason(snapshot.seasonId),
                displayName: snapshot.seasonId.replace(/-/g, " "),
                source: "fortnite-gg",
                validatedBy: ["fortnite-gg"]
            }
        }), history);

    let persistedHistory: SpriteHistoryFile | null = null;
    for (const historyPath of HISTORY_READ_PATHS) {
        if (!fs.existsSync(historyPath)) continue;
        try {
            const parsed = JSON.parse(fs.readFileSync(historyPath, "utf8")) as SpriteHistoryFile;
            if (parsed.schemaVersion === 1 && Array.isArray(parsed.records)) {
                persistedHistory = persistedHistory
                    ? mergeSpriteHistories(persistedHistory, parsed)
                    : parsed;
            }
        } catch {
            console.warn(`Could not parse existing sprite history at ${historyPath}; trying another copy.`);
        }
    }
    if (persistedHistory) return sanitizeSpriteHistory(withArchivedHistory(persistedHistory), trustedSeasonIds);

    const legacyContext = existingData?.seasonContext || legacySeason;
    const seeded: SpriteHistoryFile = existingData
        ? updateSpriteHistory({ schemaVersion: 1, records: [] }, { ...existingData, seasonContext: legacyContext })
        : { schemaVersion: 1, records: [] };
    return sanitizeSpriteHistory(withArchivedHistory(seeded), trustedSeasonIds);
}

function manifestChapter(seasonId: string) {
    return seasonId.match(/^chapter-(\d+)-season-/i)?.[1] || "0";
}

function manifestSeason(seasonId: string) {
    return seasonId.match(/^chapter-\d+-season-(.+)$/i)?.[1] || "unknown";
}

async function fetchAndWriteSpriteData() {
    try {
        console.log("Fetching Fortnite sprite data...");
        const existingJson = fs.existsSync(DATA_PATH) ? fs.readFileSync(DATA_PATH, "utf8") : "";
        const existingData = existingJson ? JSON.parse(existingJson) : null;
        const history = loadHistory(existingData);
        const result = await syncSpriteCatalog({
            existingData,
            existingJson,
            history,
            legacySeasonContext: legacySeasonContext(),
            fetchLatest: () => fetchSpriteData(),
            archivePrevious: automaticArchiveEnabled
                ? ({ previousData, previousJson, nextSeason }) => archiveSpriteSnapshot({
                    archiveRoot: ARCHIVE_ROOT,
                    archiveRoots: ARCHIVE_CANONICAL_ROOTS,
                    previousData,
                    previousJson,
                    nextSeason,
                    assetConcurrency: 6,
                    assetResolver: fetchSpriteArchiveAsset,
                    backup: backupSpriteArchive
                }).then(archive => {
                    console.log(`[SpriteArchive] ${archive.created ? "Archived" : "Verified archive for"} ${archive.manifest.season.displayName}.`);
                })
                : async () => undefined,
            backupHistory: automaticArchiveEnabled ? nextHistory => backupSpriteHistory(nextHistory) : undefined,
            persistData: json => writeAtomically(DATA_PATH, json),
            persistHistory: nextHistory => writeAtomically(HISTORY_PATH, `${JSON.stringify(nextHistory, null, 2)}\n`)
        });
        validateSpriteData(result.data);

        console.log(`Successfully ${result.changed ? "updated" : "validated"} Fortnite sprite data at ${DATA_PATH}`);
    } catch (err: any) {
        console.error("Error fetching Fortnite sprite data:", err.message || err);
        if (err.response) {
            console.error("Response data:", err.response.data);
            console.error("Response status:", err.response.status);
        }
        process.exit(1);
    }
}

function writeAtomically(targetPath: string, contents: string): void {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tempPath = `${targetPath}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}`;
    fs.writeFileSync(tempPath, contents, "utf8");
    fs.renameSync(tempPath, targetPath);
}

fetchAndWriteSpriteData();
