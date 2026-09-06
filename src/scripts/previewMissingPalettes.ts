import fs from "fs";
import path from "path";
import axios from "axios";
import { MissingHistoryIndex, mergeCurrentShop } from "../MissingCosmetics/MissingHistory";
import { renderMissingCosmeticsImage } from "../MissingCosmetics/MissingCosmeticsImage";
import { applyMissingPalettes, dominantHue, fallbackPalette } from "../MissingCosmetics/MissingPalette";
import assert from "assert";
import { selectMissingPreview, selectBRShopArtwork } from "../MissingCosmetics/MissingPreview";

async function main() {
    assert.equal(dominantHue(new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255])), 0);
    assert.equal(dominantHue(new Uint8ClampedArray([255, 0, 0, 0])), undefined);
    assert.equal(dominantHue(new Uint8ClampedArray([255, 255, 255, 255])), undefined);
    assert.deepEqual(fallbackPalette("set"), fallbackPalette("set"));
    const data = (await axios.get("https://fortnite-api.com/v2/cosmetics?responseFlags=7", { timeout: 45000 })).data.data;
    const shop = (await axios.get("https://fortnite-api.com/v2/shop?responseFlags=7", { timeout: 30000 })).data.data;
    const index = new MissingHistoryIndex(mergeCurrentShop(data, shop));
    const day = index.available(300).find(day => day.count >= 10 && day.count <= 20);
    if (!day) throw new Error("No suitable historical report");
    const report = index.report(day.date, 300);
    const fixture = { ...report.items[0], type: "Outfit", imageUrl: "icon", featuredImageUrl: "featured", featuredImageIsShopArtwork: true };
    assert.deepEqual(selectMissingPreview(fixture, true), { url: "featured", kind: "composition" });
    assert.deepEqual(selectMissingPreview(fixture, false), { url: "featured", kind: "composition" });
    assert.deepEqual(selectMissingPreview({ ...fixture, featuredImageIsShopArtwork: false }, false), { url: "icon", kind: "portrait" });
    assert.equal(selectBRShopArtwork([{ productTag: "Product.Juno", image: "lego" }]), undefined);
    assert.equal(selectBRShopArtwork([{ productTag: "Product.Juno", image: "lego" }, { productTag: "Product.BR", image: "br" }]), "br");
    assert.equal(selectBRShopArtwork([{ productTag: "Product.BR", image: "alternate" }, { productTag: "Product.BR", image: "default", isDefault: true }]), "default");
    assert.equal(selectMissingPreview({ ...fixture, type: "Emote" }, true).kind, "silhouette");
    assert.equal(selectMissingPreview({ ...fixture, type: "Jam Track" }, true).kind, "album");
    assert.equal(selectMissingPreview({ ...fixture, type: "Glider", featuredImageIsShopArtwork: false }, false).kind, "equipment");
    const output = path.resolve("artifacts", "palette-comparison");
    await fs.promises.mkdir(output, { recursive: true });
    const colored = await applyMissingPalettes(report.items);
    for (const [name, items] of [["before", report.items.map(item => ({ ...item, backgroundColors: ["#ff55a7", "#df2787", "#df2787"] }))], ["after", colored]] as const) {
        const render = await renderMissingCosmeticsImage([...items], report.date, "item-shop", 300);
        try { await fs.promises.writeFile(path.join(output, `${name}.png`), render.image); }
        finally { await render.close(); }
    }
    const api = { ...report.items[0], backgroundColors: ["#112233", "#445566"] };
    assert.deepEqual((await applyMissingPalettes([api]))[0].backgroundColors, api.backgroundColors);
    const siblings = report.items.slice(0, 2).map(item => ({ ...item, setKey: "fixture", imageUrl: null, featuredImageUrl: null, backgroundColors: undefined }));
    const grouped = await applyMissingPalettes(siblings);
    assert.deepEqual(grouped[0].backgroundColors, grouped[1].backgroundColors);
    const busyDay = index.available(300).find(day => day.count >= 24 && day.count <= 40);
    if (busyDay) {
        const busyReport = index.report(busyDay.date, 300);
        const render = await renderMissingCosmeticsImage(busyReport.items, busyDay.date, "item-shop", 300);
        try { await fs.promises.writeFile(path.join(output, "mixed-items.png"), render.image); }
        finally { await render.close(); }
        console.log("Mixed report:", busyDay, busyReport.items.map(item => item.type));
    }
    console.log(JSON.stringify({ date: day.date, items: day.count, output, palettes: colored.map(item => ({ name: item.name, colors: item.backgroundColors })) }, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
