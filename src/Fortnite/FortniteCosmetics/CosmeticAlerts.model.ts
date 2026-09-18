import mongoose from "mongoose";

// Bot ID namespaces beta/production. Unique IDs enforce one watch per user/item.
const watch = new mongoose.Schema({
    _id: String, bot: { type: String, index: true }, user: { type: String, index: true },
    // Stored so global alert-user autocomplete does not need a Discord API
    // request for every existing watch on every keystroke.
    username: String, displayName: String, key: String,
    itemId: String, item: mongoose.Schema.Types.Mixed,
    channel: String, message: String, mode: { type: String, enum: ["once", "every"] },
    paused: { type: Boolean, default: false }, present: Boolean, absentChecks: { type: Number, default: 0 },
    pending: mongoose.Schema.Types.Mixed, status: { type: String, default: "Watching" },
}, { timestamps: true });
watch.index({ bot: 1, user: 1 });
const delivery = new mongoose.Schema({
    _id: String, bot: String, user: String, channel: String, message: String,
    items: [mongoose.Schema.Types.Mixed], status: String, discordMessage: String, destination: String,
    createdAt: { type: Date, default: Date.now, expires: 2592000 },
});
const lease = new mongoose.Schema({ _id: String, until: Date });
export const CosmeticWatch = mongoose.model("cosmeticWatch", watch);
export const CosmeticDelivery = mongoose.model("cosmeticDelivery", delivery);
export const CosmeticAlertLease = mongoose.model("cosmeticAlertLease", lease);
