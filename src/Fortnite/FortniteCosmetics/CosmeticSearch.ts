import { performance } from "perf_hooks";
import { CatalogCosmetic } from "./CosmeticEmbed";

export const normalizeCosmeticQuery = (text: string) => text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/['’`]/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const compact = (text: string) => text.replace(/ /g, "");
const alternate = (item: CatalogCosmetic) => ["lego", "beans"].includes(item.category);
const typeAliases: Record<string, string[]> = {
    skin: ["outfit"], skins: ["outfit"], outfit: ["outfit"], outfits: ["outfit"], dance: ["emote"], dances: ["emote"], emote: ["emote"], emotes: ["emote"],
    pickaxe: ["pickaxe"], pickaxes: ["pickaxe"], glider: ["glider"], gliders: ["glider"], wrap: ["wrap"], wraps: ["wrap"],
    backpack: ["backpack"], backbling: ["backpack"], song: ["track"], songs: ["track"], track: ["track"], tracks: ["track"],
    guitar: ["guitar"], guitars: ["guitar"], bass: ["bass"], drums: ["drums"], microphone: ["microphone"], keyboard: ["keyboard"],
    car: ["body", "car"], cars: ["body", "car"], vehicle: ["body", "car"], wheel: ["wheel", "wheels"], wheels: ["wheel", "wheels"], decal: ["decal"], decals: ["decal"],
    shoes: ["shoe", "shoes", "kicks"], kicks: ["shoe", "shoes", "kicks"], spray: ["spray"], sprays: ["spray"], contrail: ["contrail"],
    instrument: ["guitar", "bass", "drums", "microphone", "keyboard"], instruments: ["guitar", "bass", "drums", "microphone", "keyboard"],
    pet: ["pet", "petcarrier", "sidekick"], pets: ["pet", "petcarrier", "sidekick"], sidekick: ["sidekick"], aura: ["aura"],
    music: ["music", "track"], musicpack: ["music"], loadingscreen: ["loadingscreen"],
};
const stopwords = new Set(["show", "me", "find", "please", "looking", "for", "the", "a", "an", "some"]);
const rarityWords = new Set(["common", "uncommon", "rare", "epic", "legendary", "mythic"]);
interface ParsedQuery { words: string[]; types: Set<string>; category?: string; chapter?: number; season?: number; rarity?: string; maxPrice?: number }
export function parseCosmeticQuery(query: string): ParsedQuery {
    let text = normalizeCosmeticQuery(query.replace(/(\d),(?=\d)/g, "$1"));
    const parsed: ParsedQuery = { words: [], types: new Set() };
    text = text.replace(/\b(?:chapter\s*|ch\s*|c)(\d+)\s*(?:season\s*|s\s*)(\d+|x)\b/g, (_, chapter, season) => {
        parsed.chapter = Number(chapter); parsed.season = season === "x" ? 10 : Number(season); return " ";
    }).replace(/\bchapter\s+(\d+)\b/g, (_, chapter) => { parsed.chapter = Number(chapter); return " "; })
        .replace(/\b(?:season\s*|s)(\d+|x)\b/g, (_, season) => { parsed.season = season === "x" ? 10 : Number(season); return " "; })
        .replace(/\b(?:under|below)\s+(\d+)\s*(?:v\s*bucks|vbucks)?\b/g, (_, price) => { parsed.maxPrice = Number(price); return " "; })
        .replace(/\bfall guys\b/g, () => { parsed.category = "beans"; return " "; })
        .replace(/\blego (?:kit|kits|build|builds|decor)\b/g, () => { parsed.category = "legoKits"; return " "; })
        .replace(/\blego\b/g, () => { parsed.category = "lego"; return " "; })
        .replace(/\bjam tracks?\b/g, " track ").replace(/\bback blings?\b/g, " backbling ")
        .replace(/\bharvesting tools?\b/g, " pickaxe ")
        .replace(/\bmusic packs?\b/g, " musicpack ").replace(/\bloading screens?\b/g, " loadingscreen ");
    const words = text.split(/\s+/).filter(Boolean);
    const trackQuery = words.some(word => typeAliases[word]?.includes("track"));
    for (const word of words) {
        if (typeAliases[word]) typeAliases[word].forEach(type => parsed.types.add(type));
        else if (rarityWords.has(word) && !trackQuery) parsed.rarity = word;
        else if (!stopwords.has(word)) parsed.words.push(word);
    }
    return parsed;
}

// Bounded Damerau-Levenshtein: accepts adjacent transpositions without making
// short queries dangerously fuzzy. Vocabulary expansion is cached, not repeated per item.
export function cosmeticEditDistance(a: string, b: string, limit: number) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i), before = previous;
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        let minimum = i;
        for (let j = 1; j <= b.length; j++) {
            row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
            minimum = Math.min(minimum, row[j]);
        }
        if (minimum > limit) return limit + 1;
        before = previous; previous = row;
    }
    return previous[b.length];
}
export interface CosmeticSearchHit { item: CatalogCosmetic; score: number; reason: string; exact: boolean }
interface SearchDocument { item: CatalogCosmetic; name: string; added: number; literalFields: string[] }
export class CosmeticSearchIndex {
    private documents: SearchDocument[] = [];
    private tokens = new Map<string, Map<number, { weight: number; reason: string }>>();
    private prefixes = new Map<string, string[]>();
    private lengths = new Map<number, string[]>();
    private ids = new Map<string, number>();
    private names = new Map<string, number[]>();
    private expansions = new Map<string, Array<[string, number]>>();
    private cache = new Map<string, CosmeticSearchHit[]>();
    readonly buildMs: number;
    lastQueryMs = 0;
    constructor(items: CatalogCosmetic[]) {
        const start = performance.now();
        for (const item of items) {
            const index = this.documents.length, name = normalizeCosmeticQuery(item.name || item.id);
            this.documents.push({ item, name, added: Date.parse(item.added) || 0,
                literalFields: [item.name, item.description, item.set?.text, item.id, item.introduction?.text,
                    item.rarity?.displayValue, item.type?.displayValue].filter(Boolean).map(value => value.toLowerCase()) });
            this.ids.set(item.id.toLowerCase(), index);
            this.names.set(compact(name), [...(this.names.get(compact(name)) || []), index]);
            const add = (text: string, weight: number, reason: string) => {
                const normalized = normalizeCosmeticQuery(text || "");
                for (const token of new Set([...normalized.split(" "), ...(weight >= 8 ? [compact(normalized)] : [])])) {
                    if (!token || token.length > 80) continue;
                    if (!this.tokens.has(token)) this.tokens.set(token, new Map());
                    if ((this.tokens.get(token).get(index)?.weight || 0) < weight) this.tokens.get(token).set(index, { weight, reason });
                }
            };
            add(item.name, 10, "Name"); add(item.artist, 8, "Artist"); add(item.id, 2, "Item ID");
            add(item.set?.value || item.set?.text, 6, "Set"); add(item.series?.value, 5, "Series");
            add((item.searchTags || []).join(" "), 7, "Search tag");
            add((item.variants || []).flatMap(variant => (variant.options || []).map(option => option.name)).filter(Boolean).slice(0, 40).join(" "), 5, "Style name");
            add(item.description, 2, "Description"); add(item.album, 4, "Album");
            // Only readable, supported feature tags—not arbitrary backend filenames.
            const tags = (item.gameplayTags || []).join(" ");
            add([["Reactive", "reactive"], ["Emote.Traversal", "traversal"], ["BuiltIn", "built in"], ["Synced", "synced"], ["BattlePass", "battle pass"]].filter(([tag]) => tags.includes(tag)).map(([, label]) => label).join(" "), 5, "Feature");
        }
        for (const token of this.tokens.keys()) {
            const prefix = token.slice(0, 2);
            if (!this.prefixes.has(prefix)) this.prefixes.set(prefix, []);
            if (!this.lengths.has(token.length)) this.lengths.set(token.length, []);
            this.prefixes.get(prefix).push(token);
            this.lengths.get(token.length).push(token);
        }
        this.buildMs = performance.now() - start;
    }
    get diagnostics() { return { documents: this.documents.length, vocabulary: this.tokens.size, cachedQueries: this.cache.size, buildMs: this.buildMs, lastQueryMs: this.lastQueryMs }; }
    private remember<T>(cache: Map<string, T>, key: string, value: T) {
        if (cache.size >= 256) cache.delete(cache.keys().next().value);
        cache.set(key, value); return value;
    }
    private expand(word: string): Array<[string, number]> {
        if (this.expansions.has(word)) return this.expansions.get(word);
        const matches = new Map<string, number>();
        if (this.tokens.has(word)) matches.set(word, 1);
        if (word.length >= 2) for (const token of this.prefixes.get(word.slice(0, 2)) || []) if (token.startsWith(word)) matches.set(token, token === word ? 1 : .8);
        if (word.length >= 4 && word.length <= 32) {
            const limit = word.length >= 8 ? 2 : 1;
            for (let size = word.length - limit; size <= word.length + limit; size++) for (const token of this.lengths.get(size) || []) {
                if (matches.has(token)) continue;
                const distance = cosmeticEditDistance(word, token, limit);
                if (distance <= limit) matches.set(token, distance === 1 ? .55 : .38);
            }
        }
        return this.remember(this.expansions, word, [...matches]);
    }
    search(input: string, limit = 25): CosmeticSearchHit[] {
        const start = performance.now();
        try {
            const query = input.trim().slice(0, 100), normalized = normalizeCosmeticQuery(query);
            const cacheKey = query.toLowerCase();
            if (this.cache.has(cacheKey)) return this.cache.get(cacheKey).slice(0, limit);
            const directId = this.ids.get(query.toLowerCase());
            if (directId !== undefined) return [{ item: this.documents[directId].item, score: 10000, reason: "Exact item ID", exact: true }];
            const parsed = parseCosmeticQuery(query);
            const exactNames = this.names.get(compact(normalized)) || [];
            const allowed = (doc: SearchDocument) => (!parsed.category || doc.item.category === parsed.category)
                && (!parsed.types.size || parsed.types.has(doc.item.type?.value) || parsed.category && alternate(doc.item) && parsed.types.has("outfit"))
                && (!parsed.rarity || doc.item.rarity?.value === parsed.rarity)
                && (parsed.chapter === undefined || Number(doc.item.introduction?.chapter) === parsed.chapter)
                && (parsed.season === undefined || Number(doc.item.introduction?.season === "X" ? 10 : doc.item.introduction?.season) === parsed.season)
                && (parsed.maxPrice === undefined || Number.isFinite(doc.item.price) && doc.item.price < parsed.maxPrice);
            const terms = [...new Set(parsed.words)].slice(0, 12);
            let scores: Map<number, { score: number; reason: string; typos: number }>;
            for (const term of terms) {
                const matches = new Map<number, { score: number; reason: string; typos: number }>();
                for (const [word, quality] of this.expand(term)) for (const [index, info] of this.tokens.get(word) || []) {
                    if (scores && !scores.has(index)) continue;
                    const score = info.weight * quality;
                    const typos = quality < .8 ? 1 : 0;
                    const previous = matches.get(index);
                    if (!previous || typos < previous.typos || typos === previous.typos && score > previous.score) matches.set(index, { score, reason: typos ? "Similar spelling" : info.reason, typos });
                }
                if (scores) for (const [index, match] of matches) { match.score += scores.get(index).score; match.typos += scores.get(index).typos; }
                scores = matches;
                if (!scores.size) break;
            }
            if (!scores) scores = new Map(this.documents.map((doc, index) => [index, { score: 0, reason: normalized ? "Matching filters" : "Recently added", typos: 0 }]));
            const results = new Map<number, CosmeticSearchHit & { typos: number }>();
            for (const [index, match] of scores) {
                const doc = this.documents[index];
                if (!allowed(doc)) continue;
                const phrase = terms.join(" ");
                const nameBonus = phrase && doc.name === phrase ? 100 : phrase && doc.name.startsWith(phrase) ? 40 : phrase && doc.name.includes(phrase) ? 20 : 0;
                results.set(index, { item: doc.item, score: match.score + nameBonus - (alternate(doc.item) && !parsed.category ? 40 : 0), reason: match.typos ? "Similar spelling" : nameBonus ? "Name" : match.reason, exact: false, typos: match.typos });
            }
            // Preserve the original substring search, including partial backend IDs
            // and exact descriptive phrases. Natural-query filters remain separate.
            if (query) this.documents.forEach((doc, index) => {
                if (!doc.literalFields.some(field => field.includes(query.toLowerCase()))) return;
                const existing = results.get(index);
                if (!existing || existing.typos) results.set(index, { item: doc.item, score: 15,
                    reason: "Text match", exact: false, typos: 0 });
            });
            // Never reinterpret a complete item name (e.g. "Epic") as only a filter.
            for (const index of exactNames) results.set(index, { item: this.documents[index].item, score: 1000 - (alternate(this.documents[index].item) ? 40 : 0), reason: "Exact name", exact: true, typos: 0 });
            const minimumTypos = [...results.values()].reduce((minimum, hit) => Math.min(minimum, hit.typos), Infinity);
            const priority = (item: CatalogCosmetic) => ({ outfit: 0, emote: 1, track: 2, pickaxe: 3, backpack: 4, glider: 5 }[item.type?.value] ?? 6);
            const ranked = [...results.values()].filter(hit => hit.typos === minimumTypos).sort((a, b) => b.score - a.score
                || (terms.length ? priority(a.item) - priority(b.item) : 0)
                || (Date.parse(b.item.added) || 0) - (Date.parse(a.item.added) || 0) || a.item.id.localeCompare(b.item.id));
            const baseNames = new Set(ranked.filter(hit => !alternate(hit.item)).map(hit => normalizeCosmeticQuery(hit.item.name)));
            const diverse = ranked.filter(hit => parsed.category || !alternate(hit.item) || !baseNames.has(normalizeCosmeticQuery(hit.item.name))).slice(0, 100);
            this.remember(this.cache, cacheKey, diverse);
            return diverse.slice(0, limit);
        } finally { this.lastQueryMs = performance.now() - start; }
    }
}
