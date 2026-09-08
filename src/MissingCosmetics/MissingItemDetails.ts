import { MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu } from "discord.js";
import { MissingCosmeticImageItem } from "./MissingCosmeticsImage";

export function missingItemControls(owner: string, date: string, minimum: number, items: MissingCosmeticImageItem[], page = 0) {
    const pages = Math.max(1, Math.ceil(items.length / 25));
    page = Math.max(0, Math.min(pages - 1, Math.floor(page) || 0));
    const id = (action: string) => `missing-report:${owner}:${date}:${action}:${minimum}`;
    const rows: MessageActionRow[] = [];
    if (items.length) rows.push(new MessageActionRow().addComponents(new MessageSelectMenu()
        .setCustomId(id("item")).setPlaceholder(`Choose an item · ${page + 1}/${pages}`)
        .addOptions(items.slice(page * 25, page * 25 + 25).map((item, offset) => ({
            label: item.name.slice(0, 100), value: String(page * 25 + offset),
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
    const embed = new MessageEmbed().setColor("#2186DB").setTitle(item.name.slice(0, 256))
        .setDescription(`Returned on **${date}** after **${item.daysMissing.toLocaleString()} days away**.`)
        .addField("Type", item.type || "Unknown", true)
        .addField("Previous shop date", item.lastSeenLabel || "Unknown", true)
        .addField("Earlier shop appearances", item.previousAppearances === undefined ? "Unknown" : String(item.previousAppearances), true)
        .addField("Release season", item.introduced || "Unknown", true)
        .addField(item.priceIsCurrent ? "Current known price" : "Price", item.price === undefined ? "Unavailable" : `${item.price.toLocaleString()} V-Bucks`, true)
        .setFooter({ text: "UTC · Appearances count shop days before this return, not separate visits. Current prices are not historical prices." });
    if (item.imageUrl?.startsWith("https://")) embed.setThumbnail(item.imageUrl);
    // Search accepts the exact cosmetic ID, avoiding ambiguous names and variants.
    embed.addField("Cosmetic search", `For items supported by /fortnite cosmetic search, use this exact query:\n\`${item.id.replace(/`/g, "").slice(0, 200)}\``);
    return embed;
}
