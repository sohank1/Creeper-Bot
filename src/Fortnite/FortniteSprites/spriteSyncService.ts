import {
    applySpriteHistory,
    spriteDataContentFingerprint,
    SpriteDataFile,
    SpriteHistoryFile,
    stableSpriteDataJson,
    updateSpriteHistory,
    validateSpriteData
} from "./spriteDataSource";
import type { FortniteSeasonContext } from "./fortniteSeason";

export type SpriteSyncArchiveArgs = {
    previousData: SpriteDataFile;
    previousJson: string;
    previousDataFingerprint: string;
    nextSeason: FortniteSeasonContext;
};

export type SpriteSyncOptions = {
    existingData: SpriteDataFile | null;
    existingJson: string;
    history: SpriteHistoryFile;
    legacySeasonContext?: FortniteSeasonContext;
    fetchLatest: () => Promise<SpriteDataFile>;
    archivePrevious?: (args: SpriteSyncArchiveArgs) => Promise<void>;
    /** Called before the new catalog is installed when a season rolls over. */
    backupHistory?: (history: SpriteHistoryFile) => Promise<void>;
    persistData: (json: string) => Promise<void> | void;
    persistHistory: (history: SpriteHistoryFile) => Promise<void> | void;
    existingDataFingerprint?: string;
};

export type SpriteSyncResult = {
    data: SpriteDataFile;
    history: SpriteHistoryFile;
    latestJson: string;
    changed: boolean;
    syncedAt: string;
};

function withoutFetchedAt(json: string): string {
    return json.replace(/"fetchedAt":\s*"[^"]+"/, '"fetchedAt": ""');
}

/**
 * Shared fetch/rollover/install workflow used by the production runtime and
 * the scheduled CLI job. Archive work is deliberately completed before either
 * history or current data is replaced.
 */
export async function syncSpriteCatalog(options: SpriteSyncOptions): Promise<SpriteSyncResult> {
    const latest = await options.fetchLatest();
    if (!latest.seasonContext?.id) {
        throw new Error("Fetched Fortnite sprite data has no season context.");
    }

    const nextHistory = updateSpriteHistory(options.history, latest);
    const enrichedLatest = applySpriteHistory(latest, nextHistory);
    validateSpriteData(enrichedLatest);
    const latestJson = stableSpriteDataJson(enrichedLatest);
    const existingJson = options.existingJson || "";
    const previousData = options.existingData && !options.existingData.seasonContext && options.legacySeasonContext
        ? { ...options.existingData, seasonContext: options.legacySeasonContext }
        : options.existingData;
    const previousSeasonId = previousData?.seasonContext?.id;
    const previousDataFingerprint = options.existingDataFingerprint
        || (previousData ? spriteDataContentFingerprint(previousData) : "");

    const seasonChanged = previousData
        && previousJsonIsUsable(existingJson)
        && previousSeasonId
        && latest.seasonContext.id !== previousSeasonId;
    if (seasonChanged) {
        if (!options.archivePrevious) {
            throw new Error("A sprite season changed but no archive handler was provided.");
        }
        await options.archivePrevious({
            previousData,
            previousJson: existingJson,
            previousDataFingerprint,
            nextSeason: latest.seasonContext
        });
        if (options.backupHistory) await options.backupHistory(nextHistory);
    }

    const changed = withoutFetchedAt(latestJson) !== withoutFetchedAt(existingJson);
    if (changed) await options.persistData(latestJson);
    await options.persistHistory(nextHistory);

    return {
        data: enrichedLatest,
        history: nextHistory,
        latestJson,
        changed,
        syncedAt: new Date().toISOString()
    };
}

function previousJsonIsUsable(json: string): boolean {
    return json.trim().length > 0;
}
