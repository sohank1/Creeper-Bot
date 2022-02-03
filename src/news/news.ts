import axios, { AxiosResponse } from "axios";
import { Client, Collection, MessageEmbed, Snowflake, TextChannel } from "discord.js";
import { Br, Creative, NewsResponseObject, Stw } from "./news.type";
import NewsModel from './news.model'
import newsChannels from "./newsChannels.json"

export class News {
    public responseObject: NewsResponseObject;

    constructor(private client: Client) {
        this._init();
    }

    private async _init(): Promise<void> {
        // await this.fetch();
        // await this.save();
        this.interval();
    }


    private interval(): void {
        // Check to see if news has been updated every 15 seconds.
        setInterval(async () => {
            //   console.log("Getting data from Fortnite servers.")
            await this.fetch();

            //   console.log("Getting data from database.")
            const db = (await NewsModel.findOne()).responseObject;

            // console.log("db", new Date(db.data.br.date), "real", new Date(this.responseObject.data.br?.date))


            if (this.responseObject.data.br?.date !== db.data.br?.date ||
                this.responseObject.data.creative?.date !== db.data.creative?.date ||
                this.responseObject.data.stw?.date !== db.data.stw?.date) {
                console.log("Fortnite servers have new news.")

                //      console.log("Saving this new data to the database.")
                await this.save();

                //     console.log("Sending the message.")
                await this.send(db);

            } else {
                // console.log("Already up to date.")
            }

        }, 3000)
    }

    private async send(db: NewsResponseObject): Promise<void> {
        //   console.log("Looping through the news.")
        this.responseObject.data.br && await this.loop(this.responseObject.data?.br, "br", db);
        this.responseObject.data.creative && await this.loop(this.responseObject.data?.creative, "creative", db);
        this.responseObject.data.stw && await this.loop(this.responseObject.data?.stw, "stw", db);
    }

    private async loop(looper: Br | Creative | Stw, looperName: "br" | "creative" | "stw", db: NewsResponseObject) {
        for (const newsIndex in looper?.motds) {
            const news = looper.motds[newsIndex];

            if (news !== db.data[looperName].motds[newsIndex]) {
                console.log("The news is not in the same place. Send a message.")
                console.log(news)
                console.log(news.image, "\n", news.tileImage, "\n", news.id, "\n", news.title, "\n", news.tabTitle, "\n", news.body, "\n", `${news.image} ${news.tileImage}`, "\n", { text: `Updated at ${new Date(looper.date).toLocaleString("en-US", { timeZone: "America/New_York" })}` })
                const e = new MessageEmbed()
                    .setTitle("Fortnite Servers were updated!")
                    .setColor("#2186DB")
                    .setImage(news.image)
                    .setThumbnail(news.tileImage)
                    .addField("ID", news.id)
                    .addField("Title", news.title)
                    .addField("Tab Title", news.tabTitle || "None")
                    .addField("Description", news?.body)
                    .addField("Image URLs", `${news.image} ${news.tileImage}`)
                    .setFooter({ text: `Updated at ${new Date(looper.date).toLocaleString("en-US", { timeZone: "America/New_York" })}` });

                const channels = this.client.channels.cache.filter((c: TextChannel) => c.name.includes("fn-news")) as Collection<Snowflake, TextChannel>

                const neo = this.client.guilds.cache.get(newsChannels.neo.guild)
                if (!neo.channels.cache.find((c: TextChannel) => c.name.includes("fn-news"))) {
                    const mineChannel = <TextChannel>neo.channels.cache.get("685958708383056034")
                    const c = await neo.channels.create("fn-news", { topic: "Fortnite News and Donald Mustard updates", position: mineChannel.position + 1, parent: mineChannel.parent })
                    channels.set(c.id, <TextChannel>neo.channels.cache.get(c.id))
                }


                channels.forEach(c => c.send({ embeds: [e] }))
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
