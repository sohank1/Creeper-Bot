import { Client, Message, MessageEmbed, TextChannel } from "discord.js";
import axios from "axios";
import { scheduleJob } from "node-schedule";
import { CombinedItemShopResponseObject, Entry } from "./CombinedItemShop.type";
import { sortingPriorities } from "../Fortnite";
import itemShopChannels from "../ShopSections/shopSectionChannels.json"

export class MissingCosmetics {
    constructor(private client: Client) {
        client.on("messageCreate", (message) => {
            if (message.content.toLowerCase() === "c!missing") this.sendMissingCosmetics(message);
        });

        scheduleJob({ hour: 0, minute: 0, second: 30, tz: "UTC" }, () => this.sendMissingCosmeticsFromTodaysShop());
    }

    public async sendMissingCosmeticsFromTodaysShop() {
        const { data: { data: shop } } = await axios.get<CombinedItemShopResponseObject>("https://fortnite-api.com/v2/shop/br/combined");
        const allSections = <Entry[]>[...shop.daily.entries, ...shop.featured.entries, ...(shop.votes ? shop.votes : []), ...(shop.voteWinners ? shop.voteWinners : []),];
        let allItems = allSections.map((s) => s.items).flat()

        allItems = [...allItems].sort((a, b) => {
            if (new Date(a.shopHistory[a.shopHistory.length - 2]) > new Date(b.shopHistory[b.shopHistory.length - 2])) return 1
            if (new Date(a.shopHistory[a.shopHistory.length - 2]) < new Date(b.shopHistory[b.shopHistory.length - 2])) return -1
        })

        let d = "";
        let itemsMissing = 0;
        for (const i of allItems) {
            if (i.shopHistory) {
                const date = new Date(i.shopHistory[i.shopHistory.length - 2]);

                const differenceInDays = (Date.now() - date.getTime()) / (1000 * 3600 * 24);
                if (differenceInDays >= 300) {
                    d += `[${i.name} (${i.type.displayValue})](https://fnbr.co/${i.type.value.toLowerCase().replaceAll(" ", "-")}/${i.name.toLowerCase().replaceAll(" & ", "-").replaceAll(" ", "-")}): ${Math.round(differenceInDays)} days ago (${date.toLocaleDateString("en-US", { timeZone: "America/New_York" })})\n`
                    itemsMissing++
                }
            }
        }

        if (!d) return;

        const e = new MessageEmbed()
            .setTitle(`Returning Cosmetics for ${new Date(shop.date).toLocaleDateString("en-US", { timeZone: "America/New_York" })} (${itemsMissing}/${allItems.length})`)
            .setDescription(d)
            .setColor("#2186DB")

        for (const s of Object.values(itemShopChannels))
            (<TextChannel>this.client.channels.cache.get(s.channel))?.send({ embeds: [e] })

    }

    public async sendMissingCosmetics(message: Message) {
        const r = await axios.get("https://fortnite-api.com/v2/cosmetics/br");

        const missing = [];
        r.data.data.forEach((c, i) => {
            if (c.shopHistory) {
                const date = new Date(c.shopHistory[c.shopHistory.length - 1]);

                const differenceInDays = (Date.now() - date.getTime()) / (1000 * 3600 * 24);
                if (differenceInDays >= 300) missing.push(c);
            }
        });

        console.log(`missing: ${missing}. There are ${missing.length} missing cosmetics (haven't been seen in 300 days or more)`);

        missing.forEach((e, i) =>
            message.channel.send(
                `${i}/${missing.length} Missing ${e.name} ${e.images.icon} Last Seen: ${new Date(e.shopHistory[e.shopHistory.length - 1]).toLocaleString("en-US", { timeZone: "America/New_York" })} There are ${missing.length} missing cosmetics (haven't been seen in 300 days or more)`,
            ),
        );
    }
}
