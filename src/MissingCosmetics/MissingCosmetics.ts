import { selectBRShopArtwork } from "./MissingPreview";
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


import { Client, Message, MessageAttachment, MessageEmbed, TextChannel } from "discord.js";
import axios from "axios";
import { scheduleJob } from "node-schedule";
import itemShopChannels from "../ShopSections/shopSectionChannels.json";
import { createTrackedJob, registerComponent } from "../runtimeDiagnostics";
import { MissingCosmeticImageItem, renderMissingCosmeticsImage } from "./MissingCosmeticsImage";
import { MissingReport, validReportDate } from "./MissingReport";
import { registerMissingReportBrowser } from "./MissingReportBrowser";

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
    newDisplayAsset?: { renderImages?: Array<{ productTag?: string; image?: string }> };
    colors?: { color1?: string; color2?: string; color3?: string; textBackgroundColor?: string };
    tileSize?: string;
    layout?: { name?: string; useWidePreview?: boolean };
    items?: never; // Explicitly removing the old 'items' array
}

// Helper interface to normalize data for your loop
interface NormalizedItem {
    set?: { value?: string; text?: string };
    id: string;
    name: string;
    type: { value: string; displayValue: string };
    shopHistory: string[] | null;
    imageUrl: string | null;
    featuredImageUrl?: string | null;
    featuredImageIsShopArtwork?: boolean;
    rarity?: { displayValue: string };
    introduction?: { text: string };
    price?: number;
    backgroundColors?: string[];
    textBackgroundColor?: string;
    standaloneOffer?: boolean;
    tileSize?: string;
    shopSection?: string;
}

interface BaseItem {
    id: string;
    name: string;
    type: { value: string; displayValue: string };
    shopHistory: string[];
    images?: { icon?: string; featured?: string; smallIcon?: string; small?: string; large?: string };
    rarity?: { displayValue: string };
    introduction?: { text: string };
}

interface TrackItem {
    id: string;
    title: string;
    artist: string;
    shopHistory: string[];
    albumArt?: string;
    // Tracks don't have a standard 'type' object in the same way, so we handle them manually
}

export class MissingCosmetics {
    private lastDailyRunAt: string | null = null;
    private lastDailyItemsMissing = 0;
    private lastDailyShopDate: string | null = null;
    private lastDailyError: string | null = null;

    constructor(private client: Client) {
        registerComponent("missingCosmetics", this);
        registerMissingReportBrowser(client);
        client.on("messageCreate", (message) => {
            if (message.content.toLowerCase() === "c!missing") this.sendMissingCosmetics(message);
        });

        scheduleJob(
            { hour: 0, minute: 0, second: 30, tz: "UTC" },
            createTrackedJob("missing-cosmetics-daily", "Missing Cosmetics Daily Report", "Daily at 00:00:30 UTC", () => this.sendMissingCosmeticsFromTodaysShop()),
        );
    }

    public getDiagnostics() {
        return {
            lastDailyRunAt: this.lastDailyRunAt,
            lastDailyItemsMissing: this.lastDailyItemsMissing,
            lastDailyShopDate: this.lastDailyShopDate,
            lastDailyError: this.lastDailyError,
        };
    }

    public async sendMissingCosmeticsFromTodaysShop(publish = true): Promise<MissingReport | undefined> {
        let shopData: NewShopResponse["data"] | undefined;
        try {
            //  - Switched to the general V2 shop endpoint
            const resp = await axios.get<NewShopResponse>("https://fortnite-api.com/v2/shop?responseFlags=7", { timeout: 30000 });
            shopData = resp.data.data;
            this.lastDailyError = null;
        } catch (err: any) {
            console.error("Error fetching shop for missing cosmetics:", err?.message ?? err);
            this.lastDailyError = err?.message || String(err);
            if (!publish) throw err;
            return;
        }

        if (!shopData || !shopData.entries) return;

        // 1. Flatten and Normalize the polymorphic entries into a single list
        let allItems: NormalizedItem[] = [];
        const standalonePrices = new Map<string, number>();
        for (const entry of shopData.entries) {
            const entryItems = [...(entry.brItems || []), ...(entry.cars || []), ...(entry.instruments || []), ...(entry.tracks || [])];
            if (entryItems.length === 1) standalonePrices.set(entryItems[0].id, entry.finalPrice);
        }

        for (const entry of shopData.entries) {
            const entryItems = [...(entry.brItems || []), ...(entry.cars || []), ...(entry.instruments || []), ...(entry.tracks || [])];
            const shopArtwork = entryItems.length === 1
                ? selectBRShopArtwork(entry.newDisplayAsset?.renderImages)
                : undefined;
            // Extract BR Items (Skins, Pickaxes, Emotes)
            if (entry.brItems) {
                allItems.push(...entry.brItems.map(item => ({ ...item, price: standalonePrices.get(item.id), standaloneOffer: entryItems.length === 1, tileSize: entry.tileSize, shopSection: entry.layout?.name, backgroundColors: [entry.colors?.color1, entry.colors?.color2, entry.colors?.color3].filter(Boolean) as string[], textBackgroundColor: entry.colors?.textBackgroundColor, imageUrl: item.images?.icon || item.images?.featured || shopArtwork || item.images?.large || item.images?.smallIcon || item.images?.small || null, featuredImageUrl: shopArtwork || item.images?.featured || item.images?.icon || null, featuredImageIsShopArtwork: Boolean(shopArtwork) })));
            }
            // Extract Cars
            if (entry.cars) {
                allItems.push(...entry.cars.map(item => ({ ...item, price: standalonePrices.get(item.id), standaloneOffer: entryItems.length === 1, tileSize: entry.tileSize, shopSection: entry.layout?.name, backgroundColors: [entry.colors?.color1, entry.colors?.color2, entry.colors?.color3].filter(Boolean) as string[], textBackgroundColor: entry.colors?.textBackgroundColor, imageUrl: item.images?.icon || shopArtwork || item.images?.large || item.images?.smallIcon || item.images?.small || null, featuredImageUrl: shopArtwork || item.images?.icon || null, featuredImageIsShopArtwork: Boolean(shopArtwork) })));
            }
            // Extract Instruments
            if (entry.instruments) {
                allItems.push(...entry.instruments.map(item => ({ ...item, price: standalonePrices.get(item.id), standaloneOffer: entryItems.length === 1, tileSize: entry.tileSize, shopSection: entry.layout?.name, backgroundColors: [entry.colors?.color1, entry.colors?.color2, entry.colors?.color3].filter(Boolean) as string[], textBackgroundColor: entry.colors?.textBackgroundColor, imageUrl: item.images?.icon || shopArtwork || item.images?.large || item.images?.smallIcon || item.images?.small || null, featuredImageUrl: shopArtwork || item.images?.icon || null, featuredImageIsShopArtwork: Boolean(shopArtwork) })));
            }
            // Extract Jam Tracks (Normalize title -> name)
            if (entry.tracks) {
                const mappedTracks = entry.tracks.map(t => ({
                    id: t.id,
                    name: `${t.artist} - ${t.title}`, // Combine artist and title for name
                    type: { value: 'music', displayValue: 'Jam Track' },
                    shopHistory: t.shopHistory,
                    imageUrl: t.albumArt || null,
                    featuredImageUrl: t.albumArt || null,
                    price: standalonePrices.get(t.id),
                    standaloneOffer: entryItems.length === 1,
                    backgroundColors: [entry.colors?.color1, entry.colors?.color2, entry.colors?.color3].filter(Boolean) as string[],
                    textBackgroundColor: entry.colors?.textBackgroundColor,
                    tileSize: entry.tileSize,
                    shopSection: entry.layout?.name,
                }));
                allItems.push(...mappedTracks);
            }
        }

        // Prefer the standalone offer when an item is also present in a bundle. It carries
        // the item's own price, tile size, and background instead of bundle-level values.
        const offersByItem = new Map<string, NormalizedItem>();
        const offerScore = (item: NormalizedItem) =>
            (item.standaloneOffer ? 16 : 0)
            + (item.price !== undefined ? 8 : 0)
            + (item.backgroundColors?.length ? 4 : 0)
            + (item.tileSize ? 2 : 0)
            + (item.imageUrl ? 1 : 0);
        for (const item of allItems) {
            const current = offersByItem.get(item.id);
            if (!current || offerScore(item) > offerScore(current)) offersByItem.set(item.id, item);
        }

        // Filter out items with no history or weird data
        allItems = Array.from(offersByItem.values()).map(item => ({ ...item,
            shopHistory: [...new Set([...(item.shopHistory || []).filter(value => typeof value === "string").map(value => value.slice(0, 10)), shopData.date.slice(0, 10)])]
                .filter(value => validReportDate(value) && value <= shopData.date.slice(0, 10)).sort(),
        })).filter(item => item.shopHistory.length >= 2 && item.shopHistory[item.shopHistory.length - 1] === shopData.date.slice(0, 10));

        // 2. Sort items by their "Last Seen" date (second to last entry)
        allItems = allItems.sort((a, b) => {
            if (!a.shopHistory || !b.shopHistory) return 0;
            const dateA = new Date(a.shopHistory[a.shopHistory.length - 2]);
            const dateB = new Date(b.shopHistory[b.shopHistory.length - 2]);
            return dateA.getTime() - dateB.getTime(); // Simple timestamp comparison
        });

        let d = "";
        let itemsMissing = 0;
        const missingImageItems: MissingCosmeticImageItem[] = [];

        // Use a Set to avoid duplicate lines if an item is in multiple bundles
        const processedIds = new Set<string>();

        for (const i of allItems) {
            if (processedIds.has(i.id)) continue;
            processedIds.add(i.id);

            if (i.shopHistory) {
                // The logic here checks the 2nd to last date (history before today)
                const date = new Date(`${i.shopHistory[i.shopHistory.length - 2].slice(0, 10)}T00:00:00Z`);
                const shopDate = new Date(`${shopData.date.slice(0, 10)}T00:00:00Z`);

                const differenceInDays = (shopDate.getTime() - date.getTime()) / (1000 * 3600 * 24);

                if (differenceInDays >= 1) {
                    // URL Builder
                    const cleanType = i.type.value.toLowerCase().replace(/ /g, "-");
                    const cleanName = i.name.toLowerCase().replace(/ & /g, "-").replace(/ /g, "-");

                    const lastSeenLabel = date.toLocaleDateString("en-US", { timeZone: "UTC" });
                    const previousShopDates = Array.from(new Set(i.shopHistory.slice(0, -1).map(value => value.slice(0, 10))))
                        .map(value => new Date(`${value}T00:00:00Z`))
                        .sort((a, b) => a.getTime() - b.getTime());
                    let previousRotations = previousShopDates.length ? 1 : 0;
                    let longestPreviousGap = 0;
                    for (let historyIndex = 1; historyIndex < previousShopDates.length; historyIndex++) {
                        const gap = Math.round((previousShopDates[historyIndex].getTime() - previousShopDates[historyIndex - 1].getTime()) / (1000 * 3600 * 24));
                        if (gap > 1) previousRotations++;
                        longestPreviousGap = Math.max(longestPreviousGap, gap);
                    }
                    d += `[${i.name} (${i.type.displayValue})](https://fnbr.co/${cleanType}/${cleanName}): ${Math.round(differenceInDays)} days ago (${lastSeenLabel})\n`;
                    itemsMissing++;
                    missingImageItems.push({
                        id: i.id,
                        setKey: i.set?.value || i.set?.text,
                        name: i.name,
                        type: i.type.displayValue,
                        imageUrl: i.imageUrl,
                        featuredImageUrl: i.featuredImageUrl,
                        featuredImageIsShopArtwork: i.featuredImageIsShopArtwork,
                        fnbrUrl: `https://fnbr.co/${cleanType}/${cleanName}`,
                        daysMissing: Math.round(differenceInDays),
                        lastSeenLabel,
                        rarity: i.rarity?.displayValue,
                        price: i.price,
                        previousAppearances: i.shopHistory.length - 1,
                        introduced: i.introduction?.text,
                        backgroundColors: i.backgroundColors,
                        textBackgroundColor: i.textBackgroundColor,
                        tileSize: i.tileSize,
                        shopSection: i.shopSection,
                        previousRotations,
                        recordReturn: Math.round(differenceInDays) > longestPreviousGap,
                    });
                }
            }
        }

        this.lastDailyRunAt = new Date().toISOString();
        this.lastDailyItemsMissing = itemsMissing;
        this.lastDailyShopDate = shopData?.date || null;

        missingImageItems.sort((a, b) => b.daysMissing - a.daysMissing);
        const report: MissingReport = { date: shopData.date.slice(0, 10), description: "", items: [...missingImageItems] };
        if (!publish) return report;
        // Automatic reports stay at 300 days; the browser computes its own history results.
        const dailyItems = missingImageItems.filter(item => item.daysMissing >= 300);
        missingImageItems.splice(0, missingImageItems.length, ...dailyItems);
        itemsMissing = dailyItems.length;
        this.lastDailyItemsMissing = itemsMissing;
        d = dailyItems.map(item => `[${item.name} (${item.type})](${item.fnbrUrl}): ${item.daysMissing} days ago (${item.lastSeenLabel})`).join("\n");
        if (!d) return report;
        const shopDateLabel = new Date(`${shopData.date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC" });
        const e = new MessageEmbed()
            .setTitle(`Returning Cosmetics for ${shopDateLabel} (${itemsMissing})`)
            .setDescription(d.substring(0, 4096)) // Safety cap for Discord Embed limits
            .setColor("#2186DB");

        let render: Awaited<ReturnType<typeof renderMissingCosmeticsImage>> | null = null;
        try {
            render = await renderMissingCosmeticsImage(missingImageItems, shopDateLabel, "item-shop");
            for (const s of Object.values(itemShopChannels)) {
                const channel = this.client.channels.cache.get(s.channel) as TextChannel;
                if (!channel) continue;
                try {
                    await channel.send({ embeds: [e], files: [new MessageAttachment(render.image, "returning-cosmetics.png")] });
                } catch (error) {
                    console.error(`Error sending missing cosmetics report to channel ${s.channel}:`, error);
                }
            }
        } catch (error: any) {
            console.error("Error rendering missing cosmetics image; sending the embed without artwork:", error?.message ?? error);
            this.lastDailyError = error?.message || String(error);
            for (const s of Object.values(itemShopChannels)) {
                const channel = this.client.channels.cache.get(s.channel) as TextChannel;
                if (channel) await channel.send({ embeds: [e] }).catch(console.error);
            }
        } finally {
            await render?.close().catch(error => console.error("Error closing missing cosmetics browser:", error));
        }
        return report;
    }

    public async sendMissingCosmetics(message: Message) {
        let r;
        try {
            // UPDATED URL: Fetching from the root /v2/cosmetics endpoint
            r = await axios.get("https://fortnite-api.com/v2/cosmetics/?responseFlags=7");
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
