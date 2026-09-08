import axios from "axios";
import { randomBytes, createHash } from "crypto";
import { Client, MessageActionRow, MessageEmbed, MessageSelectMenu } from "discord.js";
import { scheduleJob } from "node-schedule";
import { createTrackedJob, registerComponent } from "../../runtimeDiagnostics";
import { buildCosmeticEmbed, CatalogCosmetic, cosmeticTypeEmoji, normalizeCosmetic, normalizeCosmeticCatalog } from "./CosmeticEmbed";
import { CosmeticWatch, CosmeticDelivery, CosmeticAlertLease } from "./CosmeticAlerts.model";
import { alertButton, cosmeticAlertKey } from "./CosmeticAlertsUI";
import { fortnitePriceService, FortnitePriceLookup, registryPriceFields, validCosmeticPrice } from "./FortnitePriceService";
import { MissingCosmeticsRender, renderMissingCosmeticsImage } from "../../MissingCosmetics/MissingCosmeticsImage";

const fields = { brItems: "br", tracks: "tracks", cars: "cars", instruments: "instruments", legoKits: "legoKits" };
class AlertInputError extends Error {}
export interface AlertOffer { item: CatalogCosmetic; price?: number; bundle: boolean; bundleName?: string }
export function alertOfferPriceLabel(offer: AlertOffer): string {
    if (validCosmeticPrice(offer.price)) return `${offer.price.toLocaleString()} V-Bucks${offer.bundle ? " for the offer" : ""}`;
    return validCosmeticPrice(offer.item.price) ? `Last known item price: ${offer.item.price.toLocaleString()} V-Bucks` : "";
}
export function enrichAlertOfferPrices(offers: Map<string, AlertOffer>, lookup?: FortnitePriceLookup) {
    return new Map([...offers].map(([id, offer]) => [id, { ...offer, item: { ...offer.item,
        ...(!offer.bundle && validCosmeticPrice(offer.price) ? { price: offer.price, priceIsCurrent: true, priceObservedAt: undefined }
            : lookup ? registryPriceFields(lookup, offer.item) : {}),
    } }]));
}
export function alertShopOffers(shop: any, today = new Date().toISOString().slice(0, 10)): Map<string, AlertOffer> {
    if (shop?.date?.slice(0, 10) !== today || !Array.isArray(shop.entries) || !shop.entries.length) throw new Error("Shop unavailable or stale");
    const result = new Map<string, AlertOffer>();
    for (const entry of shop.entries) {
        if (!entry || Object.keys(fields).some(field => entry[field] !== undefined && !Array.isArray(entry[field]))) throw new Error("Incomplete shop response");
        const count = Object.keys(fields).reduce((n, key) => n + (entry[key]?.length || 0), 0);
        for (const [field, category] of Object.entries(fields)) for (const raw of entry[field] || []) {
            if (typeof raw.id !== "string") throw new Error("Invalid shop item");
            const offer = { item: normalizeCosmetic(raw, category), bundle: count > 1,
                bundleName: entry.bundle?.name,
                price: Number.isFinite(entry.finalPrice) && entry.finalPrice >= 0 ? entry.finalPrice : undefined };
            const previous = result.get(raw.id);
            if (!previous || previous.bundle && !offer.bundle || previous.bundle === offer.bundle && (offer.price ?? Infinity) < (previous.price ?? Infinity)) result.set(raw.id, offer);
        }
    }
    if (!result.size) throw new Error("Empty shop response");
    return result;
}

export function alertTransition(present: boolean, absentChecks: number, inShop: boolean) {
    return inShop ? { present: true, absentChecks: 0, returned: !present }
        : { present: absentChecks < 1 ? present : false, absentChecks: Math.min(2, absentChecks + 1), returned: false };
}

export async function sendAlertWithFallback(client: Client, target: { user: string; channel: string; message?: string }, payload: any) {
    const channel: any = await client.channels.fetch(target.channel).catch(() => null);
    const member = channel?.guild ? await channel.guild.members.fetch(target.user).catch(() => null) : null;
    const userCanView = !channel?.guild || member && channel.permissionsFor(member)?.has("VIEW_CHANNEL");
    if (userCanView && channel?.isText() && typeof channel.send === "function") {
        if (target.message) {
            try {
                return { message: await channel.send({ ...payload, reply: { messageReference: target.message, failIfNotExists: true } }), destination: "channel" };
            } catch (error) {
                // Only a definitively missing reference is safe to retry in-channel.
                if (error.code !== 10008 && error.code !== 50035) {
                    if (![50001, 50013, 10003].includes(error.code)) throw error;
                    return { message: await (await client.users.fetch(target.user)).send(payload), destination: "DM" };
                }
            }
        }
        try { return { message: await channel.send(payload), destination: "channel" }; }
        catch (error) { if (![50001, 50013, 10003].includes(error.code)) throw error; }
    }
    return { message: await (await client.users.fetch(target.user)).send(payload), destination: "DM" };
}

export class CosmeticAlerts {
    private catalog: CatalogCosmetic[] = [];
    private catalogAt = 0;
    private catalogLoad: Promise<CatalogCosmetic[]>;
    private running = false;
    private busyUsers = new Set<string>();
    private watchlistRenders = new Map<string, MissingCosmeticsRender>();
    private ready: Promise<any>;
    private lastChecked: string | null = null;
    private lastError: string | null = null;
    constructor(private client: Client) {
        registerComponent("cosmeticAlerts", this);
        this.ready = Promise.all([CosmeticWatch.init(), CosmeticDelivery.init(), CosmeticAlertLease.init()]);
        client.on("interactionCreate", interaction => this.handle(interaction));
        scheduleJob("*/5 * * * *", createTrackedJob("cosmetic-alerts", "Cosmetic return alerts", "Every 5 minutes", () => this.poll()));
        void this.poll();
    }
    public getDiagnostics() { return { running: this.running, lastChecked: this.lastChecked, lastError: this.lastError, cachedCosmetics: this.catalog.length }; }
    private async loadCatalog() {
        if (this.catalog.length && Date.now() - this.catalogAt < 300000) return this.catalog;
        if (!this.catalogLoad) this.catalogLoad = axios.get("https://fortnite-api.com/v2/cosmetics?responseFlags=7", { timeout: 20000 })
            .then(r => { this.catalog = normalizeCosmeticCatalog(r.data.data); this.catalogAt = Date.now(); return this.catalog; })
            .finally(() => { this.catalogLoad = undefined; });
        return this.catalogLoad;
    }
    private async shop() {
        const offers = alertShopOffers((await axios.get("https://fortnite-api.com/v2/shop?responseFlags=7", { timeout: 20000 })).data.data);
        const lookup = await fortnitePriceService.get().catch(() => undefined);
        return enrichAlertOfferPrices(offers, lookup);
    }
    private query(user: string, key?: string) { return { bot: this.client.user.id, user, ...(key ? { key } : {}) }; }
    private async watchlistImage(viewer: string, watches: any[], payload: any, page: number, total: number) {
        if (!watches.length) return payload;
        try {
            const profile = await this.client.users.fetch(watches[0].user || viewer).catch(() => null);
            const rendered = await renderMissingCosmeticsImage(watches.map(watch => {
                const item = normalizeCosmetic(watch.item, watch.item.category || "br");
                return { id: item.id, name: item.name, cosmetic: item, type: item.type.displayValue,
                    imageUrl: item.images?.icon || null, featuredImageUrl: item.images?.featured || null,
                    rarity: item.rarity?.value, introduced: item.introduction?.text,
                    daysMissing: 0, lastSeenLabel: "", badgeLabel: watch.paused ? "PAUSED" : watch.mode === "once" ? "NEXT RETURN" : "EVERY RETURN" };
            }), `PAGE ${page + 1}`, "item-shop", 300, undefined,
            { title: "SHOP ALERTS", subtitle: "WATCHLIST", footer: `${total} SAVED ALERTS · PAUSED ALERTS SKIP RETURNS`,
                profileName: profile ? (profile as any).globalName || profile.username : "Fortnite player",
                profileAvatar: profile?.displayAvatarURL({ format: "png", size: 256 }) });
            this.watchlistRenders.set(viewer, rendered);
            return { ...payload, files: [{ attachment: rendered.image, name: "cosmetic-alerts.png" }] };
        } catch (error) {
            // Management must remain usable if artwork or Chromium is unavailable.
            console.warn("Watchlist image unavailable:", error.name);
            return payload;
        }
    }
    private async manager(user: string, page = 0) {
        const watches: any[] = await CosmeticWatch.find(this.query(user)).sort({ createdAt: 1 }).lean();
        page = Math.max(0, Math.min(Math.ceil(watches.length / 25) - 1, page)) || 0;
        const slice = watches.slice(page * 25, page * 25 + 25);
        const embed = new MessageEmbed().setColor("#2186DB").setTitle("Your shop alerts")
            .setDescription(watches.length ? `${watches.length} saved ${watches.length === 1 ? "alert" : "alerts"} · Choose an item to manage it.\n\n${slice.map(w => `**${w.item.name.slice(0, 60)}** · ${w.paused ? "Paused" : w.status}\n${w.mode === "once" ? "Next return" : "Every return"} → <#${w.channel}>`).join("\n\n")}` : "Your watchlist is empty.\nSearch for a cosmetic, then choose **Notify me**.")
            .setFooter({ text: "Alerts reply where you saved them, then try the channel, then DMs. Only you can change this list." });
        const rows: MessageActionRow[] = [];
        if (slice.length) rows.push(new MessageActionRow().addComponents(new MessageSelectMenu().setCustomId(`cosmetic-alert:${user}:manage:0`).setPlaceholder("Choose an item to manage its alert").addOptions(slice.map(w => ({ label: w.item.name.slice(0, 100), value: w.key,
            emoji: cosmeticTypeEmoji(w.item), description: `${w.paused ? "Paused" : "Watching"} · ${w.mode === "once" ? "Next return" : "Every return"}` })))));
        if (watches.length > 25) rows.push(new MessageActionRow().addComponents(alertButton(user, "list", String(page - 1), "←").setDisabled(page === 0),
            alertButton(user, "list", String(page + 1), "→").setDisabled((page + 1) * 25 >= watches.length)));
        if (slice.length) embed.setDescription(`${watches.length} saved ${watches.length === 1 ? "alert" : "alerts"} · Choose an item below to manage it.\nPause, change return mode, move the destination, or remove an alert.`);
        return this.watchlistImage(user, slice, { content: null, embeds: [embed], components: rows, attachments: [] }, page, watches.length);
    }
    private async publicWatchlist(viewer: string, user: string, page = 0) {
        const watches: any[] = await CosmeticWatch.find(this.query(user)).sort({ createdAt: 1 }).lean();
        page = Math.max(0, Math.min(Math.ceil(watches.length / 20) - 1, page)) || 0;
        const escape = (value: string) => value.slice(0, 80).replace(/([\\`*_~|>])/g, "\\$1");
        const embed = new MessageEmbed().setColor("#2186DB").setTitle("Cosmetic watchlist")
            .setDescription(`<@${user}> · **${watches.length} ${watches.length === 1 ? "alert" : "alerts"}**\n\n${watches.length
                ? watches.slice(page * 20, page * 20 + 20).map(w => `**${escape(w.item.name)}** · ${w.paused ? "Paused" : w.mode === "once" ? "Next return" : "Every return"}`).join("\n")
                : "No saved alerts."}`)
            .setFooter({ text: `Page ${page + 1} of ${Math.max(1, Math.ceil(watches.length / 20))} · Read-only · Only the owner can change these alerts` });
        const slice = watches.slice(page * 20, page * 20 + 20);
        const rows: MessageActionRow[] = [];
        if (slice.length) rows.push(new MessageActionRow().addComponents(new MessageSelectMenu()
            .setCustomId(`cosmetic-alert:${viewer}:setup:0`).setPlaceholder("Choose an item to get your own alert")
            .addOptions(slice.map(w => ({ label: w.item.name.slice(0, 100), value: w.key, emoji: cosmeticTypeEmoji(w.item) })))));
        const navigation = new MessageActionRow();
        if (watches.length > 20) navigation.addComponents(
            alertButton(viewer, "view", user, "←").setCustomId(`cosmetic-alert:${viewer}:view:${user}:${page - 1}`).setDisabled(page === 0),
            alertButton(viewer, "view", user, "→").setCustomId(`cosmetic-alert:${viewer}:view:${user}:${page + 1}`).setDisabled((page + 1) * 20 >= watches.length));
        navigation.addComponents(alertButton(viewer, "list", "0", "My alerts", "PRIMARY"));
        rows.push(navigation);
        return this.watchlistImage(viewer, slice, { content: null, embeds: [embed], allowedMentions: { parse: [] }, attachments: [], components: rows }, page, watches.length);
    }
    private async handle(i: any) {
        const command = i.isCommand() && i.commandName === "fortnite" && i.options.getSubcommandGroup(false) === "cosmetic" && i.options.getSubcommand(false) === "alerts";
        if (!command && !((i.isButton() || i.isSelectMenu()) && i.customId.startsWith("cosmetic-alert:"))) return;
        let [, owner, operation, token, anchor] = command ? ["", i.user.id, "list", "0"] : i.customId.split(":");
        const target = command ? i.options.getUser("user") : undefined;
        if (target && target.id !== i.user.id) { operation = "view"; token = target.id; anchor = "0"; }
        const fork = owner !== i.user.id;
        if (fork) {
            owner = i.user.id;
            // Never replay another person's destructive or delivery action.
            // Item setup is shareable; management always opens the clicker's list.
            operation = operation === "view" ? "view" : ["setup", "once", "every"].includes(operation) ? "setup" : "list";
            if (operation === "list") token = "0";
        }
        if (this.busyUsers.has(owner)) return i.reply({ content: "Your last change is still saving. Please try again in a moment.", allowedMentions: { parse: [] } });
        this.busyUsers.add(owner);
        try {
            // Open setup as its own public message so report navigation stays intact.
            if (command || fork || operation === "setup") await i.deferReply(); else await i.deferUpdate();
            await this.ready;
            if (operation === "view") return await i.editReply(await this.publicWatchlist(owner, token, Number(anchor) || 0));
            const key = i.isSelectMenu() && ["manage", "setup"].includes(operation) ? i.values[0] : token;
            if (operation === "list") return await i.editReply(await this.manager(owner, Number(token) || 0));
            if (["setup", "once", "every"].includes(operation)) {
                const item = (await this.loadCatalog()).find(item => cosmeticAlertKey(item.id) === key);
                if (!item) throw new AlertInputError("This item is no longer in the cosmetic catalog. Try searching for it again.");
                if (["lego", "beans"].includes(item.category)) return await i.editReply({ content: "This is an alternate style, not a separate shop offer. Search for the original outfit to watch its return.", components: [] });
                const existing: any = await CosmeticWatch.findOne(this.query(owner, key)).lean();
                if (existing) return await i.editReply(await this.manage(owner, existing));
                const shop = await this.shop();
                if (operation === "setup") return await i.editReply({ embeds: [new MessageEmbed().setColor("#2186DB").setTitle(`Watch ${item.name}`.slice(0, 256))
                    .setDescription(`${shop.has(item.id) ? "**Available now.** This alert will wait for it to leave and return.\n\n" : ""}**Next return** — notify once, then remove the alert.\n**Every return** — keep watching; no daily repeats.\n\nDelivery: reply here → this channel → DM if needed.`)],
                    components: [new MessageActionRow().addComponents(
                        alertButton(owner, "once", key, "Next return", "PRIMARY").setCustomId(`cosmetic-alert:${owner}:once:${key}:${i.message.id}`),
                        alertButton(owner, "every", key, "Every return", "SUCCESS").setCustomId(`cosmetic-alert:${owner}:every:${key}:${i.message.id}`),
                        alertButton(owner, "list", "0", "My alerts"))] });
                if (await CosmeticWatch.countDocuments(this.query(owner)) >= 100) throw new AlertInputError("You have 100 saved alerts. Remove one before adding another.");
                await CosmeticWatch.create({ _id: `${this.client.user.id}:${owner}:${key}`, ...this.query(owner, key), itemId: item.id, item,
                    channel: i.channelId, message: anchor || i.message.id, mode: operation, present: shop.has(item.id), status: "Watching" });
                return await i.editReply(await this.manager(owner));
            }
            if (operation.startsWith("delivery") || operation === "retry") return await this.deliveryInteraction(i, owner, operation, key);
            const watch: any = await CosmeticWatch.findOne(this.query(owner, key)).lean();
            if (!watch) return await i.editReply(await this.manager(owner));
            if (operation === "remove") return await i.editReply({ content: null, attachments: [],
                embeds: [new MessageEmbed().setColor("#E8AA35").setTitle("Remove this alert?")
                    .setDescription(`You’ll stop receiving return notifications for **${watch.item.name.slice(0, 80)}**. You can add it again later.`)],
                components: [new MessageActionRow().addComponents(
                    alertButton(owner, "confirmremove", key, "Remove alert", "DANGER").setEmoji("🗑️"),
                    alertButton(owner, "manage", key, "Keep alert", "SECONDARY").setEmoji("↩️"))] });
            if (operation === "confirmremove") {
                await CosmeticWatch.deleteOne({ _id: watch._id });
                return await i.editReply({ ...await this.manager(owner), content: "✅ Alert removed." });
            }
            if (["pause", "resume", "move", "mode"].includes(operation)) {
                const update: any = operation === "pause" ? { paused: true, pending: null, status: "Watching" } : operation === "move" ? { channel: i.channelId, message: i.message.id }
                    : operation === "mode" ? { mode: watch.mode === "once" ? "every" : "once" } : { paused: false, present: (await this.shop()).has(watch.itemId), absentChecks: 0, status: watch.pending ? watch.status : "Watching" };
                await CosmeticWatch.updateOne({ _id: watch._id }, { $set: update });
                const updated: any = await CosmeticWatch.findOne(this.query(owner, key)).lean();
                const messages = { pause: "⏸️ Alert paused. Returns while paused are skipped.", resume: "▶️ Alert resumed.", move: "📍 Notifications will be sent to this channel.", mode: "✅ Notification frequency updated." };
                return await i.editReply({ ...await this.manage(owner, updated || watch), content: messages[operation] });
            }
            if (operation === "manage") return await i.editReply(await this.manage(owner, watch));
            return await i.editReply(await this.manager(owner));
        } catch (error) {
            console.warn("Cosmetic alert action failed:", error.code || error.name);
            if (i.deferred || i.replied) await i.editReply({ content: error instanceof AlertInputError ? error.message : "Couldn't update your alerts. Please check My alerts before trying again.", embeds: [], components: [new MessageActionRow().addComponents(alertButton(owner, "list", "0", "My alerts"))] }).catch(() => {});
        } finally {
            const rendered = this.watchlistRenders.get(owner);
            this.watchlistRenders.delete(owner);
            if (rendered) await rendered.close().catch(() => {});
            this.busyUsers.delete(owner);
        }
    }
    private async manage(user: string, watch: any) {
        const embed = new MessageEmbed().setColor("#2186DB").setTitle(watch.item.name.slice(0, 256))
            .setDescription(`${watch.paused ? "⏸️ **Paused**" : `🔔 **${watch.status}**`}\n${watch.mode === "once" ? "🔔 Notify on the next return, then remove this alert." : "🔁 Notify on every return—no daily repeats."}\n\n📍 <#${watch.channel}>\n✉️ DM fallback if the channel is unavailable.\n\nPausing skips returns while paused.`);
        return { content: null, embeds: [embed], attachments: [], components: [new MessageActionRow().addComponents(
            alertButton(user, watch.paused ? "resume" : "pause", watch.key, watch.paused ? "Resume" : "Pause", watch.paused ? "SUCCESS" : "SECONDARY"),
            alertButton(user, "mode", watch.key, watch.mode === "once" ? "Watch every return" : "Watch next return"),
            alertButton(user, "move", watch.key, "Send here"), alertButton(user, "remove", watch.key, "Remove", "DANGER"), alertButton(user, "list", "0", "My alerts", "PRIMARY")),
            ...(watch.pending?.delivery ? [new MessageActionRow().addComponents(alertButton(user, "retry", watch.pending.delivery, "Retry delivery"))] : [])] };
    }

    public async poll() {
        if (this.running) return;
        this.running = true;
        const leaseId = `cosmetic-alerts:${this.client.user.id}`;
        let locked = false;
        try {
            await this.ready;
            try { await CosmeticAlertLease.create({ _id: leaseId, until: new Date(0) }); } catch (error) { if (error.code !== 11000) throw error; }
            const lease = await CosmeticAlertLease.findOneAndUpdate({ _id: leaseId, until: { $lt: new Date() } }, { $set: { until: new Date(Date.now() + 300000) } }, { new: true });
            if (!lease) return;
            locked = true;
            const watches: any[] = await CosmeticWatch.find({ bot: this.client.user.id, paused: false }).lean();
            if (!watches.length) return;
            const shop = await this.shop(); // Never advance presence on failed/stale/empty fetches.
            this.lastChecked = new Date().toISOString();
            this.lastError = null;
            // Recover durable work after a restart. A send interrupted between
            // Discord and MongoDB acknowledgement is ambiguous, never auto-repeated.
            const unfinished: any[] = await CosmeticDelivery.find({ bot: this.client.user.id, status: { $in: ["pending", "sending", "sent"] } }).lean();
            for (const delivery of unfinished) {
                if (delivery.status === "sending") {
                    await CosmeticDelivery.updateOne({ _id: delivery._id, status: "sending" }, { $set: { status: "uncertain" } });
                    await CosmeticWatch.updateMany({ "pending.delivery": delivery._id }, { $set: { status: "Delivery unconfirmed" } });
                } else await this.deliver(delivery, shop);
            }
            for (const watch of watches) {
                const state = alertTransition(watch.present, watch.absentChecks || 0, shop.has(watch.itemId));
                await CosmeticWatch.updateOne({ _id: watch._id, paused: false, updatedAt: watch.updatedAt }, { $set: {
                    present: state.present, absentChecks: state.absentChecks,
                    ...(state.returned && !watch.pending ? { pending: { event: randomBytes(12).toString("hex"), offer: shop.get(watch.itemId), date: new Date().toISOString().slice(0, 10) } } : {}),
                } });
            }
            const pending: any[] = await CosmeticWatch.find({ bot: this.client.user.id, paused: false, "pending.event": { $exists: true }, "pending.delivery": { $exists: false } }).lean();
            const groups = new Map<string, any[]>();
            for (const watch of pending) { const key = `${watch.user}:${watch.channel}`; groups.set(key, [...(groups.get(key) || []), watch]); }
            for (const group of groups.values()) {
                const id = createHash("sha256").update(group.map(w => w.pending.event).sort().join(":")).digest("hex").slice(0, 24);
                let delivery: any;
                try { delivery = await CosmeticDelivery.create({ _id: id, bot: this.client.user.id, user: group[0].user, channel: group[0].channel, message: group[0].message,
                    status: "pending", items: group.map(w => ({ watch: w._id, key: w.key, mode: w.mode, ...w.pending })) }); }
                catch (error) { if (error.code !== 11000) throw error; delivery = await CosmeticDelivery.findById(id); }
                for (const w of group) await CosmeticWatch.updateOne({ _id: w._id, "pending.event": w.pending.event }, { $set: { "pending.delivery": id, status: "Delivery pending" } });
                await this.deliver(delivery, shop);
                await CosmeticAlertLease.updateOne({ _id: leaseId }, { $set: { until: new Date(Date.now() + 300000) } });
            }
        } catch (error) { this.lastError = String(error.code || error.name); console.warn("Cosmetic alert check failed:", this.lastError); }
        finally { if (locked) await CosmeticAlertLease.updateOne({ _id: leaseId }, { $set: { until: new Date(0) } }).catch(() => {}); this.running = false; }
    }

    private async deliver(delivery: any, currentOffers?: Map<string, AlertOffer>) {
        if (!delivery) return;
        if (delivery.status === "sent") return this.finishDelivery(delivery);
        const active: any[] = await CosmeticWatch.find({ bot: this.client.user.id, user: delivery.user, paused: false, "pending.delivery": delivery._id }).lean();
        delivery.items = delivery.items.filter(item => active.some(w => w._id === item.watch && w.pending?.event === item.event));
        if (!delivery.items.length) {
            await CosmeticDelivery.updateOne({ _id: delivery._id, status: "pending" }, { $set: { status: "cancelled" } });
            return;
        }
        // A delayed/retried alert must still be available. Refresh prices rather
        // than claiming an old offer is current after a restart or blocked DM.
        const current = currentOffers || await this.shop();
        for (const entry of delivery.items) {
            if (!current.has(entry.offer.item.id)) await CosmeticWatch.updateOne({ _id: entry.watch, "pending.event": entry.event },
                { $unset: { pending: 1 }, $set: { status: "Watching", present: false, absentChecks: 2 } });
        }
        delivery.items = delivery.items.filter(entry => current.has(entry.offer.item.id)).map(entry => ({ ...entry, offer: current.get(entry.offer.item.id), date: new Date().toISOString().slice(0, 10) }));
        if (!delivery.items.length) {
            await CosmeticDelivery.updateOne({ _id: delivery._id, status: "pending" }, { $set: { status: "cancelled" } });
            return;
        }
        // Persist the actual group shown in the message (removed/paused watches
        // must not reappear in notification controls after a restart).
        await CosmeticDelivery.updateOne({ _id: delivery._id, status: "pending" }, { $set: { items: delivery.items } });
        const claimed = await CosmeticDelivery.findOneAndUpdate({ _id: delivery._id, status: "pending" }, { $set: { status: "sending" } });
        if (!claimed) return; // Never blindly retry an ambiguous send after a crash.
        try {
            const payload = this.deliveryView(delivery, 0, delivery.items.length === 1 ? 0 : undefined);
            const result = await sendAlertWithFallback(this.client, delivery, { ...payload,
                content: `<@${delivery.user}> ${delivery.items.length === 1 ? "Your watched item is back in the shop." : `${delivery.items.length} watched items are back in the shop.`}`,
                allowedMentions: { parse: [], users: [delivery.user], repliedUser: false } });
            await CosmeticDelivery.updateOne({ _id: delivery._id }, { $set: { status: "sent", discordMessage: result.message.id, destination: result.destination } });
            await this.finishDelivery(delivery);
        } catch (error) {
            const definite = [50007, 50001, 50013, 10003, 10013, 50035].includes(error.code);
            await CosmeticDelivery.updateOne({ _id: delivery._id }, { $set: { status: definite ? "blocked" : "uncertain" } });
            await CosmeticWatch.updateMany({ "pending.delivery": delivery._id }, { $set: { status: definite ? "Delivery blocked" : "Delivery unconfirmed" } });
        }
    }
    private async finishDelivery(delivery: any) {
        for (const item of delivery.items) {
            const query = { _id: item.watch, "pending.event": item.event };
            const current: any = await CosmeticWatch.findOne(query).lean();
            if (current?.mode === "once") await CosmeticWatch.deleteOne(query);
            else await CosmeticWatch.updateOne(query, { $unset: { pending: 1 }, $set: { status: "Watching" } });
        }
        await CosmeticDelivery.updateOne({ _id: delivery._id }, { $set: { status: "complete" } });
    }
    private deliveryView(delivery: any, page: number, selected?: number) {
        const user = delivery.user, id = delivery._id;
        page = Math.max(0, Math.min(Math.ceil(delivery.items.length / 25) - 1, page)) || 0;
        const item = selected === undefined ? undefined : delivery.items[selected];
        const embed = item ? buildCosmeticEmbed(item.offer.item) : new MessageEmbed().setColor("#2186DB").setTitle("Back in the shop")
            .setDescription(delivery.items.slice(page * 25, page * 25 + 25).map(entry => `**${entry.offer.item.name.slice(0, 60)}** · ${entry.offer.bundle ? "Multi-item offer" : "Available individually"}${alertOfferPriceLabel(entry.offer) ? ` · ${alertOfferPriceLabel(entry.offer)}` : ""}`).join("\n\n").slice(0, 3900))
            .setFooter({ text: `Shop checked ${delivery.items[0].date} (UTC) · Availability may have changed` });
        if (item && embed.fields.length < 25) {
            const offerText = `${item.offer.bundle ? `Included in ${String(item.offer.bundleName || "a multi-item offer").slice(0, 100)}` : "Available individually"}${item.offer.price !== undefined ? ` · ${item.offer.price.toLocaleString()} V-Bucks${item.offer.bundle ? " for the offer" : ""}` : ""}\nObserved ${item.date} (UTC). Availability may have changed.`;
            const room = Math.min(1024, 6000 - embed.length - "Shop offer".length);
            if (room > 0) embed.addField("Shop offer", offerText.slice(0, room));
        }
        const menu = new MessageSelectMenu().setCustomId(`cosmetic-alert:${user}:deliveryitem:${id}`).setPlaceholder("View an item").addOptions(delivery.items.slice(page * 25, page * 25 + 25).map((entry, index) => ({ label: entry.offer.item.name.slice(0, 100), value: String(page * 25 + index) })));
        return { embeds: [embed], components: [new MessageActionRow().addComponents(menu), new MessageActionRow().addComponents(
            alertButton(user, `deliverypage${page - 1}`, id, "←").setDisabled(page === 0), alertButton(user, `deliverypage${page + 1}`, id, "→").setDisabled((page + 1) * 25 >= delivery.items.length),
            alertButton(user, "list", "0", "My alerts"),
            ...(item ? [alertButton(user, "pause", item.key, "Pause alert"), alertButton(user, "remove", item.key, "Stop watching", "DANGER")] : []))] };
    }
    private async deliveryInteraction(i: any, owner: string, operation: string, id: string) {
        const delivery: any = await CosmeticDelivery.findOne({ _id: id, bot: this.client.user.id, user: owner }).lean();
        if (!delivery) return i.editReply({ content: "This notification has expired. Your saved alerts are still available.", embeds: [], components: [new MessageActionRow().addComponents(alertButton(owner, "list", "0", "My alerts"))] });
        if (operation === "retry") {
            if (delivery.status !== "blocked") return i.editReply({ content: "This delivery may already have been sent. It won't be resent automatically. Check the destination or DMs before removing and recreating the alert.", components: [new MessageActionRow().addComponents(alertButton(owner, "list", "0", "My alerts"))] });
            const active: any[] = await CosmeticWatch.find({ ...this.query(owner), "pending.delivery": id, paused: false }).lean();
            if (!active.length) return i.editReply(await this.manager(owner));
            delivery.channel = active[0].channel; delivery.message = active[0].message;
            delivery.items = delivery.items.filter(item => active.some(w => w._id === item.watch));
            const updated = await CosmeticDelivery.findOneAndUpdate({ _id: id, status: "blocked" }, { $set: { status: "pending", channel: delivery.channel, message: delivery.message, items: delivery.items } }, { new: true });
            await this.deliver(updated);
            return i.editReply(await this.manager(owner));
        }
        const selected = operation === "deliveryitem" ? Number(i.values[0]) : undefined;
        if (selected !== undefined && (!Number.isInteger(selected) || !delivery.items[selected])) throw new Error("Invalid selection");
        return i.editReply(this.deliveryView(delivery, selected === undefined ? Number(operation.replace("deliverypage", "")) || 0 : Math.floor(selected / 25), selected));
    }
}
