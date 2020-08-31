import { scheduleJob } from "node-schedule";
import teasers from "./teaserData.json";
import { Message, Client, TextChannel, MessageAttachment } from "discord.js";
import Teaser from "./types/Teaser";

export default class Teasers {
    constructor(private client: Client) {
        teasers.forEach(t => console.log("local time", new Date(t.time).toLocaleString()))
        console.log(new Date("8/31/2020, 9:00:00 PM"));
        console.log(new Date("9/1/2020, 10:00:00 AM"));
        console.log(new Date("9/2/2020, 10:00:00 AM"));
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
        const channels = <TextChannel[]>[this.client.channels.cache.get("711611880048951338"), this.client.channels.cache.get("711612340788920341")];
        for (const c of channels) {
            const attachment = new MessageAttachment(process.cwd() + teaser.imageUrl, teaser.name,);
            const m = await c.send(teaser.description, { files: [process.cwd() + teaser.imageUrl] });
            this.react(m)
            this.client.user.setActivity(teaser.description, {})
        }
    }

    private react(message: Message): void {
        message.react("👀")
        message.react("😱")
    }
}
