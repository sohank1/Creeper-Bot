import axios, { AxiosResponse } from "axios";
import { Client, MessageEmbed, TextChannel } from "discord.js";
import { Br, Creative, NewsResponseObject, Stw } from "./news.type";
import NewsModel from './news.model'

export class News {
    public responseObject: NewsResponseObject;

    constructor(private client: Client) {
        this._init();
    }

    private async _init(): Promise<void> {
        await this.fetch();
        await this.save();
        this.interval();
    }


    private interval(): void {
        // Check to see if news has been updated every 15 seconds.
        setInterval(async () => {
            console.log("Getting data from Fortnite servers.")
            await this.fetch();

            console.log("Getting data from database.")
            const db = (await NewsModel.findOne()).responseObject;

            console.log("db", new Date(db.data.br.date), "real", new Date(this.responseObject.data.br.date))


            if (this.responseObject.data.br.date !== db.data.br.date ||
                this.responseObject.data.creative.date !== db.data.creative.date ||
                this.responseObject.data.stw.date !== db.data.stw.date) {
                console.log("Fortnite servers have new news.")

                console.log("Saving this new data to the database.")
                await this.save();

                console.log("Sending the message.")
                this.send(db);

            } else
                console.log("Already up to date.")

        }, 3000)
    }

    private send(db: NewsResponseObject): void {
        console.log("Looping through the news.")
        this.loop(this.responseObject.data.br, "br", db);
        this.loop(this.responseObject.data.creative, "creative", db);
        this.loop(this.responseObject.data.stw, "stw", db);
    }

    private loop(looper: Br | Creative | Stw, looperName: "br" | "creative" | "stw", db: NewsResponseObject) {
        for (const newsIndex in looper.motds) {
            const news = looper.motds[newsIndex];

            if (news !== db.data[looperName].motds[newsIndex]) {
                console.log("The news is not in the same place. Send a message.")
                const e = new MessageEmbed()
                    .setTitle("Fortnite Servers were updated!")
                    .setColor("2186DB")
                    .setImage(news.image)
                    .setThumbnail(news.tileImage)
                    .addField("ID", news.id)
                    .addField("Title", news.title)
                    .addField("Tab Title", news.tabTitle)
                    .addField("Description", news.body)
                    .addField("Image URLs", `${news.image} ${news.tileImage}`)
                    .setFooter(`Updated at ${new Date(looper.date).toLocaleString("en-US", { timeZone: "America/New_York" })}`);
                (<TextChannel>this.client.channels.cache.get('678266554088947712')).send(e);
            }
        }
    }


    private async fetch(): Promise<NewsResponseObject> {
        const responseObject = (await (axios.get("https://fortnite-api.com/v2/news"))).data;
        return this.responseObject = responseObject;
    }

    private async save(): Promise<void> {
        console.log("OVERWRITING")
        console.log("OVERWRITING")
        console.log("OVERWRITING")
        console.log("OVERWRITING")
        console.log("OVERWRITING")
        await NewsModel.updateMany({}, { responseObject: this.responseObject });
        // await (await NewsModel.create({ responseObject: this.responseObject })).save()
    }
}