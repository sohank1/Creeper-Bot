import axios from "axios";
import cheerio from "cheerio";
import https from "https";

export type SpriteRarity = "rare" | "epic" | "legendary" | "mythic" | "special";
export type SpriteVariantName = string;

export type SpriteVariant = {
    id: number;
    name: string;
    rarity: SpriteRarity;
    chancePercent: number;
    chanceLabel: string;
    starter: boolean;
    variant: SpriteVariantName;
    summonCost: number;
    imageUrl: string;
    effectText: string;
    specialEffectText?: string;
    detailStatus: "complete" | "partial";
};

export type SpriteFamily = {
    key: string;
    displayName: string;
    effectSummary: string;
    levelScaling: string;
    location: string;
    variants: SpriteVariant[];
};

export type SpriteDataFile = {
    fetchedAt: string;
    totalSprites: number;
    totalLevels: number;
    families: SpriteFamily[];
};

type SpriteListItem = {
    id: number;
    name: string;
    rarity: SpriteRarity;
    chancePercent: number;
    chanceLabel: string;
    starter: boolean;
    sourceUrl: string;
    imageUrl: string;
};

const SOURCE_URL = "https://fortnite.gg/sprites";
const BASE_URL = "https://fortnite.gg";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function requestHeaders() {
    return {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    };
}

function absoluteUrl(url: string | undefined): string {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    return `${BASE_URL}${url}`;
}

function normalizeImageUrl(url: string): string {
    return url.replace(/\.webp(\?.*)?$/i, ".png$1");
}

function normalizeText(value: string | undefined): string {
    return (value || "").replace(/\s+/g, " ").trim();
}

function parsePercent(value: string): number {
    const parsed = parseFloat(value.replace("%", "").replace(",", "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumber(value: string): number {
    const parsed = parseInt(value.replace(/,/g, "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(parsed) ? parsed : 0;
}

function toVariantBase(item: SpriteListItem) {
    return {
        id: item.id,
        name: item.name,
        rarity: item.rarity,
        chancePercent: item.chancePercent,
        chanceLabel: item.chanceLabel,
        starter: item.starter,
        imageUrl: item.imageUrl
    };
}

function inferFamilyName(name: string, variant: string, relatedNames: string[]): string {
    if (variant === "Base") return name;
    if (relatedNames.length > 0) {
        return [...relatedNames].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
    }
    return name;
}

function familyKey(displayName: string): string {
    return displayName
        .replace(/\s+Sprite$/i, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

function parseListPage(html: string): { items: SpriteListItem[]; totalSprites: number; totalLevels: number } {
    const $ = cheerio.load(html);
    const items: SpriteListItem[] = [];

    $(".sprite-card").each((_, el) => {
        const card = $(el);
        const id = parseInt(card.attr("data-sprite") || "", 10);
        const nameLink = card.find(".sprite-name").first();
        const name = normalizeText(nameLink.text());
        const sourceUrl = absoluteUrl(nameLink.attr("href") || card.find(".sprite-art").attr("href"));
        const imageUrl = normalizeImageUrl(absoluteUrl(card.find(".sprite-art img").first().attr("src")));
        const pills = card.find(".sprite-pill").map((__, pill) => normalizeText($(pill).text())).get();
        const rarity = (pills.find(p => ["rare", "epic", "legendary", "mythic", "special"].includes(p.toLowerCase())) || "rare").toLowerCase() as SpriteRarity;
        const chanceLabel = pills.find(p => p.includes("%")) || "0%";
        const starter = pills.some(p => p.toLowerCase() === "starter");

        if (!id || !name || !sourceUrl) return;

        items.push({
            id,
            name,
            rarity,
            chancePercent: parsePercent(chanceLabel),
            chanceLabel,
            starter,
            sourceUrl,
            imageUrl
        });
    });

    const statValues = $(".sprites-stat").map((_, el) => {
        const current = normalizeText($(el).find("b").first().text());
        const max = normalizeText($(el).find(".grey").first().text()).replace("/", "").trim();
        return { current, max };
    }).get();

    return {
        items: items.sort((a, b) => a.id - b.id),
        totalSprites: parseNumber(statValues[0]?.max) || items.length,
        totalLevels: parseNumber(statValues[1]?.max) || items.length * 5
    };
}

async function fetchHtml(url: string): Promise<string> {
    const res = await axios.get(url, {
        headers: requestHeaders(),
        httpsAgent,
        timeout: 30000
    });

    if (typeof res.data !== "string" || !res.data.includes("sprite")) {
        throw new Error(`Unexpected response while fetching ${url}`);
    }

    return res.data;
}

async function fetchDetail(item: SpriteListItem): Promise<SpriteVariant & { familyName: string; location: string; levelScaling: string }> {
    try {
        const html = await fetchHtml(item.sourceUrl);
        const $ = cheerio.load(html);
        const panel = $(".sprite-detail-panel").first();
        const descriptions = panel.find(".sprite-desc").map((_, el) => normalizeText($(el).text())).get();
        const specialEffectText = normalizeText(panel.find(".sprite-desc-special").first().text()) || undefined;
        const facts: Record<string, string> = {};

        panel.find(".sprite-fact").each((_, el) => {
            const key = normalizeText($(el).find("span").first().text());
            const value = normalizeText($(el).find("b").first().text());
            if (key) facts[key] = value;
        });

        const relatedNames = $(".sprite-related .sprite-name").map((_, el) => normalizeText($(el).text())).get();
        const variant = normalizeText(facts["Variant"]) || "Base";
        const chanceLabel = facts["Chance"] || item.chanceLabel;
        const summonCost = parseNumber(facts["Summon Cost"]);

        return {
            ...toVariantBase(item),
            chanceLabel,
            chancePercent: parsePercent(chanceLabel),
            variant,
            summonCost,
            effectText: descriptions[0] || "",
            specialEffectText,
            levelScaling: descriptions[1] || "",
            location: facts["Location"] || "",
            familyName: inferFamilyName(item.name, variant, relatedNames),
            detailStatus: "complete"
        };
    } catch (e: any) {
        return {
            ...toVariantBase(item),
            variant: "Base",
            summonCost: 0,
            effectText: "",
            levelScaling: "",
            location: "",
            familyName: item.name,
            detailStatus: "partial"
        };
    }
}

function buildFamilies(variants: (SpriteVariant & { familyName: string; location: string; levelScaling: string })[]): SpriteFamily[] {
    const groups = new Map<string, (SpriteVariant & { familyName: string; location: string; levelScaling: string })[]>();

    for (const variant of variants) {
        const key = familyKey(variant.familyName);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(variant);
    }

    return Array.from(groups.entries()).map(([key, familyVariants]) => {
        familyVariants.sort((a, b) => {
            if (a.variant === "Base" && b.variant !== "Base") return -1;
            if (a.variant !== "Base" && b.variant === "Base") return 1;
            return a.variant.localeCompare(b.variant) || a.id - b.id;
        });
        const base = familyVariants.find(v => v.variant === "Base") || familyVariants[0];

        return {
            key,
            displayName: base.familyName,
            effectSummary: base.effectText || familyVariants.find(v => v.effectText)?.effectText || "No effect description available.",
            levelScaling: base.levelScaling || familyVariants.find(v => v.levelScaling)?.levelScaling || "No level scaling available.",
            location: base.location || familyVariants.find(v => v.location)?.location || "Unknown",
            variants: familyVariants.map(({ familyName, location, levelScaling, ...variant }) => variant)
        };
    }).sort((a, b) => a.variants[0].id - b.variants[0].id);
}

export function validateSpriteData(data: SpriteDataFile) {
    const variants = data.families.flatMap(f => f.variants);
    const ids = new Set<number>();

    if (variants.length === 0) throw new Error("No sprites were parsed.");
    if (data.totalSprites && variants.length !== data.totalSprites) {
        throw new Error(`Expected ${data.totalSprites} sprites, parsed ${variants.length}.`);
    }

    for (const family of data.families) {
        if (!family.key || !family.displayName || family.variants.length === 0) {
            throw new Error(`Invalid family entry: ${JSON.stringify(family)}`);
        }
    }

    for (const variant of variants) {
        if (ids.has(variant.id)) throw new Error(`Duplicate sprite id ${variant.id}.`);
        ids.add(variant.id);
        if (!variant.name || !variant.rarity || !variant.variant || !variant.imageUrl) {
            throw new Error(`Invalid sprite variant ${variant.id}.`);
        }
    }
}

export async function fetchSpriteData(delayMs = 150): Promise<SpriteDataFile> {
    const listHtml = await fetchHtml(SOURCE_URL);
    const list = parseListPage(listHtml);
    const details: (SpriteVariant & { familyName: string; location: string; levelScaling: string })[] = [];

    if (list.items.length === 0) {
        throw new Error("No sprite cards were found on the remote sprite page.");
    }

    for (const item of list.items) {
        details.push(await fetchDetail(item));
        if (delayMs > 0) await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    const data: SpriteDataFile = {
        fetchedAt: new Date().toISOString(),
        totalSprites: list.totalSprites,
        totalLevels: list.totalLevels,
        families: buildFamilies(details)
    };

    validateSpriteData(data);
    return data;
}

export function stableSpriteDataJson(data: SpriteDataFile): string {
    return JSON.stringify(data, null, 2) + "\n";
}
