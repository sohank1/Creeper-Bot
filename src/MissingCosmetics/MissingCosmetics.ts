// import { Client, Message, MessageEmbed, TextChannel } from "discord.js";
// import axios from "axios";
// import { scheduleJob } from "node-schedule";
// import { CombinedItemShopResponseObject, Entry } from "./CombinedItemShop.type";
// import { sortingPriorities } from "../Fortnite";
// import itemShopChannels from "../ShopSections/shopSectionChannels.json"

// export class MissingCosmetics {
//     constructor(private client: Client) {
//         client.on("messageCreate", (message) => {
//             if (message.content.toLowerCase() === "c!missing") this.sendMissingCosmetics(message);
//         });

//         scheduleJob({ hour: 0, minute: 0, second: 30, tz: "UTC" }, () => this.sendMissingCosmeticsFromTodaysShop());
//     }

//     public async sendMissingCosmeticsFromTodaysShop() {
//         let shop: CombinedItemShopResponseObject["data"] | undefined;
//         try {
//             const resp = await axios.get<CombinedItemShopResponseObject>("https://fortnite-api.com/v2/shop/br/combined?responseFlags=7");
//             shop = resp.data.data;
//         } catch (err: any) {
//             if (err?.response?.status === 410) {
//                 console.warn("Fortnite API shop endpoint deprecated (410). Skipping missing cosmetics run.");
//                 return;
//             }
//             console.error("Error fetching shop for missing cosmetics:", err?.message ?? err);
//             return;
//         }

//         const allSections = <Entry[]>[...(shop.daily?.entries || []), ...(shop.featured?.entries || []), ...(shop.votes ? shop.votes : []), ...(shop.voteWinners ? shop.voteWinners : [])];
//         let allItems = allSections.map((s) => s.items).flat()

//         allItems = [...allItems].sort((a, b) => {
//             if (new Date(a.shopHistory[a.shopHistory.length - 2]) > new Date(b.shopHistory[b.shopHistory.length - 2])) return 1
//             if (new Date(a.shopHistory[a.shopHistory.length - 2]) < new Date(b.shopHistory[b.shopHistory.length - 2])) return -1
//         })

//         let d = "";
//         let itemsMissing = 0;
//         for (const i of allItems) {
//             if (i.shopHistory) {
//                 const date = new Date(i.shopHistory[i.shopHistory.length - 2]);

//                 const differenceInDays = (Date.now() - date.getTime()) / (1000 * 3600 * 24);
//                 if (differenceInDays >= 300) {
//                     d += `[${i.name} (${i.type.displayValue})](https://fnbr.co/${i.type.value.toLowerCase().replaceAll(" ", "-")}/${i.name.toLowerCase().replaceAll(" & ", "-").replaceAll(" ", "-")}): ${Math.round(differenceInDays)} days ago (${date.toLocaleDateString("en-US", { timeZone: "America/New_York" })})\n`
//                     itemsMissing++
//                 }
//             }
//         }

//         if (!d) return;

//         const e = new MessageEmbed()
//             .setTitle(`Returning Cosmetics for ${new Date(shop.date).toLocaleDateString("en-US", { timeZone: "America/New_York" })} (${itemsMissing}/${allItems.length})`)
//             .setDescription(d)
//             .setColor("#2186DB")

//         for (const s of Object.values(itemShopChannels))
//             (<TextChannel>this.client.channels.cache.get(s.channel))?.send({ embeds: [e] })

//     }

//     public async sendMissingCosmetics(message: Message) {
//         let r;
//         try {
//             r = await axios.get("https://fortnite-api.com/v2/cosmetics/br?responseFlags=7");
//         } catch (err: any) {
//             if (err?.response?.status === 410) {
//                 return message.channel.send("Error: Cosmetics endpoint deprecated (410). Please update the API usage.");
//             }
//             console.error("Error fetching cosmetics:", err?.message ?? err);
//             return message.channel.send("Error fetching cosmetics. Check logs.");
//         }

//         let missing = [];
//         (r.data?.data || []).forEach((c: any) => {
//             if (c.shopHistory && c.shopHistory.length) {
//                 const date = new Date(c.shopHistory[c.shopHistory.length - 1]);

//                 const differenceInDays = (Date.now() - date.getTime()) / (1000 * 3600 * 24);
//                 if (differenceInDays >= 300) missing.push(c);
//             }
//         });

//         console.log(`missing: ${missing}. There are ${missing.length} missing cosmetics (haven't been seen in 300 days or more)`);
//         missing = missing.sort((a, b) => {
//             if (new Date(a.shopHistory[a.shopHistory.length - 1]) > new Date(b.shopHistory[b.shopHistory.length - 1])) return 1
//             if (new Date(a.shopHistory[a.shopHistory.length - 1]) < new Date(b.shopHistory[b.shopHistory.length - 1])) return -1
//         })
//         missing.forEach((e, i) =>
//             message.channel.send(
//                 `${i}/${missing.length} Missing ${e.name} ${e.images.icon} Last Seen: ${new Date(e.shopHistory[e.shopHistory.length - 1]).toLocaleString("en-US", { timeZone: "America/New_York" })} There are ${missing.length} missing cosmetics (haven't been seen in 300 days or more)`,
//             ),
//         );
//     }
// }


import { Client, Message, MessageEmbed, TextChannel } from "discord.js";
import axios from "axios";
import { scheduleJob } from "node-schedule";
import itemShopChannels from "../ShopSections/shopSectionChannels.json";
import { fortniteApiUrl } from "../Fortnite/fortniteApi";

// --- NEW INTERFACES BASED ON V2 API ---
interface NewShopResponse {
    status: number;
    data: {
        hash: string;
        date: string;
        entries: ShopEntry[];
    };
}

interface ShopEntry {
    regularPrice: number;
    finalPrice: number;
    brItems?: BaseItem[];
    tracks?: TrackItem[];
    cars?: BaseItem[];
    instruments?: BaseItem[];
    items?: never; // Explicitly removing the old 'items' array
}

// Helper interface to normalize data for your loop
interface NormalizedItem {
    id: string;
    name: string;
    type: { value: string; displayValue: string };
    shopHistory: string[] | null;
}

interface BaseItem {
    id: string;
    name: string;
    type: { value: string; displayValue: string };
    shopHistory: string[];
}

interface TrackItem {
    id: string;
    title: string;
    artist: string;
    shopHistory: string[];
    // Tracks don't have a standard 'type' object in the same way, so we handle them manually
}

export class MissingCosmetics {
    constructor(private client: Client) {
        client.on("messageCreate", (message) => {
            if (message.content.toLowerCase() === "c!missing") this.sendMissingCosmetics(message);
        });

        scheduleJob({ hour: 0, minute: 0, second: 30, tz: "UTC" }, () => this.sendMissingCosmeticsFromTodaysShop());
    }

    public async sendMissingCosmeticsFromTodaysShop() {
        let shopData: NewShopResponse["data"] | undefined;
        try {
            //  - Switched to the general V2 shop endpoint
            const resp = await axios.get<NewShopResponse>(fortniteApiUrl("/v2/shop?responseFlags=7"));
            shopData = resp.data.data;
        } catch (err: any) {
            console.error("Error fetching shop for missing cosmetics:", err?.message ?? err);
            return;
        }

        if (!shopData || !shopData.entries) return;

        // 1. Flatten and Normalize the polymorphic entries into a single list
        let allItems: NormalizedItem[] = [];

        for (const entry of shopData.entries) {
            // Extract BR Items (Skins, Pickaxes, Emotes)
            if (entry.brItems) {
                allItems.push(...entry.brItems);
            }
            // Extract Cars
            if (entry.cars) {
                allItems.push(...entry.cars);
            }
            // Extract Instruments
            if (entry.instruments) {
                allItems.push(...entry.instruments);
            }
            // Extract Jam Tracks (Normalize title -> name)
            if (entry.tracks) {
                const mappedTracks = entry.tracks.map(t => ({
                    id: t.id,
                    name: `${t.artist} - ${t.title}`, // Combine artist and title for name
                    type: { value: 'music', displayValue: 'Jam Track' },
                    shopHistory: t.shopHistory
                }));
                allItems.push(...mappedTracks);
            }
        }

        // Filter out items with no history or weird data
        allItems = allItems.filter(i => i.shopHistory && i.shopHistory.length >= 2);

        // 2. Sort items by their "Last Seen" date (second to last entry)
        allItems = allItems.sort((a, b) => {
            if (!a.shopHistory || !b.shopHistory) return 0;
            const dateA = new Date(a.shopHistory[a.shopHistory.length - 2]);
            const dateB = new Date(b.shopHistory[b.shopHistory.length - 2]);
            return dateA.getTime() - dateB.getTime(); // Simple timestamp comparison
        });

        let d = "";
        let itemsMissing = 0;

        // Use a Set to avoid duplicate lines if an item is in multiple bundles
        const processedIds = new Set<string>();

        for (const i of allItems) {
            if (processedIds.has(i.id)) continue;
            processedIds.add(i.id);

            if (i.shopHistory) {
                // The logic here checks the 2nd to last date (history before today)
                const date = new Date(i.shopHistory[i.shopHistory.length - 2]);

                const differenceInDays = (Date.now() - date.getTime()) / (1000 * 3600 * 24);

                if (differenceInDays >= 300) {
                    // URL Builder
                    const cleanType = i.type.value.toLowerCase().replace(/ /g, "-");
                    const cleanName = i.name.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-");

                    d += `[${i.name} (${i.type.displayValue})](https://fnbr.co/${cleanType}/${cleanName}): ${Math.round(differenceInDays)} days ago (${date.toLocaleDateString("en-US", { timeZone: "America/New_York" })})\n`;
                    itemsMissing++;
                }
            }
        }

        if (!d) return;

        const e = new MessageEmbed()
            .setTitle(`Returning Cosmetics for ${new Date(shopData.date).toLocaleDateString("en-US", { timeZone: "America/New_York" })} (${itemsMissing})`)
            .setDescription(d.substring(0, 4096)) // Safety cap for Discord Embed limits
            .setColor("#2186DB");

        for (const s of Object.values(itemShopChannels)) {
            const channel = this.client.channels.cache.get(s.channel) as TextChannel;
            if (channel) channel.send({ embeds: [e] }).catch(console.error);
        }
    }

    public async sendMissingCosmetics(message: Message) {
        let r;
        try {
            // UPDATED URL: Fetching from the root /v2/cosmetics endpoint
            r = await axios.get(fortniteApiUrl("/v2/cosmetics/?responseFlags=7"));
        } catch (err: any) {
            if (err?.response?.status === 410) {
                return message.channel.send("Error: Cosmetics endpoint deprecated (410). Please update the API usage.");
            }
            console.error("Error fetching cosmetics:", err?.message ?? err);
            return message.channel.send("Error fetching cosmetics. Check logs.");
        }

        // --- NEW LOGIC: FLATTEN THE CATEGORIES ---
        const data = r.data?.data || {};

        let allCosmetics: any[] = [];

        // Combine standard categories
        if (data.br) allCosmetics.push(...data.br);
        if (data.cars) allCosmetics.push(...data.cars);
        if (data.instruments) allCosmetics.push(...data.instruments);
        if (data.lego) allCosmetics.push(...data.lego);
        if (data.beans) allCosmetics.push(...data.beans); // Fall Guys beans

        // Handle Tracks specifically to format their names (Artist - Title)
        if (data.tracks) {
            const formattedTracks = data.tracks.map((t: any) => ({
                ...t,
                name: (t.artist && t.title) ? `${t.artist} - ${t.title}` : t.name,
                type: { value: 'music', displayValue: 'Jam Track' }
            }));
            allCosmetics = [...allCosmetics, ...formattedTracks];
        }

        // --- FILTERING LOGIC (SAME AS BEFORE) ---
        let missing: any[] = [];

        allCosmetics.forEach((c: any) => {
            if (c.shopHistory && c.shopHistory.length) {
                // Use the last known shop appearance
                const date = new Date(c.shopHistory[c.shopHistory.length - 1]);
                const differenceInDays = (Date.now() - date.getTime()) / (1000 * 3600 * 24);

                if (differenceInDays >= 300) missing.push(c);
            }
        });

        console.log(`missing: ${missing.length}. There are ${missing.length} missing cosmetics (haven't been seen in 300 days or more)`);

        // Sort by oldest last seen first
        missing = missing.sort((a, b) => {
            const dateA = new Date(a.shopHistory[a.shopHistory.length - 1]);
            const dateB = new Date(b.shopHistory[b.shopHistory.length - 1]);
            // Compare timestamps (older dates are smaller numbers)
            if (dateA > dateB) return 1;
            if (dateA < dateB) return -1;
            return 0;
        });

        // --- SEND MESSAGES (SAME AS BEFORE) ---
        // Note: Be careful with loop limits here to avoid rate limits
        missing.forEach((e, i) =>
            message.channel.send(
                `${i + 1}/${missing.length} Missing ${e.name} ${e.images?.icon || e.images?.small || 'No Icon'} Last Seen: ${new Date(e.shopHistory[e.shopHistory.length - 1]).toLocaleString("en-US", { timeZone: "America/New_York" })} There are ${missing.length} missing cosmetics (haven't been seen in 300 days or more)`,
            ),
        );
    }
}