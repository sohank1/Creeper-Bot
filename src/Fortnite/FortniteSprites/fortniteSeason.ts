import axios from "axios";
import cheerio from "cheerio";
import https from "https";

export type FortniteSeasonSource = "api-fortnite" | "fortniteapi-export" | "fortnite-gg" | "olitracker";

export type FortniteSeasonContext = {
    id: string;
    chapter: number;
    season: string;
    displayName: string;
    /** The numeric key used by fortnite.gg's Season filter (for example 42). */
    seasonKey?: string;
    startsAt?: string;
    endsAt?: string;
    source: FortniteSeasonSource;
    validatedBy: FortniteSeasonSource[];
};

type SeasonCandidate = Omit<FortniteSeasonContext, "validatedBy"> & { source: FortniteSeasonSource };

const FORTNITE_GG_COUNTDOWN_URL = "https://fortnite.gg/season-countdown";
const FORTNITE_GG_SPRITES_URL = "https://fortnite.gg/sprites";
const CACHE_TTL_MS = 15 * 60 * 1000;
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const requestHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};
let cachedContext: FortniteSeasonContext | null = null;
let cachedAt = 0;

function seasonId(chapter: number, season: string) {
    return `chapter-${chapter}-season-${season.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function parseSeasonLabel(value: unknown): { chapter: number; season: string } | null {
    const match = String(value || "").match(/(?:Chapter|C)\s*([0-9]+)\s*[,:-]?\s*(?:Season|S)\s*([A-Za-z0-9-]+)/i);
    if (!match) return null;
    return { chapter: Number(match[1]), season: match[2] };
}

function normalizeSeason(value: string) {
    return value.replace(/^S/i, "").trim().toLowerCase();
}

async function fetchFortniteGgSeason(fallbackContext?: FortniteSeasonContext): Promise<SeasonCandidate> {
    const [countdownResponse, spritesResponse] = await Promise.all([
        axios.get(FORTNITE_GG_COUNTDOWN_URL, { timeout: 15_000, httpsAgent, headers: requestHeaders }),
        axios.get(FORTNITE_GG_SPRITES_URL, { timeout: 15_000, httpsAgent, headers: requestHeaders })
    ]);
    const countdownHtml = String(countdownResponse.data);
    const spritesHtml = String(spritesResponse.data);
    const title = countdownHtml.match(/<title>[^<]*?(Chapter\s*\d+\s*Season\s*[A-Za-z0-9-]+)/i)?.[1];
    const parsed = parseSeasonLabel(title);
    if (!parsed) throw new Error("fortnite.gg season countdown had no current season title.");

    // This is the same season key the fortnite.gg client uses when its Season
    // filter hides every card whose data-season differs from the selection.
    const $ = cheerio.load(spritesHtml);
    let selectedOption: { seasonKey: string; chapter: number; season: string } | undefined;
    $(".filter-season [data-key='season'], .filter-season [data-season], .filter-season option, .filter-select-btn[data-key='season'], [data-filter='season'][data-val]").each((_, element) => {
        const optionLabel = parseSeasonLabel($(element).text());
        const chapter = Number($(element).attr("data-chapter")) || optionLabel?.chapter || parsed.chapter;
        const seasonKey = String(
            $(element).attr("data-val")
            || $(element).attr("data-value")
            || $(element).attr("value")
            || $(element).attr("data-season")
            || ""
        ).trim();
        const season = optionLabel?.season || normalizeSeason($(element).text());
        if (!selectedOption && seasonKey && chapter === parsed.chapter && normalizeSeason(season) === normalizeSeason(parsed.season)) {
            selectedOption = { seasonKey, chapter, season };
        }
    });
    if (!selectedOption && fallbackContext?.seasonKey && fallbackContext.id === seasonId(parsed.chapter, parsed.season)) {
        // A transient challenge page or markup change can hide the filter controls.
        // Reuse a key previously validated for this exact season only; never carry
        // a prior-season key into a newly detected season.
        selectedOption = {
            seasonKey: fallbackContext.seasonKey,
            chapter: parsed.chapter,
            season: parsed.season
        };
    }
    if (!selectedOption) {
        throw new Error(`fortnite.gg sprite Season filter had no key for ${parsed.chapter}/${parsed.season}.`);
    }

    const target = countdownHtml.match(/id=['"]big-countdown['"][^>]*data-target=['"](\d+)['"]/i)?.[1];
    const endsAt = target ? new Date(Number(target)).toISOString() : undefined;
    const candidate: SeasonCandidate = {
        id: seasonId(parsed.chapter, parsed.season),
        chapter: parsed.chapter,
        season: parsed.season,
        displayName: `Chapter ${parsed.chapter} Season ${parsed.season}`,
        seasonKey: selectedOption.seasonKey,
        ...(endsAt ? { endsAt } : {}),
        source: "fortnite-gg"
    };
    return candidate;
}

export async function resolveCurrentFortniteSeason(forceRefresh = false, fallbackContext?: FortniteSeasonContext): Promise<FortniteSeasonContext> {
    if (!forceRefresh && cachedContext && Date.now() - cachedAt < CACHE_TTL_MS) return cachedContext;

    // fortnite.gg is intentionally authoritative here: its Season filter is
    // the same source used to decide which cards belong to the current sprite
    // dataset. We fail closed if either the current title or filter key cannot
    // be read instead of guessing from an unrelated provider.
    const candidate = await fetchFortniteGgSeason(fallbackContext);
    const context: FortniteSeasonContext = {
        ...candidate,
        validatedBy: ["fortnite-gg"]
    };
    cachedContext = context;
    cachedAt = Date.now();
    return context;
}
