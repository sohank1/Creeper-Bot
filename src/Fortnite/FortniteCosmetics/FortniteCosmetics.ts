import axios from "axios";
import Fuse from 'fuse.js'
import { AutocompleteInteraction, BaseCommandInteraction, CacheType, Client, MessageEmbed } from "discord.js";
import { Cosmetics, CosmeticsResponse, RarityValue } from "./FortniteCosmetics.type"
const cosmeticsData = <CosmeticsResponse>require("./cosmetics.json");

const rarityEmoji: Record<RarityValue, string> = {
    "common": "⚪",
    "uncommon": "🟢",
    "rare": "🔵",
    "epic": "🟣",
    "legendary": "🟠",
    "marvel": "🔴",
    "starwars": "✨",
    backpack: "",
    banner: "",
    contrail: "",
    dark: "",
    dc: "",
    emoji: "",
    emote: "",
    frozen: "",
    gaminglegends: "",
    glider: "",
    icon: "",
    lava: "",
    loadingscreen: "",
    music: "",
    mythic: "",
    outfit: "",
    pet: "",
    petcarrier: "",
    pickaxe: "",
    shadow: "",
    slurp: "",
    spray: "",
    toy: "",
    wrap: ""
}

export class FortniteCosmetics {
    private _data: Cosmetics;

    constructor(private client: Client) {
        const emoji = client.emojis.cache.find(e => e.name.includes("6f4d233839e9ea4178dcefed5bdc3d48"));
        console.log(emoji.id);

        console.log(emoji.toString())

        this.fetchCosmetics().then(d => this._data = d)

        this.client.on("interactionCreate", (i) => {
            console.log(i.type)

            if (i.isCommand() && i.options?.getSubcommand(false) !== "cosmetic") return
            if (i.isAutocomplete()) this.resolveSearchQuery(i);

            if (i.isApplicationCommand()) return this.replyEmbed(i);
        })

    }

    private async resolveSearchQuery(i: AutocompleteInteraction<CacheType>): Promise<void> {
        if (!cosmeticsData) return;
        const query = <string>i.options.getFocused(true).value;

        const fuse = new Fuse(this._data, {
            ignoreLocation: true, ignoreFieldNorm: true, keys: [
                { name: "name", weight: 1 },
                { name: "description", weight: 1.4 },
                { name: "introduction.text", weight: 1.1 },
                { name: "rarity.displayValue", weight: 1.5 },
                { name: "type.displayValue", weight: 1.1 },
                { name: "set.text", weight: 5 },
                { name: "id", weight: 0.1 },
            ]
        });
        const results = fuse.search(query)

            // { name: "name", weight: 1 },
            // { name: "description", weight: 1.4 },
            // { name: "introduction.text", weight: 1.1 },
            // { name: "rarity.displayValue", weight: 1.1 },
            // { name: "type.displayValue", weight: 1.1 },
            // { name: "set.text", weight: 5 },

            .map(r => ({ name: `${rarityEmoji[r.item.rarity.value]} ${r.item.name} (${r.item.type.displayValue})`, value: r.item.id }))
            .slice(0, 25);

        console.log(results.map(r => [r.name,]))
        return i.respond(results)



    }

    private async replyEmbed(i: BaseCommandInteraction<CacheType>): Promise<void> {
        const cosmetic = this._data.find(c => c.id === i.options.get("query").value)
        if (!cosmetic) return i.reply({ "content": "Cosmetic was not found" });

        const e = new MessageEmbed()
            .setTitle(cosmetic.name)
            .setImage(cosmetic.images.featured || cosmetic.images.icon || cosmetic.images.smallIcon)
            .addField("Description", cosmetic.description)
            .addField("Type", cosmetic.type.displayValue, true)
            .addField("Rarity", cosmetic.rarity.displayValue, true)
            .addField("Set", cosmetic.set.text)
            .addField("Introduction", cosmetic.introduction.text, true)
            .setColor("#2186DB")
            .setFooter({ text: `${cosmetic.name} was added at ${new Date(cosmetic.added).toLocaleString("en-US", { timeZone: "America/New_York" })}` });
        cosmetic.shopHistory && e.addField("Last Seen", `${new Date(cosmetic.shopHistory[cosmetic.shopHistory.length - 1]).toLocaleString("en-US", { timeZone: "America/New_York" })} EST`)
        return i.reply({ embeds: [e] });
    }

    private async fetchCosmetics(): Promise<any> {
        // const { data } = await axios.get("https://fortnite-api.com/v2/cosmetics/br")
        const data = cosmeticsData.data;
        return data;
        // return [...new Map(data.map((m) => [m.name, m])).values()];
    }

}