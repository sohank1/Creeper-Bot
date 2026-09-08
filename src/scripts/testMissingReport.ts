import assert from "assert";
import { missingItemControls, missingItemEmbed } from "../MissingCosmetics/MissingItemDetails";
import { reportControls, registerMissingReportBrowser, resolveReportDate } from "../MissingCosmetics/MissingReportBrowser";
import { shiftDate, todayUTC, validReportDate, validMinimumDays, filteredItems } from "../MissingCosmetics/MissingReport";
import { MissingHistoryIndex, MissingHistoryService, mergeCurrentShop } from "../MissingCosmetics/MissingHistory";
import { fortniteCommand } from "../Fortnite/fortniteCommand";
import { buildFortniteItemShopReplicaHtml, introductionBadgeHtml } from "../MissingCosmetics/MissingCosmeticsImage";
import { getFortniteSeasonEmoji, getFortniteSeasonEmojiAssetUrl } from "../Fortnite/fortniteSeasonEmoji";

assert(introductionBadgeHtml("Introduced in Chapter 6, Season 3.").includes(getFortniteSeasonEmojiAssetUrl(getFortniteSeasonEmoji(6, 3)!)));
assert(introductionBadgeHtml("Introduced in Season X.").includes(getFortniteSeasonEmojiAssetUrl(getFortniteSeasonEmoji(1, 10)!)));
assert(!introductionBadgeHtml("Introduced in Chapter 99, Season 1.").includes("<img"));
assert.equal(introductionBadgeHtml(undefined), "");
const brandedHtml = buildFortniteItemShopReplicaHtml([], "2026-09-06", 300, "https://cdn.discordapp.com/avatars/test/logo.png?size=1024");
assert(brandedHtml.includes('class="fs-bot-logo"'));
assert(brandedHtml.includes("logo.png?size=1024"));
assert(!buildFortniteItemShopReplicaHtml([], "2026-09-06").includes('class="fs-bot-logo"'));
import { selectMissingPreview, missingArtworkShape, missingArtworkWarnings } from "../MissingCosmetics/MissingPreview";

const previewFixture = { id: "fixture", name: "Fixture", type: "Outfit", daysMissing: 300, lastSeenLabel: "2024-01-01", imageUrl: "portrait", featuredImageUrl: "shop", featuredImageIsShopArtwork: true };
const detailItems = Array.from({ length: 61 }, (_, i) => ({ ...previewFixture, id: `item-${i}`, name: `Item ${i}` }));
for (const page of [0, 1, 2, 999, -1]) {
    const rows = missingItemControls("123", "2024-12-01", 42, detailItems, page).map(row => row.toJSON());
    assert(rows.length <= 5);
    const menu = rows[0].components[0] as any;
    assert(menu.options.length <= 25);
    assert(menu.options.every(option => detailItems[Number(option.value)]));
    assert(menu.custom_id.endsWith(":42"));
}
assert.equal((missingItemControls("123", "2024-12-01", 300, detailItems, 2)[0].toJSON().components[0] as any).options.length, 11);
const detail = missingItemEmbed({ ...previewFixture, previousAppearances: 0, price: 0 }, "2024-12-01").toJSON();
assert(detail.fields.some(field => field.name === "Return details" && field.value.includes("Earlier shop appearances: **0**")));
assert(detail.fields.some(field => field.name === "Last known price" && field.value === "0 V-Bucks"));
assert(!missingItemEmbed(previewFixture, "2024-12-01").fields.some(field => /price/i.test(field.name)));
const wideFixture = { ...previewFixture, type: "Glider", featuredFraming: { aspect: 2, touchesBottom: false, emptyFraction: .8 } };
assert.equal(missingArtworkShape(wideFixture, true), "wide");
assert.equal(missingArtworkShape({ ...wideFixture, featuredFraming: { ...wideFixture.featuredFraming, aspect: .4 } }, true), "tall");
assert.equal(missingArtworkShape(previewFixture, true), "square");
assert(missingArtworkWarnings([wideFixture]).some(warning => warning.includes("70%")));
assert(missingArtworkWarnings([{ ...wideFixture, featuredFraming: { ...wideFixture.featuredFraming, touchesBottom: true } }]).some(warning => warning.includes("may be pre-cropped")));
assert.deepEqual(selectMissingPreview(previewFixture, false), { url: "portrait", kind: "portrait" });
assert.deepEqual(selectMissingPreview(previewFixture, true), { url: "shop", kind: "composition" });
assert.deepEqual(selectMissingPreview({ ...previewFixture, imageUrl: null }, false), { url: "shop", kind: "composition" });
assert.deepEqual(selectMissingPreview({ ...previewFixture, type: "Emote" }, false), { url: "shop", kind: "composition" });
assert.deepEqual(selectMissingPreview({ ...previewFixture, type: "Emote", featuredImageIsShopArtwork: false }, false), { url: "portrait", kind: "silhouette" });
assert.equal(selectMissingPreview({ ...previewFixture, type: "Jam Track" }, true).url, "portrait");

assert(validReportDate("2024-02-29"));
for (const invalid of ["2023-02-29", "2024-13-01", "2024-04-31", "24-01-01", "../2024-01-01", "2099-01-01"]) assert(!validReportDate(invalid), invalid);
assert.equal(shiftDate("2024-03-01", -1), "2024-02-29");
assert.equal(shiftDate("2023-12-31", 1), "2024-01-01");
for (const date of ["2024-02-29", "2023-02-28", "2024-01-31", todayUTC()]) {
    for (const picker of [true, false]) {
        const [y, m] = date.split("-").map(Number);
        const count = date.slice(0, 7) === todayUTC().slice(0, 7) ? new Date().getUTCDate() : new Date(Date.UTC(y, m, 0)).getUTCDate();
        const available = Array.from({ length: count }, (_, i) => ({ date: `${date.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`, count: i + 1 }));
        const rows = reportControls("123456789012345678", date, picker, available).map(row => row.toJSON());
        assert(rows.length <= 5);
        const dayValues: number[] = [];
        for (const row of rows) for (const component of row.components) {
            assert("custom_id" in component && component.custom_id.length <= 100);
            if (component.type === 3) {
                assert(component.options.length > 0 && component.options.length <= 25);
                if (component.custom_id.includes(":day")) dayValues.push(...component.options.map(option => Number(option.value)));
            }
        }
        if (picker) {
            const [year, month] = date.split("-").map(Number);
            const expected = date.slice(0, 7) === todayUTC().slice(0, 7) ? new Date().getUTCDate() : new Date(Date.UTC(year, month, 0)).getUTCDate();
            assert.deepEqual(dayValues, Array.from({ length: expected }, (_, i) => i + 1));
        }
    }
}
const sparse = reportControls("123", "2024-02-02", true, [{ date: "2024-02-02", count: 12 }, { date: "2024-02-27", count: 3 }]);
const dayMenu: any = sparse[0].toJSON().components[0];
assert.deepEqual(dayMenu.options.map(option => option.label), ["February 2 (12 items)", "February 27 (3 items)"]);
assert(sparse[1].components[0].customId.includes(":month:"));
assert(sparse[2].components[0].customId.includes(":year:"));
assert.equal(sparse[3].components.length, 4);
const arrows = (date: string, available = [{ date: "2024-02-02", count: 12 }, { date: "2024-02-27", count: 3 }]) =>
    reportControls("123", date, false, available)[0].toJSON().components as any[];
assert.equal(arrows("2024-02-02")[0].label, "←");
assert.equal(arrows("2024-02-02")[2].label, "→");
assert(arrows("2024-02-02")[0].disabled);
assert(!arrows("2024-02-02")[2].disabled);
assert(!arrows("2024-02-27")[0].disabled);
assert(arrows("2024-02-27")[2].disabled);
assert(arrows("2024-02-02", [])[0].disabled && arrows("2024-02-02", [])[2].disabled);
assert.equal(resolveReportDate("2024-03-01", [{ date: "2024-02-02", count: 2 }, { date: "2024-02-27", count: 1 }], "2024-03-01"), "2024-02-27");
assert.equal(resolveReportDate("2024-02-20", [{ date: "2024-02-02", count: 2 }], "2024-03-01"), "2024-02-20");
assert.equal(resolveReportDate("2024-03-01", [], "2024-03-01"), "2024-03-01");
assert(validMinimumDays(1) && validMinimumDays(100000));
for (const value of [0, -1, 2.5, NaN, 100001]) assert(!validMinimumDays(value));
const legacy: any = { items: [{ daysMissing: 299 }, { daysMissing: 300 }, { daysMissing: 730 }] };
assert.equal(filteredItems(legacy, 300).length, 2);
assert.equal(filteredItems(legacy, 730).length, 1);
for (const row of reportControls("123", "2024-02-02", false, [], 42)) {
    assert(row.components.length <= 5);
    for (const component of row.components) assert(component.customId.endsWith(":42"));
}
assert.equal(reportControls("123", todayUTC(), true, []).length, 1);
assert(!fortniteCommand.options.some(option => option.name === "cosmetics"));
const cosmetic: any = fortniteCommand.options.find(option => option.name === "cosmetic");
assert.equal(cosmetic.type, 2);
assert.deepEqual(cosmetic.options.map(option => option.name), ["search", "missing", "alerts"]);
const search = cosmetic.options[0];
assert.equal(search.options.length, 1);
assert.equal(search.options[0].name, "query");
assert(search.options[0].required && search.options[0].autocomplete);
const missing = cosmetic.options[1];
assert.deepEqual(missing.options.map(option => option.name), ["date", "days"]);
assert(missing.options.every(option => !option.required && !option.name.includes("_")));
console.log("Missing report date, picker limits, leap-year and command tests passed.");

const fixtures = { br: [
    { id: "a", name: "A", shopHistory: ["2024-12-31", "2024-01-01T12:00:00Z", "2024-01-01T00:00:00Z", "bad", "2024-12-30", "2099-01-01"] },
    { id: "b", name: "B", shopHistory: ["2024-12-30"] },
    { id: "a", name: "Duplicate", shopHistory: ["2024-01-01", "2024-12-30"] },
], legoKits: [{ id: "kit", name: "Kit", shopHistory: ["2024-01-01", "2024-12-30"] }] };
const index = new MissingHistoryIndex(fixtures, "2024-12-31");
assert.equal(index.report("2024-12-30", 364).items.length, 2);
assert.equal(index.report("2024-12-30", 365).items.length, 0);
assert.equal(index.report("2024-12-31", 300).items.length, 0);
assert.equal(index.report("2024-12-31", 1).items.length, 1);
assert.equal(index.report("2024-12-30", 300).items[0].previousAppearances, 1);
assert.equal(index.report("2024-12-31", 1).items[0].previousAppearances, 2);
assert.deepEqual(index.available(300), [{ date: "2024-12-30", count: 2 }]);
assert.equal(index.report("2024-01-01", 1).items.length, 0); // First release is not a return.
const html = buildFortniteItemShopReplicaHtml(index.report("2024-12-30", 42).items, "2024-12-30", 42);
assert(html.includes("42+ DAYS AWAY"));
assert(!html.includes("300+ DAYS AWAY"));
assert(!html.includes("IN SHOP"));
assert(html.includes('class="fs-report-date"'));
const merged = mergeCurrentShop({ br: [{ id: "return", name: "Return", shopHistory: ["2024-01-01"] }] }, {
    date: "2024-12-30T00:00:00Z", entries: [{ finalPrice: 800, brItems: [{ id: "return", name: "Return", shopHistory: ["2024-01-01"] }] }],
}, "2024-12-30");
const liveIndex = new MissingHistoryIndex(merged, "2024-12-30");
assert.equal(liveIndex.report("2024-12-30", 300).items[0].daysMissing, 364);
assert.equal(liveIndex.report("2024-12-30", 300).items[0].price, 800);
assert.deepEqual(liveIndex.available(300), [{ date: "2024-12-30", count: 1 }]);
assert.deepEqual(liveIndex.available(365), []);
for (const minimum of [1, 30, 300, 365, 1000]) {
    for (const day of index.available(minimum)) assert.equal(day.count, index.report(day.date, minimum).items.length);
}
async function testCache() {
    let calls = 0;
    const service = new MissingHistoryService(async () => { calls++; return fixtures; });
    const [a, b] = await Promise.all([service.get(), service.get()]);
    assert.strictEqual(a, b);
    assert.strictEqual(await service.get(), a);
    assert.equal(calls, 1);
    let attempts = 0;
    const recovering = new MissingHistoryService(async () => { if (++attempts === 1) throw new Error("offline"); return fixtures; });
    await assert.rejects(recovering.get());
    await recovering.get();
    assert.equal(attempts, 2);
    // Exercise the actual Discord command handler with omitted optional arguments.
    // An empty today must still reply with today's date, default 300 and a picker.
    const originalGet = MissingHistoryService.prototype.get;
    MissingHistoryService.prototype.get = async () => new MissingHistoryIndex({ br: [] });
    try {
        let listener: (interaction: any) => Promise<void>;
        registerMissingReportBrowser({ on: (_event, callback) => { listener = callback; } } as any);
        let response: any;
        let deferred = false;
        await listener({
            isCommand: () => true, isButton: () => false, isSelectMenu: () => false,
            commandName: "fortnite", user: { id: "123" },
            options: { getSubcommandGroup: () => "cosmetic", getSubcommand: () => "missing", getString: () => null, getInteger: () => null },
            deferReply: async options => { assert.strictEqual(options.ephemeral, false); deferred = true; }, editReply: async value => { response = { ...response, ...value }; },
        });
        assert(deferred);
        assert(response.embeds[0].title.includes(todayUTC()));
        assert(response.embeds[0].description.includes("300+ day"));
        assert(response.embeds[0].fields.some(field => field.name.includes("Performance") && field.value.includes("Calculation") && field.value.includes("Render") && field.value.includes("Delivery")));
        assert(!response.embeds[0].image);
        assert(response.components[0].components.some(component => component.label === "Choose date"));
    } finally { MissingHistoryService.prototype.get = originalGet; }
    console.log("History calculations, duplicates, first releases, historical counts and cache tests passed.");
}
testCache().catch(error => { console.error(error); process.exitCode = 1; });
