import fs from "fs";
import assert from "assert";
import axios from "axios";
import { renderMissingCosmeticsImage, buildFortniteItemShopReplicaHtml, MissingCosmeticImageItem } from "../MissingCosmetics/MissingCosmeticsImage";
import { normalizeCosmetic } from "../Fortnite/FortniteCosmetics/CosmeticEmbed";

(async () => {
    const ids = ["Pickaxe_SplishSplash", "CID_428_Athena_Commando_M_UrbanScavenger", "Pickaxe_ID_078_Lifeguard"];
    const items: MissingCosmeticImageItem[] = await Promise.all(ids.map(async (id, n) => {
        const response = await axios.get(`https://fortnite-api.com/v2/cosmetics/br/${id}`, { timeout: 20000 });
        const item = normalizeCosmetic(response.data.data);
        return { id, name: item.name, type: item.type.displayValue, imageUrl: item.images.icon,
            featuredImageUrl: item.images.featured, introduced: item.introduction?.text,
            rarity: item.rarity?.value, daysMissing: 0, lastSeenLabel: "",
            badgeLabel: ["NEXT RETURN", "EVERY RETURN", "PAUSED"][n] };
    }));
    const labels = { title: "SHOP ALERTS", subtitle: "WATCHLIST", footer: "3 SAVED ALERTS · PAUSED ALERTS SKIP RETURNS",
        profileName: "Example Player", profileAvatar: "https://cdn.discordapp.com/embed/avatars/0.png" };
    const html = buildFortniteItemShopReplicaHtml(items, "PAGE 1", 300, undefined, labels);
    assert(!html.includes("0 DAYS"));
    assert(!html.includes("RETURNING ITEMS"));
    assert(html.includes("CHAPTER 6 · SEASON 4"));
    const rendered = await renderMissingCosmeticsImage(items, "PAGE 1", "item-shop", 300, undefined, labels);
    try {
        fs.mkdirSync("artifacts", { recursive: true });
        fs.writeFileSync("artifacts/cosmetic-alerts-preview.png", rendered.image);
        console.log("Rendered artifacts/cosmetic-alerts-preview.png");
    } finally { await rendered.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
