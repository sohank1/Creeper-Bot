import axios from "axios";
import { Client, MessageEmbed, TextChannel } from "discord.js";
import ShopSectionsModel from "./ShopSections.model";
import { ShopSectionsData, ShopSectionsResponseObject } from "./ShopSections.type";
import shopSectionChannels from "./shopSectionChannels.json"

export class ShopSectionsTracker {
    constructor(private client: Client) {
        this.interval();
        setInterval(() => this.interval(), 15000); // 15 seconds used to be 30 seconds
    }

    private async interval(): Promise<void> {
        console.log("ShopSectionsTracker: Inside interval");

        const { data } = (await axios.get<ShopSectionsResponseObject>("https://fn-api.com/api/shop/br/sections")).data
        const doc = await ShopSectionsModel.findOne()
        console.log("ShopSectionsTracker: Awaited doc fetch");


        if (new Date(data.updated) > doc.updatedAt) {
            console.log("ShopSectionsTracker: There is new data. The date that the data was updated is greater than the date that we have in the db.");
            this.sendMessage(data)
            await ShopSectionsModel.updateOne({ updatedAt: new Date(data.updated) })
        }
    }

    private sendMessage(d: ShopSectionsData): void {
        let totalAmountOfSections = 0;
        const largestSection = d.sections.reduce((prev, current) => prev.quantity > current.quantity ? prev : current);

        const e = new MessageEmbed()
            .setTitle("Shop Sections were updated!")
            .setColor("#2186DB")
            .setFooter({ text: `Updated at ${new Date(d.updated).toLocaleString("en-US", { timeZone: "America/New_York" })}` });

        let desc = "";
        for (const s of d.sections) {
            desc += `${s.name} (x${s.quantity})\n`;
            totalAmountOfSections += s.quantity;
        }

        e.setDescription(desc);

        for (const s of Object.values(shopSectionChannels)) {
            const c = (<TextChannel>this.client.channels.cache.get(s.channel));

            c?.send({ embeds: [e] }).then(m => {
                if (totalAmountOfSections >= 20) {
                    m.react("🤑");

                    const highestSameSections = d.sections.filter((s) => s.quantity === largestSection.quantity);
                    // if there is only 1 section that has the most items
                    if (highestSameSections.length === 1) c.send(`They hungry for ${largestSection.name}`);
                    else c?.send("They hungry!!!")
                }
            })
        }
    }

}
