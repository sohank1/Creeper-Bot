import mongoose from "mongoose";

const identifier = new mongoose.Schema({
    platform: { type: String, enum: ["epic", "xbl", "psn"], required: true },
    lookupName: { type: String, required: true },
    normalizedName: { type: String, required: true },
    lastVerifiedAt: { type: Date, required: true },
}, { _id: false });

// One document represents one provider account. Platform-specific usernames
// live inside identifiers so linked Epic, Xbox, and PlayStation names do not
// become duplicate account documents.
const player = new mongoose.Schema({
    bot: { type: String, required: true, index: true },
    accountId: { type: String, required: true },
    canonicalName: { type: String, required: true },
    normalizedCanonicalName: { type: String, required: true },
    identifiers: { type: [identifier], default: [] },
    lookupCount: { type: Number, default: 0 },
    lastUsedAt: { type: Date, default: Date.now },
    lastVerifiedAt: { type: Date, default: Date.now },
}, {
    timestamps: true,
    // This lets the directory read the old per-platform documents once and
    // consolidate them without keeping legacy fields in new records.
    strict: false,
    autoIndex: false,
});

player.index({ bot: 1, accountId: 1 }, { unique: true });
player.index({ bot: 1, canonicalName: 1 });
player.index({ bot: 1, "identifiers.platform": 1 });
player.index({ bot: 1, "identifiers.normalizedName": 1 });

export const FortniteStatsPlayer = mongoose.model("fortniteStatsPlayer", player);
