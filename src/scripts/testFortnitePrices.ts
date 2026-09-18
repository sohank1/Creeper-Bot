import assert from "assert";
import { FortnitePriceService, parseFortnitePriceRegistry, priceForCosmetic, mergeFortnitePrices, registryPriceFields } from "../Fortnite/FortniteCosmetics/FortnitePriceService";
import { normalizeCosmeticCatalog, buildCosmeticEmbed } from "../Fortnite/FortniteCosmetics/CosmeticEmbed";
import { alertShopOffers, enrichAlertOfferPrices, alertOfferPriceLabel } from "../Fortnite/FortniteCosmetics/CosmeticAlerts";
import { MissingHistoryIndex } from "../MissingCosmetics/MissingHistory";
import { buildFortniteItemShopReplicaHtml } from "../MissingCosmetics/MissingCosmeticsImage";

async function main() {
    const raw = {
        Tool: { name: "Shared Name", source: "br", shop_appearances: [
            { date: "2024-01-01", price: 500 }, { date: "2024-12-30", price: 800 }, { date: "2024-12-31", price: 2000, bundle: true },
            { date: "2099-01-01", price: 3000 }, { date: "2024-02-31", price: 700 },
        ] },
        bundle: { name: "Bundle Item", shop_appearances: [{ date: "2024-12-30", price: 2000, bundle: true }] },
        zero: { name: "Unknown or free", shop_appearances: [{ date: "2024-12-30", price: 0 }] },
        conflict: { name: "Conflict", shop_appearances: [{ date: "2024-12-30", price: 800 }, { date: "2024-12-30", price: 900 }] },
        malformed: { name: "Malformed", shop_appearances: {} },
    };
    const lookup = parseFortnitePriceRegistry(raw, "2024-12-31");
    assert.equal(priceForCosmetic(lookup, { id: "TOOL" }), 800);
    assert.equal(priceForCosmetic(lookup, { id: "another", name: "Shared Name" }), undefined);
    for (const id of ["bundle", "zero", "conflict"]) assert.equal(priceForCosmetic(lookup, { id }), undefined);
    assert.equal(lookup.observedAt.get("tool"), "2024-12-30");
    for (const invalid of [null, [], {}, { error: "bad" }]) assert.throws(() => parseFortnitePriceRegistry(invalid));
    const data = { br: [{ id: "Tool", name: "Shared Name", type: { value: "pickaxe", displayValue: "Pickaxe" }, shopHistory: ["2024-01-01", "2024-12-31"] }] };
    const enriched = mergeFortnitePrices(data, lookup);
    const cosmetic = normalizeCosmeticCatalog(enriched)[0];
    assert(buildCosmeticEmbed(cosmetic).fields.some(field => field.name === "Last known price" && field.value.includes("800 V-Bucks\nObserved 2024-12-30")));
    const report = new MissingHistoryIndex(enriched, "2024-12-31").report("2024-12-31", 300);
    assert.equal(report.items[0].price, 800);
    assert.equal(report.items[0].priceObservedAt, "2024-12-30");
    const html = buildFortniteItemShopReplicaHtml(report.items, report.date);
    assert(html.includes("800*")); assert(html.includes("LATEST KNOWN PRICE"));
    const free = normalizeCosmeticCatalog(mergeFortnitePrices({ br: [{ ...data.br[0], _shopArtwork: { price: 0 } }] }, lookup))[0];
    assert.equal(free.price, 0);
    assert(buildCosmeticEmbed(free).fields.some(field => field.name === "Current shop price" && field.value === "0 V-Bucks"));
    const offers = alertShopOffers({ date: "2024-12-31", entries: [{ finalPrice: 2000, brItems: [data.br[0], { id: "bundle", name: "Bundle Item" }] }] }, "2024-12-31");
    const alert = enrichAlertOfferPrices(offers, lookup).get("Tool");
    assert.equal(alert.price, 2000); assert.equal(alert.item.price, 800); assert(alert.bundle);
    assert.equal(alertOfferPriceLabel(alert), "2,000 V-Bucks for the offer");
    assert.equal(alertOfferPriceLabel({ ...alert, price: undefined }), "Last known item price: 800 V-Bucks");
    const individual = enrichAlertOfferPrices(alertShopOffers({ date: "2024-12-31", entries: [{ finalPrice: 600, brItems: [data.br[0]] }] }, "2024-12-31"), lookup).get("Tool");
    assert.equal(individual.item.price, 600); assert.equal(individual.item.priceIsCurrent, true);
    assert.deepEqual(registryPriceFields(lookup, { id: "missing" }), {});
    let calls = 0, fail = false, time = 1000;
    const service = new FortnitePriceService(async () => { calls++; if (fail) throw new Error("offline"); return raw; }, () => time);
    const [a, b] = await Promise.all([service.get(), service.get()]);
    assert.strictEqual(a, b); assert.equal(calls, 1);
    time += 7 * 3600000; fail = true;
    assert.strictEqual(await service.get(), a); assert.equal(calls, 2);
    assert.strictEqual(await service.get(), a); assert.equal(calls, 2);
    time += 8 * 86400000;
    await assert.rejects(() => service.get());
    const failedCalls = calls;
    await assert.rejects(() => service.get()); assert.equal(calls, failedCalls);
    console.log("Price fallback: exact IDs, bundle exclusion, dates, live precedence, reports, alerts and outage cache passed.");
    if (process.argv.includes("--live")) {
        const live = await new FortnitePriceService().get();
        console.log(JSON.stringify({ records: live.documents, standalonePrices: live.byId.size,
            rescuePaddle: registryPriceFields(live, { id: "Pickaxe_ID_078_Lifeguard" }),
            shotCaller: registryPriceFields(live, { id: "CID_428_Athena_Commando_M_UrbanScavenger" }),
            beanShotCaller: registryPriceFields(live, { id: "Bean_UrbanScavenger" }),
        }));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
