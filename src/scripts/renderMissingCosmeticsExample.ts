import fs from "fs";
import path from "path";
import axios from "axios";
import { MissingCosmeticImageItem, MissingCosmeticsImageVariant, renderMissingCosmeticsImage } from "../MissingCosmetics/MissingCosmeticsImage";

const outputPath = path.resolve(process.argv[2] || "artifacts/missing-cosmetics-example.png");
const variant = (process.argv[3] || "vault-grid") as MissingCosmeticsImageVariant;
const sampleCount = Math.max(0, Number(process.argv[4]) || 0);
const imageMode = process.argv[5] || "icon";

(async () => {
    const response = await axios.get<any>("https://fortnite-api.com/v2/shop?responseFlags=7");
    const shop = response.data.data;
    const shopDay = new Date(`${shop.date.slice(0, 10)}T00:00:00Z`);
    const normalized: Array<any> = [];
    const standalonePrices = new Map<string, number>();
    for (const entry of shop.entries || []) {
        const entryItems = [...(entry.brItems || []), ...(entry.cars || []), ...(entry.instruments || []), ...(entry.tracks || [])];
        if (entryItems.length === 1) standalonePrices.set(entryItems[0].id, entry.finalPrice);
    }

    for (const entry of shop.entries || []) {
        const entryItems = [...(entry.brItems || []), ...(entry.cars || []), ...(entry.instruments || []), ...(entry.tracks || [])];
        const shopArtwork = entryItems.length === 1
            ? entry.newDisplayAsset?.renderImages?.find((image: any) => image.productTag === "Product.BR")?.image || entry.newDisplayAsset?.renderImages?.[0]?.image
            : undefined;
        for (const key of ["brItems", "cars", "instruments"]) {
            for (const item of entry[key] || []) {
                normalized.push({
                    ...item,
                    price: standalonePrices.get(item.id),
                    standaloneOffer: entryItems.length === 1,
                    tileSize: entry.tileSize,
                    shopSection: entry.layout?.name,
                    backgroundColors: [entry.colors?.color1, entry.colors?.color2, entry.colors?.color3].filter(Boolean),
                    textBackgroundColor: entry.colors?.textBackgroundColor,
                    imageUrl: imageMode === "icon"
                        ? item.images?.icon || item.images?.featured || shopArtwork || null
                        : imageMode === "featured"
                            ? item.images?.featured || item.images?.icon || shopArtwork || null
                            : shopArtwork || item.images?.featured || item.images?.icon || item.images?.large || item.images?.smallIcon || item.images?.small || null,
                    featuredImageUrl: shopArtwork || item.images?.featured || item.images?.icon || null,
                    featuredImageIsShopArtwork: Boolean(shopArtwork),
                });
            }
        }
        for (const track of entry.tracks || []) {
            normalized.push({
                ...track,
                price: standalonePrices.get(track.id),
                standaloneOffer: entryItems.length === 1,
                tileSize: entry.tileSize,
                shopSection: entry.layout?.name,
                backgroundColors: [entry.colors?.color1, entry.colors?.color2, entry.colors?.color3].filter(Boolean),
                textBackgroundColor: entry.colors?.textBackgroundColor,
                name: `${track.artist} - ${track.title}`,
                type: { displayValue: "Jam Track" },
                imageUrl: track.albumArt || null,
                featuredImageUrl: track.albumArt || null,
            });
        }
    }

    normalized.sort((a, b) => {
        const score = (item: any) => (item.standaloneOffer ? 16 : 0)
            + (item.price !== undefined ? 8 : 0)
            + (item.backgroundColors?.length ? 4 : 0)
            + (item.tileSize ? 2 : 0)
            + (item.imageUrl ? 1 : 0);
        return score(b) - score(a);
    });

    const seen = new Set<string>();
    const items: MissingCosmeticImageItem[] = [];
    for (const item of normalized) {
        if (seen.has(item.id) || !item.shopHistory || item.shopHistory.length < 2) continue;
        seen.add(item.id);
        const lastSeen = new Date(`${item.shopHistory[item.shopHistory.length - 2].slice(0, 10)}T00:00:00Z`);
        const daysMissing = Math.round((shopDay.getTime() - lastSeen.getTime()) / 86_400_000);
        if (daysMissing < 300) continue;
        items.push({
            id: item.id,
            name: item.name,
            type: item.type?.displayValue || "Cosmetic",
            imageUrl: item.imageUrl,
            featuredImageUrl: item.featuredImageUrl,
            featuredImageIsShopArtwork: item.featuredImageIsShopArtwork,
            daysMissing,
            lastSeenLabel: lastSeen.toLocaleDateString("en-US", { timeZone: "UTC" }),
            rarity: item.rarity?.displayValue,
            price: item.price,
            previousAppearances: item.shopHistory.length - 1,
            introduced: item.introduction?.text,
            backgroundColors: item.backgroundColors,
            textBackgroundColor: item.textBackgroundColor,
            tileSize: item.tileSize,
            shopSection: item.shopSection,
            previousRotations: Math.max(1, Math.ceil((item.shopHistory.length - 1) / 3)),
            recordReturn: true,
        });
    }
    items.sort((a, b) => b.daysMissing - a.daysMissing);

    // Stress-preview mode uses additional real shop artwork to exercise busy layouts.
    // It is only used by this preview script; the bot always renders qualifying returns.
    if (sampleCount > items.length) {
        const usedIds = new Set(items.map(item => item.id));
        const appendPreviewItem = (item: any) => {
            if (items.length >= sampleCount || usedIds.has(item.id) || !item.imageUrl) return;
            usedIds.add(item.id);
            const previewDays = 300 + (items.length * 37);
            items.push({
                id: item.id,
                name: item.name,
                type: item.type?.displayValue || "Cosmetic",
                imageUrl: item.imageUrl,
                featuredImageUrl: item.featuredImageUrl,
                featuredImageIsShopArtwork: item.featuredImageIsShopArtwork,
                daysMissing: previewDays,
                lastSeenLabel: new Date(shopDay.getTime() - previewDays * 86_400_000).toLocaleDateString("en-US", { timeZone: "UTC" }),
                rarity: item.rarity?.displayValue,
                price: item.price,
                previousAppearances: Math.max(1, (item.shopHistory?.length || 2) - 1),
                introduced: item.introduction?.text,
                backgroundColors: item.backgroundColors,
                textBackgroundColor: item.textBackgroundColor,
                tileSize: item.tileSize,
                shopSection: item.shopSection,
                previousRotations: Math.max(1, Math.ceil((item.shopHistory?.length || 2) / 3)),
                recordReturn: items.length % 5 === 0,
            });
        };

        // Recreate the two portrait slots visible in the supplied DAILY screenshot.
        while (items.filter(item => item.type.toLowerCase() === "outfit").length < 2) {
            const outfit = normalized.find(item => item.type?.displayValue?.toLowerCase() === "outfit" && !usedIds.has(item.id) && item.imageUrl);
            if (!outfit) break;
            appendPreviewItem(outfit);
        }
        for (const item of normalized) {
            if (items.length >= sampleCount) break;
            appendPreviewItem(item);
        }
    }

    if (!items.length) throw new Error("The latest shop has no returning cosmetics missing for 300+ days.");
    const shopDateLabel = shopDay.toLocaleDateString("en-US", { timeZone: "UTC" });
    const render = await renderMissingCosmeticsImage(items, shopDateLabel, variant);
    try {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, render.image);
        console.log(`Rendered ${items.length} item(s) from ${shop.date} to ${outputPath}`);
    } finally {
        await render.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
