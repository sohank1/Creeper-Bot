import axios from "axios";
import { selectBRShopArtwork } from "./MissingPreview";
import { performance } from "perf_hooks";
import { MissingCosmeticImageItem } from "./MissingCosmeticsImage";
import { MissingReport, reportDescription, todayUTC, validMinimumDays, validReportDate } from "./MissingReport";

const DAY = 86400000;
interface ReturnEvent { item: MissingCosmeticImageItem; gap: number; previous: string; appearances: number; rotations: number; record: boolean }

export class MissingHistoryIndex {
    private days = new Map<string, ReturnEvent[]>();
    private liveArtwork = new Map<string, Partial<MissingCosmeticImageItem>>();
    public cosmeticsWithHistory = 0;
    public eventCount = 0;
    public buildMs = 0;
    constructor(data: Record<string, any[]>, readonly asOf = todayUTC()) {
        const started = performance.now();
        const seen = new Set<string>();
        // Hundreds of thousands of appearances reuse only a few thousand UTC dates.
        // Validate/parse each distinct date once, not once per cosmetic appearance.
        const dateNumbers = new Map<string, number>();
        const dateNumber = (value: string) => {
            if (!dateNumbers.has(value)) dateNumbers.set(value, validReportDate(value) && value <= asOf ? Date.parse(value) : NaN);
            return dateNumbers.get(value);
        };
        for (const [category, cosmetics] of Object.entries(data)) {
            if (!Array.isArray(cosmetics)) continue;
            for (const cosmetic of cosmetics) {
                if (!cosmetic.id || seen.has(cosmetic.id) || !Array.isArray(cosmetic.shopHistory)) continue;
                seen.add(cosmetic.id);
                if (cosmetic._shopDate === asOf && cosmetic._shopArtwork) this.liveArtwork.set(cosmetic.id, cosmetic._shopArtwork);
                const history = [...new Set<string>(cosmetic.shopHistory.filter((value: unknown) => typeof value === "string").map((value: string) => value.slice(0, 10)))]
                    .filter(value => Number.isFinite(dateNumber(value))).sort();
                if (!history.length) continue;
                this.cosmeticsWithHistory++;
                const item: MissingCosmeticImageItem = {
                    id: cosmetic.id, name: cosmetic.name || [cosmetic.artist, cosmetic.title].filter(Boolean).join(" - ") || cosmetic.id,
                    type: cosmetic.type?.displayValue || (category === "tracks" ? "Jam Track" : category === "legoKits" ? "LEGO Kit" : category),
                    imageUrl: cosmetic.images?.icon || cosmetic.images?.large || cosmetic.images?.small || cosmetic.images?.smallIcon || cosmetic.albumArt || cosmetic.images?.featured || null,
                    featuredImageUrl: cosmetic.images?.featured || cosmetic.images?.large || cosmetic.images?.icon || cosmetic.albumArt || null,
                    introduced: cosmetic.introduction?.text, rarity: cosmetic.rarity?.displayValue, daysMissing: 0, lastSeenLabel: "",
                    setKey: cosmetic.set?.value || cosmetic.set?.text,
                };
                let rotations = 1;
                let longestGap = 0;
                for (let i = 1; i < history.length; i++) {
                    const gap = (dateNumber(history[i]) - dateNumber(history[i - 1])) / DAY;
                    const event: ReturnEvent = { item, gap, previous: history[i - 1], appearances: i, rotations, record: gap > longestGap };
                    const entries = this.days.get(history[i]);
                    if (entries) entries.push(event); else this.days.set(history[i], [event]);
                    this.eventCount++;
                    if (gap > 1) rotations++;
                    longestGap = Math.max(longestGap, gap);
                }
            }
        }
        // Sorted once: date/filter requests only scan until the first smaller gap.
        for (const events of this.days.values()) events.sort((a, b) => b.gap - a.gap || a.item.id.localeCompare(b.item.id));
        this.buildMs = performance.now() - started;
    }
    available(minimum: number) {
        if (!validMinimumDays(minimum)) throw new Error("Invalid minimum days");
        const result: { date: string; count: number }[] = [];
        for (const [date, events] of this.days) {
            let count = 0;
            while (count < events.length && events[count].gap >= minimum) count++;
            if (count) result.push({ date, count });
        }
        return result.sort((a, b) => b.date.localeCompare(a.date));
    }
    report(date: string, minimum: number): MissingReport {
        if (!validReportDate(date) || !validMinimumDays(minimum)) throw new Error("Invalid report parameters");
        const items: MissingCosmeticImageItem[] = [];
        for (const event of this.days.get(date) || []) {
            if (event.gap < minimum) break;
            const artwork = this.liveArtwork.get(event.item.id);
            const currentPrice = artwork?.price;
            // Artwork represents the cosmetic, not proof of a historical price
            // or layout. Reuse verified standalone art without altering history.
            const historicalArt = artwork?.featuredImageIsShopArtwork ? {
                featuredImageUrl: artwork.featuredImageUrl, featuredImageIsShopArtwork: true,
            } : {};
            items.push({ ...event.item, ...(date === this.asOf ? artwork : { ...historicalArt, price: currentPrice, priceIsCurrent: currentPrice !== undefined, backgroundColors: artwork?.backgroundColors }), daysMissing: event.gap, lastSeenLabel: event.previous,
                previousAppearances: event.appearances, previousRotations: event.rotations, recordReturn: event.record });
        }
        return { date, items, description: reportDescription(items) };
    }
}

// The catalog can lag behind the shop after reset. A live shop entry proves an
// appearance on that shop date; merge it before computing both counts and reports.
export function mergeCurrentShop(data: Record<string, any[]>, shop: any, today = todayUTC()) {
    if (!shop || shop.date?.slice(0, 10) !== today || !Array.isArray(shop.entries)) return data;
    const merged = { ...data };
    for (const [category, field] of [["br", "brItems"], ["tracks", "tracks"], ["cars", "cars"], ["instruments", "instruments"], ["legoKits", "legoKits"]]) {
        const byId = new Map((data[category] || []).map(item => [item.id, item]));
        const standalone = new Set<string>();
        for (const entry of shop.entries) {
            const total = ["brItems", "tracks", "cars", "instruments", "legoKits"].reduce((count, key) => count + (entry[key]?.length || 0), 0);
            for (const item of entry[field] || []) {
                const previous = byId.get(item.id);
                const ownOffer = total === 1;
                const artwork = selectBRShopArtwork(entry.newDisplayAsset?.renderImages);
                const image = item.images?.icon || item.images?.large || item.albumArt;
                const featured = (ownOffer && artwork) || item.images?.featured || image;
                const art = {
                    ...(image ? { imageUrl: image } : {}), ...(featured ? { featuredImageUrl: featured } : {}),
                    featuredImageIsShopArtwork: Boolean(ownOffer && artwork), price: ownOffer ? entry.finalPrice : undefined,
                    backgroundColors: [entry.colors?.color1, entry.colors?.color2, entry.colors?.color3].filter(Boolean),
                    textBackgroundColor: entry.colors?.textBackgroundColor, tileSize: entry.tileSize, shopSection: entry.layout?.name,
                };
                byId.set(item.id, { ...previous, ...item,
                    shopHistory: [...(previous?.shopHistory || []), ...(item.shopHistory || []), today],
                    _shopDate: today, _shopArtwork: standalone.has(item.id) ? previous._shopArtwork : art,
                });
                if (ownOffer) standalone.add(item.id);
            }
        }
        merged[category] = [...byId.values()];
    }
    return merged;
}

async function fetchHistories() {
    const [catalog, shop] = await Promise.all([
        axios.get("https://fortnite-api.com/v2/cosmetics?responseFlags=7", { timeout: 45000 }),
        axios.get("https://fortnite-api.com/v2/shop?responseFlags=7", { timeout: 30000 }),
    ]);
    if (!catalog.data?.data || !Array.isArray(catalog.data.data.br) || !Array.isArray(shop.data?.data?.entries)) throw new Error("Invalid cosmetics/shop API response");
    return mergeCurrentShop(catalog.data.data, shop.data.data);
}

// Transient API/index cache only: no saved reports, files or database reads/writes.
export class MissingHistoryService {
    private cached?: { index: MissingHistoryIndex; expires: number; date: string };
    private loading?: Promise<MissingHistoryIndex>;
    constructor(private fetchData = fetchHistories) {}
    async measured() {
        const cached = Boolean(this.cached && this.cached.expires > Date.now() && this.cached.date === todayUTC());
        const started = performance.now();
        const index = await this.get();
        return { index, cached, loadMs: performance.now() - started, buildMs: cached ? 0 : index.buildMs };
    }
    async get(): Promise<MissingHistoryIndex> {
        if (this.cached && this.cached.expires > Date.now() && this.cached.date === todayUTC()) return this.cached.index;
        if (!this.loading) this.loading = this.fetchData().then(data => {
            if (!data || !Array.isArray(data.br)) throw new Error("Invalid cosmetics history response");
            const index = new MissingHistoryIndex(data);
            this.cached = { index, expires: Date.now() + 5 * 60000, date: todayUTC() };
            return index;
        }).finally(() => { this.loading = undefined; });
        return this.loading;
    }
}
