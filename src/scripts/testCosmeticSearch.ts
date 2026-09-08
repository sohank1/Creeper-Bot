import assert from "assert";
import axios from "axios";
import { normalizeCosmeticCatalog } from "../Fortnite/FortniteCosmetics/CosmeticEmbed";
import { CosmeticSearchIndex, cosmeticEditDistance, normalizeCosmeticQuery } from "../Fortnite/FortniteCosmetics/CosmeticSearch";
import { CosmeticSearchBrowser } from "../Fortnite/FortniteCosmetics/CosmeticSearchBrowser";

async function main() {
    const catalog = normalizeCosmeticCatalog({ br: [
        { id: "renegade", name: "Renegade Raider", type: { value: "outfit", displayValue: "Outfit" }, introduction: { chapter: "1", season: "1" } },
        { id: "dugh", name: "D’ugh", type: { value: "outfit", displayValue: "Outfit" } },
        { id: "spider", name: "Spider-Man", type: { value: "outfit", displayValue: "Outfit" } },
        { id: "bear", name: "Cuddle Team Leader", searchTags: ["Pink", "Bear"], type: { value: "outfit", displayValue: "Outfit" }, introduction: { chapter: "1", season: "9" }, _shopArtwork: { price: 800 } },
        { id: "description", name: "Something Else", description: "Renegade Raider fan", type: { value: "outfit", displayValue: "Outfit" } },
        { id: "style", name: "Style Fixture", variants: [{ options: [{ name: "Crimson" }] }], type: { value: "outfit", displayValue: "Outfit" } },
        { id: "red", name: "Red Fixture", type: { value: "outfit", displayValue: "Outfit" } },
        { id: "read", name: "Read Fixture", type: { value: "outfit", displayValue: "Outfit" } },
    ], tracks: [{ id: "track", title: "Master of Puppets", artist: "Metallica" }, { id: "epic-track", title: "Butter Barn Hoedown", artist: "Epic Games" }],
    lego: [{ id: "lego-raider", cosmeticId: "renegade" }], beans: [{ id: "bean-raider", cosmeticId: "renegade" }] });
    const index = new CosmeticSearchIndex(catalog);
    const first = (query: string) => index.search(query)[0]?.item.id;
    assert.equal(first("renegade raider"), "renegade");
    assert.equal(first("RENEGADE"), "renegade");
    assert(index.search("negad").some(hit => hit.item.id === "renegade"));
    assert(index.search("Raider fan").some(hit => hit.item.id === "description"));
    assert.equal(first("renegade raidr"), "renegade");
    assert.equal(first("renegdae raider"), "renegade");
    assert.equal(first("dugh"), "dugh");
    assert.equal(first("spiderman"), "spider");
    assert.equal(first("spiderman skin"), "spider");
    assert.equal(first("show me metallica songs"), "track");
    assert.equal(first("epic games song"), "epic-track");
    assert.equal(first("pink bear skin"), "bear");
    assert.equal(first("C1S9 outfit"), "bear");
    assert.equal(first("chapter 1 season 9 skin under 1000 vbucks"), "bear");
    assert.equal(first("chapter 1 season 9 skin under 1,000 vbucks"), "bear");
    assert.equal(index.search("skin under 800").length, 0);
    assert.equal(first("crimson skin"), "style");
    assert.equal(first("lego renegade"), "lego-raider");
    assert.equal(first("fall guys renegade"), "bean-raider");
    assert(!index.search("renegade").some(hit => ["lego", "beans"].includes(hit.item.category)));
    assert(!index.search("red skin").some(hit => hit.item.id === "read"));
    assert.equal(index.search("zxqvnotanitem").length, 0);
    assert.equal(normalizeCosmeticQuery("D’UGH"), "dugh");
    assert.equal(normalizeCosmeticQuery("Me & You"), normalizeCosmeticQuery("me and you"));
    assert.equal(cosmeticEditDistance("raider", "radier", 1), 1);
    for (let n = 0; n < 300; n++) index.search(`query${n}`);
    assert(index.diagnostics.cachedQueries <= 256);
    const browser = new CosmeticSearchBrowser();
    const owner = "12345678901234567890";
    const hits = Array.from({ length: 100 }, (_, n) => ({ item: { ...catalog[0], id: `id-${n}` }, exact: false, reason: "Name", score: 1 }));
    const view = browser.create(owner, "test", hits);
    const customId = view.components[0].components[0].customId;
    assert(customId.length <= 100);
    let response: any, deferred = false;
    const interaction: any = { isButton: () => false, isSelectMenu: () => true, customId, user: { id: owner }, values: ["26"],
        deferUpdate: async () => { deferred = true; }, editReply: async payload => { response = payload; }, reply: async payload => { response = payload; } };
    await browser.handle(interaction);
    assert(deferred && response.embeds[0].title === "Renegade Raider");
    let forked = false;
    await browser.handle({ ...interaction, user: { id: "someone-else" },
        deferReply: async () => { forked = true; }, deferUpdate: async () => { throw new Error("Must not edit another user's menu"); } });
    assert(forked && response.embeds[0].title === "Renegade Raider");
    assert(response.components[0].components[0].customId.includes("someone-else"));
    await browser.handle({ ...interaction, values: ["1000"] });
    assert(response.content.includes("isn't available"));
    await browser.handle({ ...interaction, customId: `cosmetic-search:${owner}:expired:choose` });
    assert(response.content.includes("expired"));
    console.log("Cosmetic search: ranking, typos, filters, metadata, cache bounds and picker ownership passed.");
    if (process.argv.includes("--live")) {
        const raw = (await axios.get("https://fortnite-api.com/v2/cosmetics?responseFlags=7", { timeout: 30000 })).data.data;
        const live = new CosmeticSearchIndex(normalizeCosmeticCatalog(raw));
        for (const query of ["renegade raidr", "dugh", "pink bear skin", "yellow food skin", "metallica song", "c1s9 outfit", "spiderman", "crimson skin", "outfit"]) {
            const hits = live.search(query);
            console.log(JSON.stringify({ query, ms: Number(live.lastQueryMs.toFixed(2)), top: hits.slice(0, 3).map(hit => ({ name: hit.item.name, type: hit.item.type.displayValue, reason: hit.reason })) }));
        }
        console.log(JSON.stringify(live.diagnostics));
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
