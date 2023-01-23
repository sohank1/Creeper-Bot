import axios from "axios";
import { Client, MessageEmbed, TextChannel } from "discord.js";
import ShopSectionsModel from "./ShopSections.model";
import { AllShopSectionsResponseObject, EpicModesResponseObject, FormatedSections, SectionStoreEnds } from "./ShopSections.type";
import shopSectionChannels from "./shopSectionChannels.json"

export class ShopSectionsTracker {
    constructor(private client: Client) {
        this.interval();
        setInterval(() => this.interval(), 15000); // 15 seconds used to be 30 seconds
    }

    private async interval(): Promise<void> {
        await ShopSectionsModel.updateOne({ sections: null })
        const shopSections = (await axios.get<EpicModesResponseObject>("https://api.nitestats.com/v1/epic/modes-smart")).data.channels["client-events"].states[1].state.sectionStoreEnds;
        const doc = await ShopSectionsModel.findOne();
        console.log("shopSections", shopSections)
        console.log("doc.sections", doc.sections)
        if (JSON.stringify(shopSections) !== JSON.stringify(doc.sections)) {
            this.sendMessage(await this.formatSections(shopSections))
            await ShopSectionsModel.updateOne({ sections: shopSections })
        }

    }

    private async formatSections(sections: SectionStoreEnds): Promise<FormatedSections> {
        const allShopSections = (await axios.get<AllShopSectionsResponseObject>("https://fortnitecontent-website-prod07.ol.epicgames.com/content/api/pages/fortnite-game/shop-sections")).data.sectionList.sections;
        const formatedData: FormatedSections = [];

        console.log(`section's that don't have a display name ${allShopSections.filter(s => !s.sectionDisplayName).map(s => s.sectionId)}`)

        // for (const s in sections) {
        //     const sectionWithMetadata = allShopSections.find((section) => section.sectionId === s);
        //     if (!sectionWithMetadata.sectionDisplayName) sectionWithMetadata.sectionDisplayName = "Featured";

        //     const alreadyFormatedSection = formatedData.find((s) => s.name === sectionWithMetadata.sectionDisplayName);

        //     alreadyFormatedSection
        //         ? alreadyFormatedSection.quantity++
        //         : formatedData.push({ name: sectionWithMetadata.sectionDisplayName, quantity: 1 });
        // }

        const sectionIds = Object.keys(sections);
        for (const metaDataSection of allShopSections) {
            const s = sectionIds.find((id => id === metaDataSection.sectionId));
            if (!s) continue; // if the section from epic game's metadata api is not in the stop then go to the next section from epic game's metadata api

            if (metaDataSection.sectionId.includes("Special")) metaDataSection.sectionDisplayName = "More Offers";
            if (!metaDataSection.sectionDisplayName) metaDataSection.sectionDisplayName = metaDataSection.sectionId.slice(0, metaDataSection.sectionId.length - 1);

            const alreadyFormatedSection = formatedData.find((s) => s.name === metaDataSection.sectionDisplayName);

            alreadyFormatedSection
                ? alreadyFormatedSection.quantity++
                : formatedData.push({ name: metaDataSection.sectionDisplayName, quantity: 1 });

        }


        return formatedData;
    }


    private sendMessage(sections: FormatedSections): void {
        let totalAmountOfSections = 0;
        const largestSection = sections.reduce((prev, current) => prev.quantity > current.quantity ? prev : current);

        const e = new MessageEmbed()
            .setColor("#2186DB")
            .setFooter({ text: `Updated at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}` });

        let desc = "";
        for (const s of sections) {
            desc += `${s.name} (x${s.quantity})\n`;
            totalAmountOfSections += s.quantity;
        }

        e.setDescription(desc).setTitle(`Shop Sections were updated! (x${totalAmountOfSections})`);

        for (const s of Object.values(shopSectionChannels)) {
            const c = (<TextChannel>this.client.channels.cache.get(s.channel));

            c?.send({ embeds: [e] }).then(m => {
                if (totalAmountOfSections >= 20) {
                    m.react("🤑");

                    const highestSameSections = sections.filter((s) => s.quantity === largestSection.quantity);
                    // if there is only 1 section that has the most items
                    if (highestSameSections.length === 1) c.send(`They hungry for ${largestSection.name}`);
                    else c?.send("They hungry!!!")
                }
            })
        }
    }

}
