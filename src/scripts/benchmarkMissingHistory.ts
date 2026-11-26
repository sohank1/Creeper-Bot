import axios from "axios";
import { performance } from "perf_hooks";
import { MissingHistoryIndex, MissingHistoryService } from "../MissingCosmetics/MissingHistory";
import { renderMissingCosmeticsImage } from "../MissingCosmetics/MissingCosmeticsImage";

async function main() {
    const start = performance.now();
    const response = await axios.get("https://fortnite-api.com/v2/cosmetics?responseFlags=7", { timeout: 45000 });
    const fetched = performance.now();
    const index = new MissingHistoryIndex(response.data.data);
    const built = performance.now();
    const measurements = [];
    for (const minimum of [1, 30, 300, 730, 1000]) {
        const pickerStart = performance.now();
        const days = index.available(minimum);
        const pickerMs = performance.now() - pickerStart;
        const selected = days[0]?.date || index.asOf;
        const reportStart = performance.now();
        const report = index.report(selected, minimum);
        const reportMs = performance.now() - reportStart;
        measurements.push({ minimum, matchingDays: days.length, selected, items: report.items.length, pickerMs, reportMs });
    }
    let loads = 0;
    const service = new MissingHistoryService(async () => { loads++; return response.data.data; });
    await service.get();
    const warmStart = performance.now();
    for (let i = 0; i < 100; i++) {
        const warm = await service.get();
        const days = warm.available(300);
        if (days.length) warm.report(days[0].date, 300);
    }
    const warmPickerAndReportAverageMs = (performance.now() - warmStart) / 100;
    let artwork: { date: string; items: number; renderMs: number; bytes: number; closeMs: number };
    if (process.argv.includes("--render")) {
        const date = index.available(300)[0]?.date;
        if (date) {
            const report = index.report(date, 300);
            const renderStart = performance.now();
            const render = await renderMissingCosmeticsImage(report.items, date, "item-shop");
            try {
                artwork = { date, items: report.items.length, renderMs: performance.now() - renderStart, bytes: render.image.length, closeMs: 0 };
            } finally {
                const closeStart = performance.now();
                await render.close();
                if (artwork) artwork.closeMs = performance.now() - closeStart;
            }
        }
    }
    console.log(JSON.stringify({ apiFetchAndJSONMs: fetched - start, indexBuildMs: built - fetched,
        coldTotalMs: built - start, cosmeticsWithHistory: index.cosmeticsWithHistory, indexedAppearances: index.eventCount,
        measurements, warmPickerAndReportAverageMs, cacheLoads: loads, artwork }, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
