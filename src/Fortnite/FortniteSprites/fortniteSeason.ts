import axios from "axios";
import cheerio from "cheerio";

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

export type FortniteGgHtmlFallback = (url: string) => Promise<string>;
export type FortniteGgHtmlValidator = (html: string) => boolean;

const FORTNITE_GG_COUNTDOWN_URL = "https://fortnite.gg/season-countdown";
const FORTNITE_GG_SPRITES_URL = "https://fortnite.gg/sprites";
const CACHE_TTL_MS = 15 * 60 * 1000;
const requestHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};
let cachedContext: FortniteSeasonContext | null = null;
let cachedAt = 0;

function isCloudflareChallenge(error: any): boolean {
    const response = error?.response;
    const mitigation = String(response?.headers?.["cf-mitigated"] || response?.headers?.["CF-Mitigated"] || "").toLowerCase();
    const body = String(response?.data || "").toLowerCase();
    return response?.status === 403
        || mitigation === "challenge"
        || /cf-chl-|just a moment|verify you are human|challenge-platform/.test(body);
}

function isHtml(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

/**
 * Fetch Fortnite.GG HTML through Axios first, then let the runtime provide a
 * browser fallback when Cloudflare requires JavaScript to clear its challenge.
 * Keeping this here gives season detection and the sprite detail scraper the
 * same source/fallback behavior.
 */
export async function fetchFortniteGgHtml(
    url: string,
    browserFallback?: FortniteGgHtmlFallback,
    timeoutMs = 15_000,
    validator: FortniteGgHtmlValidator = isHtml
): Promise<string> {
    try {
        const response = await axios.get(url, { timeout: timeoutMs, headers: requestHeaders });
        if (!isHtml(response.data) || !validator(response.data)) {
            const error: any = new Error(`Unexpected response while fetching ${url}`);
            error.response = response;
            throw error;
        }
        return response.data;
    } catch (error) {
        if (!browserFallback || !isCloudflareChallenge(error)) throw error;

        const browserHtml = await browserFallback(url);
        if (!isHtml(browserHtml) || !validator(browserHtml)) {
            throw new Error(`Browser fallback returned an unexpected response while fetching ${url}`);
        }
        return browserHtml;
    }
}

function seasonId(chapter: number, season: string) {
    return `chapter-${chapter}-season-${season.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

export function parseSeasonLabel(value: unknown): { chapter: number; season: string } | null {
    const match = String(value || "").match(/(?:Chapter|C)\s*([0-9]+)\s*[,:-]?\s*(?:Season|S)\s*([A-Za-z0-9-]+)/i);
    if (!match) return null;
    return { chapter: Number(match[1]), season: match[2] };
}

function normalizeSeason(value: string) {
    return value.replace(/^S/i, "").trim().toLowerCase();
}

export type FortniteGgCountdownData = {
    chapter: number;
    season: string;
    displayName: string;
    endsAt?: string;
};

export function parseFortniteGgCountdownHtml(countdownHtml: string): FortniteGgCountdownData {
    const title = countdownHtml.match(/<title>[^<]*?(Chapter\s*\d+\s*Season\s*[A-Za-z0-9-]+)/i)?.[1];
    const parsed = parseSeasonLabel(title);
    if (!parsed) throw new Error("fortnite.gg season countdown had no current season title.");

    const $ = cheerio.load(countdownHtml);
    const target = $("#big-countdown").first().attr("data-target")
        || countdownHtml.match(/id=['"]big-countdown['"][^>]*data-target=['"](\d+)['"]/i)?.[1];
    const targetNumber = target ? Number(target) : NaN;
    const timestamp = Number.isFinite(targetNumber) && targetNumber > 0
        ? targetNumber < 1_000_000_000_000 ? targetNumber * 1000 : targetNumber
        : NaN;
    const targetDate = Number.isFinite(timestamp) ? new Date(timestamp) : null;
    const endsAt = targetDate && Number.isFinite(targetDate.getTime()) ? targetDate.toISOString() : undefined;
    return {
        chapter: parsed.chapter,
        season: parsed.season,
        displayName: `Chapter ${parsed.chapter} Season ${parsed.season}`,
        ...(endsAt ? { endsAt } : {})
    };
}

export function parseFortniteGgSeasonFilter(
    spritesHtml: string,
    currentSeason: { chapter: number; season: string },
    fallbackContext?: FortniteSeasonContext
): { seasonKey: string; chapter: number; season: string } | undefined {
    const $ = cheerio.load(spritesHtml);
    let selectedOption: { seasonKey: string; chapter: number; season: string } | undefined;
    $(".filter-season [data-key='season'], .filter-season [data-season], .filter-season option, .filter-select-btn[data-key='season'], [data-filter='season'][data-val]").each((_, element) => {
        const optionLabel = parseSeasonLabel($(element).text());
        const chapter = Number($(element).attr("data-chapter")) || optionLabel?.chapter || currentSeason.chapter;
        const seasonKey = String(
            $(element).attr("data-val")
            || $(element).attr("data-value")
            || $(element).attr("value")
            || $(element).attr("data-season")
            || ""
        ).trim();
        const season = optionLabel?.season || normalizeSeason($(element).text());
        if (!selectedOption && seasonKey && chapter === currentSeason.chapter && normalizeSeason(season) === normalizeSeason(currentSeason.season)) {
            selectedOption = { seasonKey, chapter, season };
        }
    });
    if (!selectedOption && fallbackContext?.seasonKey && fallbackContext.id === seasonId(currentSeason.chapter, currentSeason.season)) {
        selectedOption = {
            seasonKey: fallbackContext.seasonKey,
            chapter: currentSeason.chapter,
            season: currentSeason.season
        };
    }
    return selectedOption;
}

async function fetchFortniteGgSeason(
    fallbackContext?: FortniteSeasonContext,
    browserFallback?: FortniteGgHtmlFallback
): Promise<SeasonCandidate> {
    const [countdownHtml, spritesHtml] = await Promise.all([
        fetchFortniteGgHtml(FORTNITE_GG_COUNTDOWN_URL, browserFallback),
        fetchFortniteGgHtml(FORTNITE_GG_SPRITES_URL, browserFallback)
    ]);
    const parsed = parseFortniteGgCountdownHtml(countdownHtml);
    // This is the same season key the fortnite.gg client uses when its Season
    // filter hides every card whose data-season differs from the selection.
    const selectedOption = parseFortniteGgSeasonFilter(spritesHtml, parsed, fallbackContext);
    if (!selectedOption) {
        throw new Error(`fortnite.gg sprite Season filter had no key for ${parsed.chapter}/${parsed.season}.`);
    }
    const candidate: SeasonCandidate = {
        id: seasonId(parsed.chapter, parsed.season),
        chapter: parsed.chapter,
        season: parsed.season,
        displayName: `Chapter ${parsed.chapter} Season ${parsed.season}`,
        seasonKey: selectedOption.seasonKey,
        ...(parsed.endsAt ? { endsAt: parsed.endsAt } : {}),
        source: "fortnite-gg"
    };
    return candidate;
}

export async function resolveCurrentFortniteSeason(
    forceRefresh = false,
    fallbackContext?: FortniteSeasonContext,
    browserFallback?: FortniteGgHtmlFallback
): Promise<FortniteSeasonContext> {
    if (!forceRefresh && cachedContext && Date.now() - cachedAt < CACHE_TTL_MS) return cachedContext;

    // fortnite.gg is intentionally authoritative here: its Season filter is
    // the same source used to decide which cards belong to the current sprite
    // dataset. We fail closed if either the current title or filter key cannot
    // be read instead of guessing from an unrelated provider.
    const candidate = await fetchFortniteGgSeason(fallbackContext, browserFallback);
    const context: FortniteSeasonContext = {
        ...candidate,
        validatedBy: ["fortnite-gg"]
    };
    cachedContext = context;
    cachedAt = Date.now();
    return context;
}
