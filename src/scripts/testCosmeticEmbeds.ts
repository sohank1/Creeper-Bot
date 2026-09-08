import assert from "assert";
import { buildCosmeticEmbed, cosmeticTypeEmoji, normalizeCosmeticCatalog } from "../Fortnite/FortniteCosmetics/CosmeticEmbed";
import { missingItemEmbed } from "../MissingCosmetics/MissingItemDetails";
import { mergeCurrentShop } from "../MissingCosmetics/MissingHistory";
import { mergeFortnitePrices, priceForCosmetic } from "../Fortnite/FortniteCosmetics/FortnitePriceService";

const catalog = normalizeCosmeticCatalog({
    br: [{ id: "outfit", name: "Outfit", type: { value: "outfit", displayValue: "Outfit" }, description: "Original description", images: { featured: "https://example.com/outfit.png" }, introduction: { chapter: "1", season: "X", text: "Introduced in Season X." }, shopHistory: ["invalid", "2020-01-01", "2020-01-01", "2025-01-01"] }],
    tracks: [{ id: "track", title: "Song", artist: "Artist", duration: 157, albumArt: "https://example.com/album.jpg" }],
    instruments: [{ id: "guitar", name: "Guitar", type: { value: "guitar", displayValue: "Guitar" }, images: { large: "https://example.com/guitar.png" } }],
    cars: [{ id: "car", name: "Car" }], legoKits: [{ id: "kit", name: "Kit" }],
    lego: [{ id: "lego", cosmeticId: "outfit" }], beans: [{ id: "bean", cosmeticId: "outfit" }],
});
assert.equal(catalog.length, 7);
assert.equal(catalog[5].name, "Outfit");
assert.equal(catalog[6].name, "Outfit");
assert.equal(cosmeticTypeEmoji(catalog[1]), "🎵");
for (const item of catalog) {
    const embed = buildCosmeticEmbed(item);
    assert(embed.length <= 6000);
    assert(embed.fields.length <= 25);
    assert(!embed.fields.some(field => /price/i.test(field.name)));
    assert(cosmeticTypeEmoji(item));
}
const track = buildCosmeticEmbed(catalog[1]);
assert.equal(track.image.url, "https://example.com/album.jpg");
assert(track.fields.some(field => field.name === "Track length" && field.value === "2:37"));
const search = buildCosmeticEmbed(catalog[0]);
assert(search.fields.some(field => field.name === "Occurrences" && field.value === "2"));
const item = { id: "outfit", name: "Outfit", type: "Outfit", imageUrl: null, daysMissing: 365, lastSeenLabel: "2020-01-01", cosmetic: catalog[0], price: 800, priceIsCurrent: true };
const details = missingItemEmbed(item, "2021-01-01");
assert.equal(details.image.url, search.image.url);
assert.equal(details.color, search.color);
assert.equal(details.fields.find(field => field.name === "Description").value, "Original description");
assert(!details.fields.some(field => field.name === "Recent Shop History"));
assert(details.fields.some(field => field.name === "Current shop price" && field.value === "800 V-Bucks"));
assert(!missingItemEmbed({ ...item, price: undefined }, "2021-01-01").fields.some(field => /price/i.test(field.name)));
const shop = mergeCurrentShop({ br: [{ id: "solo" }, { id: "bundle-item" }] }, { date: "2024-12-30", entries: [
    { finalPrice: 0, brItems: [{ id: "solo" }] },
    { finalPrice: 2000, brItems: [{ id: "bundle-item" }, { id: "other" }] },
] }, "2024-12-30");
const priced = normalizeCosmeticCatalog(shop);
assert.equal(priced.find(item => item.id === "solo").price, 0);
assert.equal(priced.find(item => item.id === "bundle-item").price, undefined);
const priceLookup = {
    byId: new Map([["exact", 900], ["outfit", 1200]]),
    observedAt: new Map([["outfit", "2025-01-01"]]), documents: 3,
};
assert.equal(priceForCosmetic(priceLookup, { id: "exact", name: "Wrong name" }, "br"), 900);
assert.equal(priceForCosmetic(priceLookup, { id: "OUTFIT", name: "Outfit" }, "br"), 1200);
assert.equal(priceForCosmetic(priceLookup, { name: "Outfit", type: { value: "outfit" } }, "br"), undefined);
const historicalPrices = normalizeCosmeticCatalog(mergeFortnitePrices({ br: [{ id: "outfit", name: "Outfit", type: { value: "outfit", displayValue: "Outfit" } }] }, priceLookup));
assert.equal(historicalPrices[0].price, 1200);
assert.equal(historicalPrices[0].priceIsCurrent, false);
const liveWins = normalizeCosmeticCatalog(mergeFortnitePrices({ br: [{ id: "outfit", name: "Outfit", type: { value: "outfit", displayValue: "Outfit" }, _shopArtwork: { price: 1500 } }] }, priceLookup));
assert.equal(liveWins[0].price, 1500);
assert.equal(liveWins[0].priceIsCurrent, true);
assert(buildCosmeticEmbed({ ...catalog[0], description: "x".repeat(10000) }).length <= 6000);
console.log("Shared cosmetic embeds: categories, artwork, return context, safe prices and Discord limits passed.");
