import fs from "fs";
import assert from "assert";
import axios from "axios";
import { renderMissingCosmeticsImage, buildFortniteItemShopReplicaHtml, MissingCosmeticImageItem } from "../MissingCosmetics/MissingCosmeticsImage";
import { normalizeCosmetic } from "../Fortnite/FortniteCosmetics/CosmeticEmbed";

(async () => {
    const ids = ["Pickaxe_SplishSplash", "CID_428_Athena_Commando_M_UrbanScavenger", "Pickaxe_ID_078_Lifeguard"];
    const samples: MissingCosmeticImageItem[] = await Promise.all(ids.map(async (id, n) => {
        const response = await axios.get(`https://fortnite-api.com/v2/cosmetics/br/${id}`, { timeout: 20000 });
        const item = normalizeCosmetic(response.data.data);
        return { id, name: item.name, type: item.type.displayValue, imageUrl: item.images.icon,
            featuredImageUrl: item.images.featured, introduced: item.introduction?.text,
            rarity: item.rarity?.value, daysMissing: 0, lastSeenLabel: "",
            badgeLabel: ["NEXT RETURN", "EVERY RETURN", "PAUSED"][n] };
    }));
    // Synthetic repetition exercises full-page layout without creating alerts.
    const count = Math.max(1, Math.min(25, Number(process.argv[2]) || 3));
    const items = Array.from({ length: count }, (_, n) => ({ ...samples[n % samples.length], id: `${samples[n % samples.length].id}-example-${n}` }));
    const labels = { title: "SHOP ALERTS", subtitle: "WATCHLIST", footer: `${count} SAMPLE ALERTS · PAUSED ALERTS SKIP RETURNS`,
        profileName: "Example Player", profileAvatar: "https://cdn.discordapp.com/embed/avatars/0.png" };
    const html = buildFortniteItemShopReplicaHtml(items, "PAGE 1", 300, undefined, labels);
    assert(!html.includes("0 DAYS"));
    assert(!html.includes("RETURNING ITEMS"));
    assert(!html.includes('class="fs-report-date"'));
    assert(html.includes('class="fs-status-icon"'));
    assert(buildFortniteItemShopReplicaHtml(items, "PAGE 1", 300, undefined, { ...labels, pageCount: 4 }).includes("PAGE 1 / 4"));
    assert(html.includes("CHAPTER 6 · SEASON 4"));
    const rendered = await renderMissingCosmeticsImage(items, "PAGE 1", "item-shop", 300, undefined, labels);
    try {
        fs.mkdirSync("artifacts", { recursive: true });
        const output = count === 3 ? "artifacts/cosmetic-alerts-preview.png" : `artifacts/cosmetic-alerts-${count}-preview.png`;
        fs.writeFileSync(output, rendered.image);
        console.log(`Rendered ${output} (${rendered.image.length} bytes)`);
    } finally { await rendered.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
