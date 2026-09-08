import { createHash } from "crypto";
import { MessageActionRow, MessageButton } from "discord.js";

export const cosmeticAlertKey = (id: string) => createHash("sha256").update(id).digest("hex").slice(0, 24);
export const alertButton = (owner: string, action: string, key = "0", label = "", style: "PRIMARY" | "SECONDARY" | "SUCCESS" | "DANGER" = "SECONDARY") =>
    new MessageButton().setCustomId(`cosmetic-alert:${owner}:${action}:${key}`).setLabel(label).setStyle(style);
export function cosmeticWatchControls(owner: string, itemId: string) {
    return new MessageActionRow().addComponents(
        alertButton(owner, "setup", cosmeticAlertKey(itemId), "Notify me", "PRIMARY").setEmoji("🔔"),
        alertButton(owner, "list", "0", "My alerts").setEmoji("⚙️"),
    );
}
