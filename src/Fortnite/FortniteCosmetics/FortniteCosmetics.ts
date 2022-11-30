import axios from "axios";
import Fuse from 'fuse.js'
import { ApplicationCommandOptionChoice, AutocompleteInteraction, BaseCommandInteraction, CacheType, Client, MessageAttachment, MessageEmbed, TextChannel } from "discord.js";
import { Cosmetic, Cosmetics, CosmeticsResponse } from "./FortniteCosmetics.type"
import { rarityColorTable, rarityEmojisTable } from "./rarityEmojisTable";
import { scheduleJob } from "node-schedule";
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
    private _data: Cosmetics;

    constructor(private client: Client) {
        this.fetchCosmetics().then(d => this._data = d);

        scheduleJob({ minute: 10, second: 0 }, () => {
            // const c = (<TextChannel>client.channels.cache.get('1045086199053820004')) || (<TextChannel>client.channels.cache.get("725143127723212830"))
            console.log("fetching cosmetics...");
            this.fetchCosmetics().then(d => this._data = d);

        })

        this.client.on("interactionCreate", (i) => {
            console.log(i.type)

            if (i.isCommand() && i.options?.getSubcommand(false) !== "cosmetic") return

            console.time("cosmetic-search")
            if (i.isAutocomplete()) this.resolveSearchQuery(i);

            if (i.isApplicationCommand()) return this.replyEmbed(i);

            console.timeEnd("cosmetic-search")
        })
    }

    private async resolveSearchQuery(i: AutocompleteInteraction<CacheType>): Promise<void> {

        if (!this._data) return i.respond([{ name: "Loading...", value: LOADING_STRING }]);

        const query = <string>i.options.getFocused(true).value;
        if (query === "") return this.respondWithNewCosmetics(i);

        const fuse = new Fuse(this._data, {
            ignoreLocation: true, ignoreFieldNorm: true,
            keys: [
                { name: "name", weight: 0.5 },
                { name: "description", weight: 0.3 },
                { name: "introduction.text", weight: 0.3 },
                { name: "rarity.displayValue", weight: 0.3 },
                { name: "type.displayValue", weight: 0.3 },
                { name: "set.text", weight: 0.3 },
                { name: "id", weight: 0.3 },
            ]
        });
        const results = fuse.search(query)

            //   { name: "name", weight: 1 },
            // { name: "description", weight: 1.4 },
            // { name: "introduction.text", weight: 1.1 },
            // { name: "rarity.displayValue", weight: 1.5 },
            // { name: "type.displayValue", weight: 1.1 },
            // { name: "set.text", weight: 5 },
            // { name: "id", weight: 0.1 },

            // .map(r => ({ name: `${rarityEmojisTable[r.item.rarity.value] || ""} ${r.item.name || r.item.id || ""} (${r.item.introduction?.text}) (${r.item.type.displayValue})`, value: r.item.id }))
            .map(r => this.formatAutoCompleteResponse(r.item))
            .slice(0, 25);

        console.log('respoding with results', results)
        i.channel.send(`searched for: ${query}`)
        return i.respond(results)
    }

    public respondWithNewCosmetics(i: AutocompleteInteraction<CacheType>): void | Promise<void> {
        // const newItems = [...this._data].sort((a, b) => {
        //     return (new Date(a.added) > new Date(b.added) ? -1 : 1) || (a.type.value === "outfit" && b.type.value !== "outfit" ? -1 : 1)
        // })
        const newItems = [...this._data].sort((a, b) => {
            // let s = 0;
            if (new Date(a.added) > new Date(b.added)) return -1
            if (new Date(a.added) < new Date(b.added)) return 1
            // if (a.type.value === "outfit" && b.type.value !== "outfit") return -1
            // if (a.type.value === "backpack" && b.type.value !== "backpack") return -2
            return sortingPriorities[a.type.value] - sortingPriorities[b.type.value];

            // if (!priorities[a.type.value] || !priorities[b.type.value]) console.log(a.type.value, b.type.value)
            // console.log(s)
            // return s
        })
            .map(c => this.formatAutoCompleteResponse(c))
            .slice(0, 25)
        // console.log(newItems)
        return i.respond(newItems)
    }

    private formatAutoCompleteResponse(c: Cosmetic): ApplicationCommandOptionChoice {
        return { name: `${rarityEmojisTable[c.rarity.value] || ""} ${c.name} ${rarityEmojisTable[c.type.value] || ""}`, value: c.id }
    }


    private async replyEmbed(i: BaseCommandInteraction<CacheType>): Promise<void> {
        const query = i.options.get("query").value;
        if (!this._data || query === LOADING_STRING) return i.reply({ content: LOADING_STRING, ephemeral: true });

        const cosmetic = this._data.find(c => c.id === query)
        if (!cosmetic) return i.reply({ content: `Could not find: \`${query}\` `, ephemeral: true });

        const image = new MessageAttachment(cosmetic.images.featured || cosmetic.images.icon || cosmetic.images.smallIcon).setName(`${cosmetic.id}.png`);

        const e = new MessageEmbed()
        e.setTitle(cosmetic.name)
        cosmetic.description && e.addField("Description", cosmetic.description)
        e.setImage(`attachment://${cosmetic.id}.png`)
        e.addField("Type", cosmetic.type.displayValue, true)
        e.addField("Rarity", cosmetic.rarity.displayValue, true)
        cosmetic.set?.text && e.addField("Set", cosmetic.set.text)
        cosmetic.introduction?.text && e.addField("Introduction", cosmetic.introduction.text);

        let features = [];
        cosmetic.gameplayTags?.join().includes("Emote.Traversal") && features.push("Traversal")
        cosmetic.gameplayTags?.join().includes("BuiltIn") && features.push("Built In")
        cosmetic.gameplayTags?.join().includes("Cosmetics.UserFacingFlags.Synced") && features.push("Synced")
        cosmetic.gameplayTags?.join().includes("Reactive") && features.push("Reactive")

        features.length && e.addField("Features", features.join(", "))
        e.addField("Added to Files On", new Date(cosmetic.added).toLocaleDateString(), true)

        cosmetic.gameplayTags?.join().includes("BattlePass.Free") && e.addField("Battle Pass", cosmetic.introduction ? `Obtained in the Chapter ${cosmetic.introduction?.chapter}, Season ${cosmetic.introduction?.season} Battle Pass for free.` : `Obtained in the Battle Pass for free.`);
        cosmetic.gameplayTags?.join().includes("BattlePass.Paid") && e.addField("Battle Pass", cosmetic.introduction ? `Obtained in the paid Chapter ${cosmetic.introduction?.chapter}, Season ${cosmetic.introduction?.season} Battle Pass.` : `Obtained in the paid Battle Pass.`)


        // e.setColor("#2186DB")
        //@ts-ignore

        e.setColor(`#${cosmetic.series?.colors[(cosmetic.series.value === "Frozen Series") ? 2 : 1].slice(0, -2) || rarityColorTable[cosmetic.rarity.value] || "FFFFFF"}`)

        if (cosmetic.shopHistory) {
            const lastSeenAt = new Date(cosmetic.shopHistory[cosmetic.shopHistory.length - 1])
            const differenceInDays = Math.round((Date.now() - lastSeenAt.getTime()) / (1000 * 3600 * 24));
            // e.addField("Last Seen", `${differenceInDays} day${differenceInDays > 1 ? 's' : ''} ago (${lastSeenAt.toLocaleDateString()})`)
            e.addField("Recent Shop History", cosmetic.shopHistory.map(d => `${new Date(d).toLocaleDateString()} (${Math.round((Date.now() - new Date(d).getTime()) / (1000 * 3600 * 24))} days ago)`).reverse().slice(0, 5).join("\n"))
            e.addField("Occurrences", cosmetic.shopHistory.length.toString())
        }

        i.reply({ embeds: [e], ...(image.attachment && { files: [image] }) });
    }

    private async fetchCosmetics(): Promise<Cosmetics> {
        const { data } = (await axios.get("https://fortnite-api.com/v2/cosmetics/br")).data
        // const data = cosmeticsData.data;

        // replace string "null" with null


        return this.formatCosmetics(data);
    }

    private formatCosmetics(cosmetics: Cosmetics): Cosmetics {
        return cosmetics.map(c => {
            const newC = { ...c };
            if (c.name === "null" || c.name === "Banner") newC.name = c.id || "No name";
            if (c.description === "null") newC.description = null;

            return newC;
        })
    }


}
