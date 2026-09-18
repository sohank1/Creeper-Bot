import axios from "axios";

const DEFAULT_PRICE_REGISTRY = "https://raw.githubusercontent.com/Fortnite-Datamining/Fortnite-Datamining/main/data/items/registry.json";
const CACHE_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 5 * 60 * 1000;
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export interface FortnitePriceLookup {
    byId: Map<string, number>;
    observedAt?: Map<string, string>;
    documents: number;
}
export interface CosmeticPriceFields { price?: number; priceIsCurrent?: boolean; priceObservedAt?: string }
export const validCosmeticPrice = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

export function parseFortnitePriceRegistry(data: unknown, today = new Date().toISOString().slice(0, 10)): FortnitePriceLookup {
    if (!data || typeof data !== "object" || Array.isArray(data) || !Object.keys(data).length) throw new Error("Invalid Fortnite price registry response");
    const byId = new Map<string, number>(), observedAt = new Map<string, string>();
    let validItems = 0;
    for (const [id, item] of Object.entries(data) as Array<[string, any]>) {
        if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.name !== "string") continue;
        validItems++;
        if (["beans", "lego"].includes(item.source) || !Array.isArray(item.shop_appearances)) continue;
        const appearances = item.shop_appearances.filter(value => {
            const date = value?.date;
            // The archive writer defaults missing API prices to zero. Zero from
            // this source cannot prove a free offer; explicit live-shop zero can.
            return (value?.bundle === undefined || value.bundle === false) && validCosmeticPrice(value.price) && value.price > 0
                && typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today
                && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
        }).sort((a, b) => b.date.localeCompare(a.date));
        if (!appearances.length) continue;
        const latest = appearances[0].date;
        const prices = new Set(appearances.filter(value => value.date === latest).map(value => value.price));
        if (prices.size !== 1) continue;
        byId.set(id.toLowerCase(), appearances[0].price);
        observedAt.set(id.toLowerCase(), latest);
    }
    if (!validItems) throw new Error("Invalid Fortnite price registry records");
    return { byId, observedAt, documents: validItems };
}

export function priceForCosmetic(lookup: FortnitePriceLookup, item: any, _category?: string): number | undefined {
    // No name/type fallback: names can be shared across outfits, wheels and styles.
    if (typeof item?.id !== "string") return undefined;
    const value = lookup.byId.get(item.id.toLowerCase());
    return validCosmeticPrice(value) ? value : undefined;
}
export function registryPriceFields(lookup: FortnitePriceLookup, item: any): CosmeticPriceFields {
    const price = priceForCosmetic(lookup, item);
    return price === undefined ? {} : { price, priceIsCurrent: false, priceObservedAt: lookup.observedAt?.get(item.id.toLowerCase()) };
}
export function mergeFortnitePrices(data: Record<string, any[]>, lookup?: FortnitePriceLookup): Record<string, any[]> {
    if (!lookup) return data;
    const merged = { ...data };
    for (const [category, items] of Object.entries(data)) if (Array.isArray(items)) {
        merged[category] = items.map(item => validCosmeticPrice(item?._shopArtwork?.price) || validCosmeticPrice(item?.price)
            ? item : { ...item, ...registryPriceFields(lookup, item) });
    }
    return merged;
}

export class FortnitePriceService {
    private cached?: { lookup: FortnitePriceLookup; loaded: number };
    private loading?: Promise<FortnitePriceLookup>;
    private retryAfter = 0;
    constructor(private fetchRegistry = async (): Promise<unknown> => {
        const url = process.env.FORTNITE_PRICE_REGISTRY_URL || DEFAULT_PRICE_REGISTRY;
        if (new URL(url).protocol !== "https:") throw new Error("Fortnite price registry requires HTTPS");
        return (await axios.get(url, { timeout: 15000, maxContentLength: 20 * 1024 * 1024 })).data;
    }, private now = () => Date.now()) {}
    async get(): Promise<FortnitePriceLookup> {
        if (this.cached && this.now() - this.cached.loaded < CACHE_MS) return this.cached.lookup;
        if (this.now() < this.retryAfter) {
            if (this.cached && this.now() - this.cached.loaded < MAX_STALE_MS) return this.cached.lookup;
            throw new Error("Fortnite price registry temporarily unavailable");
        }
        if (!this.loading) this.loading = this.fetchRegistry().then(data => {
            const lookup = parseFortnitePriceRegistry(data);
            this.cached = { lookup, loaded: this.now() }; this.retryAfter = 0;
            return lookup;
        }).catch(() => {
            this.retryAfter = this.now() + RETRY_MS;
            if (this.cached && this.now() - this.cached.loaded < MAX_STALE_MS) return this.cached.lookup;
            throw new Error("Fortnite price registry temporarily unavailable");
        }).finally(() => { this.loading = undefined; });
        return this.loading;
    }
}
export const fortnitePriceService = new FortnitePriceService();
