import { Client, Message } from "discord.js";
import axios from "axios";

export class MissingCosmetics {
    constructor(private client: Client) {
        client.on("messageCreate", (message) => {
            if (message.content.toLowerCase() === "c!missing") this.sendMissingCosmetics(message);
        });
    }

    public async sendMissingCosmetics(message: Message) {
        const r = await axios.get("https://fortnite-api.com/v2/cosmetics/br");

        const missing = [];
        r.data.data.forEach((c, i) => {
            if (c.shopHistory) {
                console.log(i);
                const date = new Date(c.shopHistory[c.shopHistory.length - 1]);

                const differenceInDays = (Date.now() - date.getTime()) / (1000 * 3600 * 24);
                console.log(date, differenceInDays);
                if (differenceInDays >= 300) missing.push(c);
            }
        });

        console.log(`missing: ${missing}. There are ${missing.length} missing cosmetics (haven't been seen in 300 days or more)`);

        missing.forEach((e, i) =>
            message.channel.send(
                `${i}/${missing.length} Missing ${e.name} ${e.images.icon} Last Seen: ${new Date(e.shopHistory[e.shopHistory.length - 1]).toLocaleString("en-US", { timeZone: "America/New_York" })} There are ${missing.length} missing cosmetics (haven't been seen in 300 days or more)`,
            ),
        );
    }
}
