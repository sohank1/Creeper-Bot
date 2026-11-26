import { randomBytes } from "crypto";
import { MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu } from "discord.js";
import { buildCosmeticEmbed, cosmeticTypeEmoji } from "./CosmeticEmbed";
import { cosmeticWatchControls, cosmeticWatchControlsFor } from "./CosmeticAlertsUI";
import { CosmeticSearchHit } from "./CosmeticSearch";

interface SearchSession { owner: string; query: string; hits: CosmeticSearchHit[]; expires: number }
export class CosmeticSearchBrowser {
    private sessions = new Map<string, SearchSession>();
    private prune() { for (const [id, session] of this.sessions) if (session.expires <= Date.now()) this.sessions.delete(id); }
    create(owner: string, query: string, hits: CosmeticSearchHit[]) {
        this.prune();
        if (this.sessions.size >= 500) this.sessions.delete(this.sessions.keys().next().value);
        const id = randomBytes(8).toString("hex");
        this.sessions.set(id, { owner, query: query.slice(0, 100), hits: hits.slice(0, 100), expires: Date.now() + 15 * 60000 });
        return this.view(id, 0);
    }
    get size() { this.prune(); return this.sessions.size; }
    private view(id: string, page: number, selected?: number) {
        const session = this.sessions.get(id);
        page = Math.max(0, Math.min(Math.ceil(session.hits.length / 25) - 1, page));
        const customId = (action: string) => `cosmetic-search:${session.owner}:${id}:${action}`;
        const button = (action: string, label: string) => new MessageButton().setCustomId(customId(action)).setLabel(label).setStyle("SECONDARY");
        if (selected !== undefined) return { content: null, embeds: [buildCosmeticEmbed(session.hits[selected].item)], attachments: [],
            components: [cosmeticWatchControls(session.owner, session.hits[selected].item.id), new MessageActionRow().addComponents(button(`page${page}`, "← Search results"))] };
        return { content: null, embeds: [new MessageEmbed().setColor("#2186DB").setTitle("Find your cosmetic")
            .setDescription(`Results for **${session.query.replace(/[*_`~\\]/g, "")}**\n${session.hits.length === 100 ? "Top 100" : session.hits.length} matches · Choose an item below.\n\nYou can refine your search with an item type, artist, or season—for example, **Metallica song** or **C1S9 outfit**.`)
            .setFooter({ text: `Page ${page + 1} of ${Math.ceil(session.hits.length / 25)} · Matches use names and catalog metadata, not image recognition${/\b(under|below)\s+\d/i.test(session.query) ? " · Price filters use latest known prices" : ""} · Controls last 15 minutes` })],
            components: [new MessageActionRow().addComponents(new MessageSelectMenu().setCustomId(customId("choose")).setPlaceholder("Choose a cosmetic").addOptions(session.hits.slice(page * 25, page * 25 + 25).map((hit, offset) => ({
                label: (hit.item.name || hit.item.id).slice(0, 100), value: String(page * 25 + offset), emoji: cosmeticTypeEmoji(hit.item),
                description: `${hit.item.type?.displayValue || "Cosmetic"}${hit.item.artist ? ` · ${hit.item.artist}` : ""} · ${hit.reason}`.slice(0, 100),
            })))), new MessageActionRow().addComponents(button(`page${page - 1}`, "←").setDisabled(page === 0), button(`page${page + 1}`, "→").setDisabled((page + 1) * 25 >= session.hits.length))] };
    }
    async handle(i: any) {
        if (!(i.isButton() || i.isSelectMenu()) || !i.customId.startsWith("cosmetic-search:")) return false;
        let [, owner, id, action] = i.customId.split(":");
        this.prune();
        const session = this.sessions.get(id);
        if (!session || session.owner !== owner) { await i.reply({ content: "These search results have expired. Run `/fortnite cosmetic search` again to refresh them.", allowedMentions: { parse: [] } }); return true; }
        const selected = action === "choose" && i.isSelectMenu() ? Number(i.values[0]) : undefined;
        const page = action.startsWith("page") ? Number(action.slice(4)) : selected === undefined ? NaN : Math.floor(selected / 25);
        if (!Number.isInteger(page) || page < 0 || page >= Math.ceil(session.hits.length / 25) || selected !== undefined && (!Number.isInteger(selected) || !session.hits[selected])) {
            await i.reply({ content: "That result isn't available. Please choose an item from the menu.", allowedMentions: { parse: [] } }); return true;
        }
        if (owner !== i.user.id) {
            await i.deferReply();
            const ownView = this.create(i.user.id, session.query, session.hits);
            id = ownView.components[0].components[0].customId.split(":")[2];
        } else await i.deferUpdate();
        const payload = this.view(id, page, selected);
        if (selected !== undefined) payload.components[0] = await cosmeticWatchControlsFor(i.client?.user?.id, i.user.id, session.hits[selected].item.id);
        await i.editReply(payload);
        return true;
    }
}
