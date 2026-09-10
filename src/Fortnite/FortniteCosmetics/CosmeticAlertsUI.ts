import { createHash } from "crypto";
import { MessageActionRow, MessageButton } from "discord.js";

export const cosmeticAlertKey = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 24);
export const alertButton = (owner: string, action: string, key = "0", label = "", style: "PRIMARY" | "SECONDARY" | "SUCCESS" | "DANGER" = "SECONDARY") => {
    const button = new MessageButton().setCustomId(`cosmetic-alert:${owner}:${action}:${key}`).setLabel(label).setStyle(style);
    const emoji = { setup: "🔔", once: "🔔", every: "🔁", pause: "⏸️", resume: "▶️", move: "📍", remove: "🗑️", mode: "🔁", list: "📋", retry: "🔄", manage: "⚙️" }[action];
    if (emoji && label !== "←" && label !== "→") button.setEmoji(emoji);
    return button;
};
export interface CosmeticWatchState { paused?: boolean; mode: "once" | "every" }
export function cosmeticWatchControls(owner: string, itemId: string, watch?: CosmeticWatchState | null) {
    const label = watch === null ? "Alert options" : watch?.paused ? "Alert paused · Manage" : watch ? "Watching · Manage" : "Notify me";
    return new MessageActionRow().addComponents(
        // Keep setup as the action: it resolves current state and opens a separate
        // reply, including when another user clicks this public message.
        alertButton(owner, "setup", cosmeticAlertKey(itemId), label, watch && !watch.paused ? "SUCCESS" : "PRIMARY")
            .setEmoji(watch?.paused ? "⏸️" : watch ? "✅" : "🔔"),
        alertButton(owner, "list", "0", "My alerts").setEmoji("⚙️"),
    );
}

export async function cosmeticWatchControlsFor(bot: string | undefined, owner: string, itemId: string) {
    if (!bot) return cosmeticWatchControls(owner, itemId, null);
    try {
        const { CosmeticWatch } = await import("./CosmeticAlerts.model");
        if (CosmeticWatch.db.readyState !== 1) return cosmeticWatchControls(owner, itemId, null);
        const watch = await CosmeticWatch.findOne({ bot, user: owner, key: cosmeticAlertKey(itemId) })
            .select("paused mode").maxTimeMS(1500).lean();
        return cosmeticWatchControls(owner, itemId, watch || undefined);
    } catch {
        return cosmeticWatchControls(owner, itemId, null);
    }
}
