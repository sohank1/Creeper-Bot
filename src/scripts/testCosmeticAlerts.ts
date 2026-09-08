import assert from "assert";
import { alertShopOffers, alertTransition, sendAlertWithFallback, CosmeticAlerts } from "../Fortnite/FortniteCosmetics/CosmeticAlerts";
import { cosmeticAlertKey, cosmeticWatchControls } from "../Fortnite/FortniteCosmetics/CosmeticAlertsUI";
import { CosmeticWatch, CosmeticDelivery } from "../Fortnite/FortniteCosmetics/CosmeticAlerts.model";

async function main() {
    const offers = alertShopOffers({ date: "2024-01-01", entries: [
        { finalPrice: 2000, bundle: { name: "Bundle" }, brItems: [{ id: "a", name: "A" }, { id: "b", name: "B" }] },
        { finalPrice: 800, brItems: [{ id: "a", name: "A" }] },
        { tracks: [{ id: "song", title: "Song", albumArt: "https://example.com/album.png" }] },
    ] }, "2024-01-01");
    assert.equal(offers.get("a").price, 800);
    assert.equal(offers.get("a").bundle, false);
    assert.equal(offers.get("b").bundle, true);
    assert.equal(offers.get("song").price, undefined);
    for (const invalid of [null, { date: "2024-01-01", entries: [] }, { date: "2024-01-01", entries: [{ brItems: {} }] }, { date: "2023-01-01", entries: [{}] }]) {
        assert.throws(() => alertShopOffers(invalid, "2024-01-01"));
    }
    assert.deepEqual(alertTransition(true, 0, true), { present: true, absentChecks: 0, returned: false });
    const firstAbsent = alertTransition(true, 0, false);
    assert(firstAbsent.present); // One partial response must not imply a return.
    const left = alertTransition(firstAbsent.present, firstAbsent.absentChecks, false);
    assert(!left.present);
    assert(alertTransition(left.present, left.absentChecks, true).returned);
    assert(!alertTransition(true, 0, true).returned);
    assert.equal(cosmeticAlertKey("id"), cosmeticAlertKey("id"));
    for (const button of cosmeticWatchControls("12345678901234567890", "x".repeat(300)).components) assert(button.customId.length <= 100);

    const order: string[] = [];
    let failReply = false, failChannel = false, failDM = false, ambiguous = false;
    const client: any = { channels: { fetch: async () => ({ isText: () => true, send: async payload => {
        order.push(payload.reply ? "reply" : "channel");
        if (ambiguous) throw { code: "ETIMEDOUT" };
        if (payload.reply && failReply) throw { code: 10008 };
        if (failChannel) throw { code: 50013 };
        return { id: "sent" };
    } }) }, users: { fetch: async () => ({ send: async () => { order.push("DM"); if (failDM) throw { code: 50007 }; return { id: "dm" }; } }) } };
    const target = { user: "user", channel: "channel", message: "message" };
    await sendAlertWithFallback(client, target, {});
    assert.deepEqual(order.splice(0), ["reply"]);
    failReply = true;
    await sendAlertWithFallback(client, target, {});
    assert.deepEqual(order.splice(0), ["reply", "channel"]);
    failChannel = true;
    await sendAlertWithFallback(client, target, {});
    assert.deepEqual(order.splice(0), ["reply", "channel", "DM"]);
    failDM = true;
    await assert.rejects(() => sendAlertWithFallback(client, target, {}));
    order.splice(0); ambiguous = true;
    await assert.rejects(() => sendAlertWithFallback(client, target, {}));
    assert.deepEqual(order, ["reply"]); // Don't send again after an ambiguous timeout.

    // Exercise UI builders without starting jobs or connecting to a database.
    const service: any = Object.create(CosmeticAlerts.prototype);
    service.client = { user: { id: "bot" } };
    const delivery: any = { _id: "d".repeat(24), user: "12345678901234567890", items: Array.from({ length: 100 }, (_, index) => ({
        key: cosmeticAlertKey(String(index)), offer: offers.get("a"), date: "2024-01-01",
    })) };
    for (const page of [0, 1, 3, 10, -1]) {
        const view = service.deliveryView(delivery, page);
        assert(view.embeds[0].length <= 6000);
        assert(view.embeds[0].description.length <= 4096);
        assert(view.components.length <= 5);
        for (const row of view.components) {
            assert(row.components.length <= 5);
            for (const c of row.components) { assert(c.customId.length <= 100); if (c.options) assert(c.options.length <= 25); }
        }
    }
    // Successful delivery cleanup respects a mode changed while delivery was queued.
    const oldFind = CosmeticWatch.findOne, oldDelete = CosmeticWatch.deleteOne, oldUpdate = CosmeticWatch.updateOne, oldDelivery = CosmeticDelivery.updateOne;
    const deleted: any[] = [], updated: any[] = [];
    try {
        (CosmeticWatch as any).findOne = query => ({ lean: async () => ({ mode: query._id === "once" ? "once" : "every" }) });
        (CosmeticWatch as any).deleteOne = async query => deleted.push(query);
        (CosmeticWatch as any).updateOne = async query => updated.push(query);
        (CosmeticDelivery as any).updateOne = async () => {};
        await service.finishDelivery({ _id: "delivery", items: [{ watch: "once", event: "1" }, { watch: "every", event: "2" }] });
        assert.equal(deleted[0]._id, "once");
        assert.equal(updated[0]._id, "every");
        assert.equal(deleted[0]["pending.event"], "1");
    } finally {
        CosmeticWatch.findOne = oldFind; CosmeticWatch.deleteOne = oldDelete; CosmeticWatch.updateOne = oldUpdate; CosmeticDelivery.updateOne = oldDelivery;
    }
    // Durable claim: reprocessing the same event cannot send it twice.
    const oldWatches = CosmeticWatch.find, oldClaim = CosmeticDelivery.findOneAndUpdate;
    let status = "pending", sends = 0;
    const stored: any = { _id: "delivery", user: "user", channel: "channel", message: "message", status: "pending", items: [
        { watch: "watch", key: "key", event: "event", offer: offers.get("a"), date: "2024-01-01" },
    ] };
    try {
        (CosmeticWatch as any).find = () => ({ lean: async () => [{ _id: "watch", pending: { event: "event" } }] });
        (CosmeticDelivery as any).findOneAndUpdate = async (_query, update) => {
            if (status !== "pending") return null;
            status = update.$set.status;
            return stored;
        };
        (CosmeticDelivery as any).updateOne = async (_query, update) => { if (update.$set.status) status = update.$set.status; };
        service.client = { user: { id: "bot" }, channels: { fetch: async () => ({ isText: () => true, send: async () => { sends++; return { id: "sent" }; } }) } };
        service.finishDelivery = async () => { status = "complete"; };
        await service.deliver(stored, offers);
        assert.equal(status, "complete");
        await service.deliver(stored, offers);
        assert.equal(sends, 1);
    } finally {
        CosmeticWatch.find = oldWatches; CosmeticDelivery.findOneAndUpdate = oldClaim; CosmeticDelivery.updateOne = oldDelivery;
    }
    console.log("Cosmetic alerts: offer matching, return transitions, delivery fallbacks, pagination and cleanup passed (no live writes).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
