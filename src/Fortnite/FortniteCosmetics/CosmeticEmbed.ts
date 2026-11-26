import { MessageEmbed } from "discord.js";
import { Cosmetic } from "./FortniteCosmetics.type";
import { rarityColorTable, rarityEmojisTable } from "./rarityEmojisTable";
import { cosmeticIntroduction, getCosmeticSeasonEmoji } from "./CosmeticIntroduction";

export type CatalogCosmetic = Cosmetic & {
    category?: string; artist?: string; album?: string; releaseYear?: number; duration?: number;
    price?: number; priceIsCurrent?: boolean; priceObservedAt?: string;
};
const categories: Record<string, [string, string]> = {
    tracks: ["track", "Jam Track"], instruments: ["instrument", "Instrument"], cars: ["car", "Vehicle Cosmetic"],
    legoKits: ["legokit", "LEGO Kit"], lego: ["lego", "LEGO Style"], beans: ["bean", "Fall Guys Style"],
};
const extraEmojis: Record<string, string> = {
    track: "🎵", instrument: "🎸", guitar: "🎸", bass: "🎸", drums: "🥁", microphone: "🎤", keyboard: "🎹",
    car: "🚗", body: "🚗", wheel: "🛞", wheels: "🛞", decal: "🎨", boost: "💨", trail: "✨",
    legokit: "🧱", legoprop: "🪑", legobuilding: "🏠", lego: "🧱", bean: "🫘", shoes: "👟", kicks: "👟",
};
export function cosmeticTypeEmoji(item: CatalogCosmetic): string {
    return extraEmojis[item.type?.value] || rarityEmojisTable[item.type?.value]
        || extraEmojis[categories[item.category]?.[0]] || "🎮";
}

// Keep original fields while supplying a consistent shape for every API category.
export function normalizeCosmetic(raw: any, category = "br", parent?: any): CatalogCosmetic {
    const fallback = categories[category] || [category, category === "br" ? "Cosmetic" : category];
    const images = raw.images || {};
    const shopPrice = Number.isFinite(raw._shopArtwork?.price) && raw._shopArtwork.price >= 0 ? raw._shopArtwork.price : undefined;
    const catalogPrice = Number.isFinite(raw.price) && raw.price >= 0 ? raw.price : undefined;
    const price = shopPrice !== undefined ? shopPrice : catalogPrice;
    return { ...raw, category,
        introduction: cosmeticIntroduction(raw.id, raw.introduction),
        price, priceIsCurrent: shopPrice !== undefined ? true : raw.priceIsCurrent === true,
        priceObservedAt: shopPrice !== undefined ? undefined : raw.priceObservedAt,
        name: raw.name && raw.name !== "null" && raw.name !== "Banner" ? raw.name : raw.title || parent?.name || raw.id,
        description: raw.description === "null" ? null : raw.description,
        type: raw.type?.value ? raw.type : { value: fallback[0], displayValue: fallback[1] },
        images: { ...images, icon: images.icon || images.large || images.small || raw.albumArt,
            featured: category === "tracks" ? raw.albumArt : images.featured || images.large || images.icon || images.small,
            smallIcon: images.smallIcon || images.small },
    } as CatalogCosmetic;
}

export function normalizeCosmeticCatalog(data: Record<string, any[]>): CatalogCosmetic[] {
    const parents = new Map((data.br || []).map(item => [item.id, item]));
    return Object.entries(data).flatMap(([category, items]) => Array.isArray(items)
        ? items.filter(item => typeof item.id === "string" && item.id.length > 0).map(item => normalizeCosmetic(item, category, parents.get(item.cosmeticId))) : []);
}

export interface CosmeticReturnContext {
    date: string; daysMissing: number; lastSeenLabel: string; previousAppearances?: number;
    price?: number; priceIsCurrent?: boolean; priceObservedAt?: string;
}

// Shared by cosmetic search and historical return selection; no second embed design.
export function buildCosmeticEmbed(cosmetic: CatalogCosmetic, context?: CosmeticReturnContext): MessageEmbed {
    cosmetic = { ...cosmetic, introduction: cosmeticIntroduction(cosmetic.id, cosmetic.introduction) };
    const e = new MessageEmbed().setTitle((cosmetic.name || cosmetic.id).slice(0, 256));
    const field = (name: string, value: unknown, inline = false) => {
        const room = Math.min(700, 5800 - e.length - name.length);
        if (room > 0 && e.fields.length < 25 && value !== undefined && value !== null && String(value).trim()) e.addField(name, String(value).slice(0, room), inline);
    };
    field("Description", cosmetic.description);
    const image = cosmetic.images?.featured || cosmetic.images?.icon || cosmetic.images?.smallIcon;
    if (image?.startsWith("https://")) e.setImage(image);
    field("Type", `${cosmeticTypeEmoji(cosmetic)} ${cosmetic.type?.displayValue || "Cosmetic"}`, true);
    field("Rarity", cosmetic.rarity?.displayValue, true);
    field("Set", cosmetic.set?.text);
    const intro = cosmetic.introduction;
    if (intro?.text) {
        const emoji = getCosmeticSeasonEmoji(Number(intro.chapter), String(intro.season));
        field("Introduction", emoji ? intro.text.replace(/(Season\s+[^.?!]+)([.?!]?)(\s*)$/, `$1 ${emoji}$2$3`) : intro.text);
    }
    const tags = (cosmetic.gameplayTags || []).join(" ");
    field("Features", [["Emote.Traversal", "Traversal"], ["BuiltIn", "Built In"], ["Cosmetics.UserFacingFlags.Synced", "Synced"], ["Reactive", "Reactive"]]
        .filter(([tag]) => tags.includes(tag)).map(([, label]) => label).join(", "));
    if (cosmetic.added && Number.isFinite(Date.parse(cosmetic.added))) field("Added to Files On", cosmetic.added.slice(0, 10), true);
    for (const [tag, free] of [["BattlePass.Free", true], ["BattlePass.Paid", false]] as const) {
        if (tags.includes(tag)) {
            const emoji = intro ? getCosmeticSeasonEmoji(Number(intro.chapter), String(intro.season)) : "";
            field("Battle Pass", `Obtained in the ${free ? "" : "paid "}${intro ? `Chapter ${intro.chapter}, Season ${intro.season}${emoji ? ` ${emoji}` : ""} ` : ""}Battle Pass${free ? " for free" : ""}.`);
        }
    }
    const color = cosmetic.series?.colors?.[cosmetic.series.value === "Frozen Series" ? 2 : 1]?.slice(0, 6)
        || rarityColorTable[cosmetic.rarity?.value] || "2186DB";
    e.setColor(/^([a-f\d]{6})$/i.test(color) ? `#${color}` : "#2186DB");
    field("Artist", cosmetic.artist, true);
    field("Album", cosmetic.album, true);
    field("Release year", cosmetic.releaseYear, true);
    if (Number.isFinite(cosmetic.duration) && cosmetic.duration > 0) field("Track length", `${Math.floor(cosmetic.duration / 60)}:${String(Math.floor(cosmetic.duration % 60)).padStart(2, "0")}`, true);
    if (context) {
        field("Return details", `Returned: **${context.date}**\nPrevious shop date: **${context.lastSeenLabel}**\nDays away: **${context.daysMissing.toLocaleString()}**${context.previousAppearances !== undefined ? `\nEarlier shop appearances: **${context.previousAppearances}**` : ""}`);
    } else if (cosmetic.shopHistory?.length) {
        const history = [...new Set(cosmetic.shopHistory.filter(value => Number.isFinite(new Date(value).getTime())).map(value => new Date(value).toISOString().slice(0, 10)))].sort().reverse();
        field("Recent Shop History", history.slice(0, 5).join("\n"));
        field("Occurrences", history.length);
    }
    const price = context ? context.price : cosmetic.price;
    const priceInfo = context || cosmetic;
    if (Number.isSafeInteger(price) && price >= 0) field(priceInfo.priceIsCurrent ? "Current shop price" : "Last known price",
        `${price.toLocaleString()} V-Bucks${priceInfo.priceObservedAt ? `\nObserved ${priceInfo.priceObservedAt} (UTC)` : ""}`, true);
    e.setFooter({ text: context
        ? "UTC · Earlier appearances count shop days before this return · Current prices are not historical prices"
        : "UTC · Shop occurrences count distinct shop days" });
    return e;
}
