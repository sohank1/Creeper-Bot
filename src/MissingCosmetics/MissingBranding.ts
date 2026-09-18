import type { Client } from "discord.js";
import fs from "fs";
import path from "path";
import axios from "axios";

const logoPath = path.resolve("assets", "creeper-bot-logo.png");
export function storedMissingBotLogo(): string | undefined {
    try { return `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`; }
    catch { return undefined; }
}

export async function storeMissingBotLogo(url: string): Promise<string> {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "cdn.discordapp.com") throw new Error("Expected a Discord CDN avatar");
    const response = await axios.get(url, { responseType: "arraybuffer", timeout: 10000, maxContentLength: 8 * 1024 * 1024 });
    const png = Buffer.from(response.data);
    if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error("Discord avatar was not a PNG");
    await fs.promises.mkdir(path.dirname(logoPath), { recursive: true });
    try { await fs.promises.writeFile(logoPath, png, { flag: "wx" }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    return storedMissingBotLogo()!;
}

const logos = new Map<string, { url: string; expires: number }>();
export async function fetchMissingBotLogo(client: Client): Promise<string | undefined> {
    const stored = storedMissingBotLogo();
    if (stored) return stored;
    const id = client.user?.id;
    if (!id) return undefined;
    const cached = logos.get(id);
    if (cached && cached.expires > Date.now()) return cached.url;
    try {
        const user = await client.users.fetch(id, { force: true });
        const url = user.displayAvatarURL({ format: "png", size: 1024, dynamic: false });
        logos.set(id, { url, expires: Date.now() + 3600000 });
        return url;
    } catch {
        return cached?.url || client.user?.displayAvatarURL({ format: "png", size: 1024, dynamic: false });
    }
}
