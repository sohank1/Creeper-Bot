import axios from "axios";
import { MissingCosmeticImageItem } from "./MissingCosmeticsImage";
import { MissingReport, reportDescription, todayUTC, validMinimumDays, validReportDate } from "./MissingReport";

const DAY = 86400000;
interface ReturnEvent { item: MissingCosmeticImageItem; gap: number; previous: string; appearances: number; rotations: number; record: boolean }

export class MissingHistoryIndex {
    private days = new Map<string, ReturnEvent[]>();
    public cosmeticsWithHistory = 0;
    public eventCount = 0;
    constructor(data: Record<string, any[]>, readonly asOf = todayUTC()) {
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
            items.push({ ...event.item, daysMissing: event.gap, lastSeenLabel: event.previous,
                previousAppearances: event.appearances, previousRotations: event.rotations, recordReturn: event.record });
        }
        return { date, items, description: reportDescription(items) };
    }
}

// Transient API/index cache only: no saved reports, files or database reads/writes.
export class MissingHistoryService {
    private cached?: { index: MissingHistoryIndex; expires: number; date: string };
    private loading?: Promise<MissingHistoryIndex>;
    constructor(private fetchData = async () => (await axios.get("https://fortnite-api.com/v2/cosmetics?responseFlags=7", { timeout: 45000 })).data.data) {}
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
