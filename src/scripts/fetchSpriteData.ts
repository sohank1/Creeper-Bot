import * as fs from "fs";
import * as path from "path";
import { applySpriteHistory, fetchSpriteData, sanitizeSpriteHistory, SpriteHistoryFile, stableSpriteDataJson, updateSpriteHistory, validateSpriteData } from "../Fortnite/FortniteSprites/spriteDataSource";

const DATA_PATH = path.join(process.cwd(), "src", "Fortnite", "FortniteSprites", "spriteData.json");
const HISTORY_PATH = process.env.FORTNITE_SPRITE_HISTORY_PATH
    ? path.resolve(process.env.FORTNITE_SPRITE_HISTORY_PATH)
    : path.join(process.env.FORTNITE_SPRITE_ARCHIVE_DIR ? path.resolve(process.env.FORTNITE_SPRITE_ARCHIVE_DIR) : path.join(process.cwd(), "sprite-archives"), "spriteHistory.json");

function loadHistory(existingData: any): SpriteHistoryFile {
    const legacySeasonId = process.env.FORTNITE_SPRITE_LEGACY_SEASON_ID || "chapter-7-season-3";
    const archiveRoot = process.env.FORTNITE_SPRITE_ARCHIVE_DIR
        ? path.resolve(process.env.FORTNITE_SPRITE_ARCHIVE_DIR)
        : path.join(process.cwd(), "sprite-archives");
    const archivedSnapshots: Array<{ data: any; seasonId: string }> = [];
    const trustedSeasonIds = new Set<string>([legacySeasonId, existingData?.seasonContext?.id].filter(Boolean));
    if (fs.existsSync(archiveRoot)) {
        for (const entry of fs.readdirSync(archiveRoot, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            try {
                const manifest = JSON.parse(fs.readFileSync(path.join(archiveRoot, entry.name, "manifest.json"), "utf8"));
                const seasonId = manifest?.season?.id;
                const dataFile = manifest?.source?.dataFile;
                if (!seasonId || !dataFile) continue;
                const archivePath = path.resolve(archiveRoot, entry.name, dataFile);
                if (!archivePath.startsWith(`${path.resolve(archiveRoot, entry.name)}${path.sep}`) || !fs.existsSync(archivePath)) continue;
                const data = JSON.parse(fs.readFileSync(archivePath, "utf8"));
                if (!data?.fetchedAt || !Array.isArray(data?.families)) continue;
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

    if (fs.existsSync(HISTORY_PATH)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8")) as SpriteHistoryFile;
            if (parsed.schemaVersion === 1 && Array.isArray(parsed.records)) return sanitizeSpriteHistory(withArchivedHistory(parsed), trustedSeasonIds);
        } catch {
            console.warn("Could not parse existing sprite history; rebuilding it from current bot data.");
        }
    }

    const legacyContext = existingData?.seasonContext || {
        id: legacySeasonId,
        chapter: 7,
        season: "3",
        displayName: "Chapter 7 Season 3",
        source: "fortnite-gg",
        validatedBy: ["fortnite-gg"]
    };
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
        const existingData = fs.existsSync(DATA_PATH) ? JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) : null;
        const history = loadHistory(existingData);
        const fetchedData = await fetchSpriteData();
        const nextHistory = updateSpriteHistory(history, fetchedData);
        const enrichedData = applySpriteHistory(fetchedData, nextHistory);
        validateSpriteData(enrichedData);

        const outputPath = DATA_PATH;
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, stableSpriteDataJson(enrichedData), "utf8");
        fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
        fs.writeFileSync(HISTORY_PATH, `${JSON.stringify(nextHistory, null, 2)}\n`, "utf8");

        console.log(`Successfully saved Fortnite sprite data to ${outputPath}`);
    } catch (err: any) {
        console.error("Error fetching Fortnite sprite data:", err.message || err);
        if (err.response) {
            console.error("Response data:", err.response.data);
            console.error("Response status:", err.response.status);
        }
        process.exit(1);
    }
}

fetchAndWriteSpriteData();
