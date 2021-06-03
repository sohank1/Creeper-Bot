import { scheduleJob } from "node-schedule";
import teasers from "./teaserData.json";
import { Message, Client, TextChannel, MessageAttachment } from "discord.js";
import Teaser from "./types/Teaser";

export default class Teasers {
    constructor(private client: Client) {
        teasers.forEach(t => console.log("local time", new Date(t.time).toLocaleString()))
        console.log(new Date("9/1/2020, 2:00:00 PM"));
        console.log(new Date("9/2/2020, 10:00:00 AM"));
        console.log(new Date("9/3/2020, 10:00:00 AM"));
        this.scheduleJobs();
    }

    private scheduleJobs(): void {
        console.log(teasers)
        for (const t of teasers) {
            console.log("scheduleing.. ");
            const utcDate = new Date(t.time)
            const estDate = new Date(utcDate.toLocaleString("en-US", { timeZone: "America/New_York" }))
            scheduleJob(new Date(t.time), () => {
                console.log("sending");
                this.sendMessage(t);
            });
        }
    }

    private async sendMessage(teaser: Teaser) {
        // [tts, n30]
        // const channels = <TextChannel[]>[this.client.channels.cache.get("570565934042054666"), this.client.channels.cache.get("686023355517894729")];
        // secert channels
        const channels = <TextChannel[]>[this.client.channels.cache.get("719937901252706425"), this.client.channels.cache.get("849690609307615257")];
        for (const c of channels) {
            const attachment = new MessageAttachment(process.cwd() + teaser.imageUrl, teaser.name,);
            const m = teaser.imageUrl ? await c.send(teaser.description, { files: [process.cwd() + teaser.imageUrl] }) : await c.send(teaser.description);
            this.react(m);
            this.client.user.setActivity(teaser.status, {});
        }
    }

    private react(message: Message): void {
        message.react("👀");
        message.react("😱");
        message.react("🎵");
    }
}
