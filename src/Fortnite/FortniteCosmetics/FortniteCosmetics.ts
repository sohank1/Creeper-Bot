import axios from "axios";
import { ApplicationCommandOptionChoice, AutocompleteInteraction, BaseCommandInteraction, CacheType, Client } from "discord.js";
import { scheduleJob } from "node-schedule";
import { createTrackedJob, registerComponent } from "../../runtimeDiagnostics";
import { buildCosmeticEmbed, CatalogCosmetic, cosmeticTypeEmoji, normalizeCosmeticCatalog } from "./CosmeticEmbed";
import { mergeCurrentShop } from "../../MissingCosmetics/MissingHistory";
import { fortnitePriceService, mergeFortnitePrices } from "./FortnitePriceService";
import { cosmeticWatchControlsFor } from "./CosmeticAlertsUI";
import { CosmeticSearchIndex } from "./CosmeticSearch";
import { CosmeticSearchBrowser } from "./CosmeticSearchBrowser";
// const cosmeticsData = <CosmeticsResponse>require("./cosmetics.json");

export const sortingPriorities = {
    'outfit': 0,
    'emote': 1,
    'backpack': 2,
    'pickaxe': 3,
    'loadingscreen': 4,
    'glider': 5,
    'wrap': 6,
    'musicpack': 7,
    'spray': 8,
    'emoji': 9,
    'pet': 10,
    'toy': 11,
    'banner': 12,
    'loading': 13,
    "contrail": 14,
    'petcarrier': 15,
    'music': 16,

}

const LOADING_STRING = "Currently loading all cosmetics... Please wait.";

export class FortniteCosmetics {
    private _data: CatalogCosmetic[];
    private searchIndex: CosmeticSearchIndex;
    private searchBrowser = new CosmeticSearchBrowser();

    constructor(private client: Client) {
        registerComponent("fortniteCosmetics", this);
        this.fetchCosmetics().then(d => this.installCatalog(d));

        scheduleJob({ minute: 10, second: 0 }, createTrackedJob("fortnite-cosmetics-refresh", "Fortnite Cosmetics Refresh", "Hourly at mm:10", async () => {
            // const c = (<TextChannel>client.channels.cache.get('1045086199053820004')) || (<TextChannel>client.channels.cache.get("725143127723212830"))
            console.log("fetching cosmetics...");
            this.installCatalog(await this.fetchCosmetics());

        }))

        this.client.on("interactionCreate", async (i) => {
            try {
            if (await this.searchBrowser.handle(i)) return;
            if (!i.isCommand() && !i.isAutocomplete()) return;
            if (i.commandName !== "fortnite" || i.options.getSubcommandGroup(false) !== "cosmetic" || i.options.getSubcommand(false) !== "search") return;
            if (i.isAutocomplete()) return await this.resolveSearchQuery(i);
            return await this.replyEmbed(i);
            } catch (error) {
                console.warn("Cosmetic search failed:", error.code || error.name);
                if (i.isAutocomplete()) { if (!i.responded) await i.respond([]).catch(() => {}); }
                else if (i.isCommand() || i.isButton() || i.isSelectMenu()) {
                    const payload = { content: "Couldn't load these cosmetics. Please try again shortly.", allowedMentions: { parse: [] as any[] } };
                    if (i.deferred || i.replied) await i.editReply(payload).catch(() => {});
                    else await i.reply(payload).catch(() => {});
                }
            }
        })
    }

    private installCatalog(items: CatalogCosmetic[]) {
        if (!items.length) return;
        const index = new CosmeticSearchIndex(items);
        this._data = items;
        this.searchIndex = index;
    }
    public getDiagnostics() {
        return { cosmeticsLoaded: this._data?.length || 0, search: this.searchIndex?.diagnostics, activeSearches: this.searchBrowser.size };
    }
    private async resolveSearchQuery(i: AutocompleteInteraction<CacheType>): Promise<void> {
        if (!this.searchIndex) return i.respond([{ name: "Loading cosmetics…", value: LOADING_STRING }]);
        const hits = this.searchIndex.search(String(i.options.getFocused(true).value));
        return i.respond(hits.map(hit => this.formatAutoCompleteResponse(hit.item)));
    }
    public respondWithNewCosmetics(i: AutocompleteInteraction<CacheType>): Promise<void> {
        return i.respond((this.searchIndex?.search("") || []).map(hit => this.formatAutoCompleteResponse(hit.item)));
    }
    private formatAutoCompleteResponse(item: CatalogCosmetic): ApplicationCommandOptionChoice {
        const detail = item.artist ? item.artist : item.type?.displayValue || "Cosmetic";
        return { name: (cosmeticTypeEmoji(item) + " " + (item.name || item.id).slice(0, 65) + " · " + detail).slice(0, 100), value: item.id };
    }
    private async replyEmbed(i: BaseCommandInteraction<CacheType>): Promise<void> {
        const query = String(i.options.get("query").value);
        await i.deferReply();
        if (!this.searchIndex || query === LOADING_STRING) { await i.editReply({ content: LOADING_STRING }); return; }
        const hits = this.searchIndex.search(query, 100);
        const exact = hits.filter(hit => hit.exact);
        if (exact.length === 1) {
            const cosmetic = exact[0].item;
            await i.editReply({ embeds: [buildCosmeticEmbed(cosmetic)], components: [await cosmeticWatchControlsFor(this.client.user?.id, i.user.id, cosmetic.id)] });
        } else if (hits.length) {
            await i.editReply(this.searchBrowser.create(i.user.id, query, hits));
        } else {
            await i.editReply({ content: "No matching cosmetics found. Try a shorter name, an artist, a set, or an item type—for example: \u0060renegade\u0060, \u0060Metallica song\u0060, or \u0060C1S9 outfit\u0060. Colour/theme searches only work when the catalog describes them.", allowedMentions: { parse: [] } });
        }
    }

    private async fetchCosmetics(): Promise<CatalogCosmetic[]> {
        let data;
        try {
            const resp = await axios.get("https://fortnite-api.com/v2/cosmetics?responseFlags=7", { timeout: 30000 });
            data = resp.data?.data;
            if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid cosmetic catalog response");
            // Prices only come from verified standalone offers; catalog failure must
            // not erase the working search cache, and shop failure is non-fatal.
            const shop = await axios.get("https://fortnite-api.com/v2/shop?responseFlags=7", { timeout: 10000 }).catch(() => null);
            data = mergeCurrentShop(data, shop?.data?.data);
            try {
                data = mergeFortnitePrices(data, await fortnitePriceService.get());
            } catch (priceError: any) {
                console.warn("Fortnite price fallback unavailable:", priceError?.message ?? priceError);
            }
        } catch (err: any) {
            if (err?.response?.status === 410) {
                console.warn("Fortnite cosmetics endpoint deprecated (410). Returning empty cosmetics list.");
                return this._data || [];
            }
            console.error("Error fetching cosmetics:", err?.message ?? err);
            return this._data || [];
        }

        return normalizeCosmeticCatalog(data || {}).filter(item => item.id.length <= 100);
    }



}
