import "dotenv/config";
import axios from "axios";
import { storeMissingBotLogo } from "../MissingCosmetics/MissingBranding";

async function main() {
    const token = process.env.BOT_TOKEN;
    if (!token) throw new Error("Production BOT_TOKEN is not available in the environment");
    const response = await axios.get("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bot ${token}` }, timeout: 10000,
    });
    const user = response.data;
    if (!user.bot || !/^\d+$/.test(user.id) || !/^[a-zA-Z0-9_]+$/.test(user.avatar || "")) throw new Error("Production bot has no valid custom avatar");
    await storeMissingBotLogo(`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=1024`);
    console.log("Logo stored in assets/creeper-bot-logo.png; no token was saved.");
}
main().catch(() => {
    // Axios error objects may contain Authorization headers. Never log them.
    console.error("Could not save production bot avatar. Check BOT_TOKEN and Discord access.");
    process.exitCode = 1;
});
