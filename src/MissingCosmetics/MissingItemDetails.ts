import { MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu } from "discord.js";
import { MissingCosmeticImageItem } from "./MissingCosmeticsImage";
import { buildCosmeticEmbed, normalizeCosmetic, cosmeticTypeEmoji } from "../Fortnite/FortniteCosmetics/CosmeticEmbed";

export function missingItemControls(owner: string, date: string, minimum: number, items: MissingCosmeticImageItem[], page = 0) {
    const pages = Math.max(1, Math.ceil(items.length / 25));
    page = Math.max(0, Math.min(pages - 1, Math.floor(page) || 0));
    const id = (action: string) => `missing-report:${owner}:${date}:${action}:${minimum}`;
    const rows: MessageActionRow[] = [];
    if (items.length) rows.push(new MessageActionRow().addComponents(new MessageSelectMenu()
        .setCustomId(id("item")).setPlaceholder(`Choose an item · ${page + 1}/${pages}`)
        .addOptions(items.slice(page * 25, page * 25 + 25).map((item, offset) => ({
            label: item.name.slice(0, 100), value: String(page * 25 + offset),
            ...(item.cosmetic ? { emoji: cosmeticTypeEmoji(item.cosmetic) } : {}),
            description: `${item.type} · ${item.daysMissing.toLocaleString()} days away`.slice(0, 100),
        })))));
    rows.push(new MessageActionRow().addComponents(
        new MessageButton().setCustomId(id(`items-${page - 1}`)).setLabel("←").setStyle("SECONDARY").setDisabled(page === 0),
        new MessageButton().setCustomId(id("report")).setLabel("Back to report").setStyle("PRIMARY"),
        new MessageButton().setCustomId(id(`items-${page + 1}`)).setLabel("→").setStyle("SECONDARY").setDisabled(page === pages - 1),
    ));
    return rows;
}

export function missingItemEmbed(item: MissingCosmeticImageItem, date: string) {
    const cosmetic = item.cosmetic || normalizeCosmetic({
        id: item.id, name: item.name, type: { value: item.type.toLowerCase(), displayValue: item.type },
        images: { featured: item.featuredImageUrl || item.imageUrl },
        introduction: item.introduced ? { text: item.introduced } : undefined,
    });
    return buildCosmeticEmbed(cosmetic, { ...item, date });
}
