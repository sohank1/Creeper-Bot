import axios from "axios";
import { BaseCommandInteraction, CacheType, Client, EmbedField, MessageActionRow, MessageEmbed, MessageSelectMenu, SelectMenuInteraction } from "discord.js";
import { version } from "../../index";
import { platformChoices } from "../fortniteCommand";
import * as cheerio from 'cheerio';

const loadingStr = "Loading more... <a:loading2:1140691951704879204>";

export class FortniteStats {
    private interaction: BaseCommandInteraction<CacheType>;

    constructor(private client: Client) {
        // this.client.guilds.cache.get('640262033329356822').emojis.cache.forEach(emoji => console.log(emoji.animated ? '<a:' + emoji.name + ':' + emoji.id + '>' : '<:' + emoji.name + ':' + emoji.id + '>'));

        this.client.on("interactionCreate", (i) => {
            if (!i.isCommand()) return
            if (i.commandName !== "fortnite") return
            if (!i.options.get('username')) return

            this.interaction = i;
            return void this.getStats()
        })


        this.client.on("interactionCreate", async (i) => {
            if (i.isSelectMenu() && i.user.id === i.customId.split(":")[3] && i.customId.startsWith("platform-select")) return this.handlePlatformSelect(i)

        })

    }

    private async getStats(): Promise<void> {
        const username = <string>this.interaction.options.get('username').value
        const platform = <string>this.interaction.options.get('platform')?.value || "epic"

        try {
            const embed = await this.getEmbed(username, platform, this.interaction.user.id)
            await this.interaction.reply({ embeds: [embed.e], content: loadingStr });
            this.updateWithRanks(this.interaction, embed.e, embed.name)
        } catch (e) {
            console.log(e.response.status)

            const row = new MessageActionRow().addComponents(
                new MessageSelectMenu()
                    .setCustomId(`platform-select-username:${username}:authorId:${this.interaction.user.id}`)
                    .addOptions(platformChoices.map(e => {
                        return {
                            label: e.name.split(">")[1],
                            emoji: e.name.split(">")[0],
                            value: e.value,
                            ...(e.value === platform && { default: true })
                        }
                    })),
            )

            await this.interaction.reply({
                content: `Error: "${e.response.data.error}"\n\nDid you specify the correct platform?`,
                components: [row]
            });
        }
    }

    private async handlePlatformSelect(i: SelectMenuInteraction<CacheType>): Promise<void> {
        const username = i.customId.split(":")[1]
        const platform = i.values[0]

        console.log(username, platform, i.customId.split(":")[3])
        i.component.options.splice(i.component.options.findIndex(o => o.default), 1);
        i.component.options.splice(i.component.options.findIndex(o => o.value === platform), 1);
        i.component.options = i.component.options.map((e) => ({ ...e, default: false }))
        i.component.placeholder = "";
        console.log(i.component)

        try {
            const embed = await this.getEmbed(username, platform, i.user.id);
            i.update({ embeds: [embed.e], components: [], content: loadingStr });
            this.updateWithRanks(i, embed.e, embed.name);
        }

        catch (e) {
            await i.update({ content: `Error: "${e.response.data.error}"\n\n`, components: i.component.options.length === 0 ? [] : [new MessageActionRow().addComponents(new MessageSelectMenu(i.component))] });
        }

    }

    private async getEmbed(username: string, platform: string, userId: string) {

        const r = await axios.get(`https://fortnite-api.com/v2/stats/br/v2?image=all&accountType=${platform}&name=${username}`, {
            headers: {
                'content-type': "application/json",
                'Authorization': process.env.FORTNITE_API_KEY
            }
        });

        const e = new MessageEmbed({ footer: { text: version } })
            .setTitle(`Fortnite stats for ${r.data.data.account.name}` || "No data");
        (userId === "481158632008974337" || userId == "539928835953524757") && e.addField("ID", r.data.data.account.id)
        e.addField("Battle Pass Level", `${r.data.data.battlePass.level}.${r.data.data.battlePass.progress}` || "No data")
            .addField("Wins", String(r.data.data.stats.all.overall.wins) || "No data")
            .addField("Solo Wins", String(r.data.data.stats.all?.solo?.wins) || "No data")
            .addField("Duo Wins", String(r.data.data.stats.all?.duo?.wins) || "No data")
            .addField("Squad Wins", String(r.data.data.stats.all?.squad?.wins) || "No data")
            .addField("LTM Wins", String(r.data.data.stats.all?.ltm?.wins) || "No data")
            .addField("KD", String(r.data.data.stats.all.overall.kd) || "No data")
            .addField("Win Rate", String(r.data.data.stats.all.overall.winRate + "%") || "No data")
            .addField("Kills", String(r.data.data.stats.all.overall.kills) || "No data")
            .addField("Matches", String(r.data.data.stats.all.overall.matches) || "No data")
            .addField("Days Played", String((r.data.data.stats.all.overall.minutesPlayed / 1440)) || "No data")
            .addField("Last Update", new Date(r.data.data.stats.all.overall.lastModified).toLocaleString("en-US", { timeZone: "America/New_York" }) || "No data")
            .setColor("#2186DB")
            .setTimestamp();


        // try {

        //     const { data } = await axios
        //         .get(`http://api.scraperapi.com/?api_key=${process.env.SCRAPER_API_KEY}&render=true&url=https://fortnitetracker.com/profile/all/${r.data.data.account.name.replace(" ", "%20")}/competitive`);
        //     // const data = await fs.readFile(`${__dirname}/index.html`)
        //     const $ = cheerio.load(data)
        //     let modes: EmbedField[] = []

        //     $(".profile-ranks__container").each(function (i, el) {
        //         modes.push({
        //             name: `Ranked - ${$(this).children(".profile-ranks__title").eq(0).text()}`,
        //             value: `${$(this).find(".profile-rank__value").eq(0).text()} - ${$(this).find(".profile-rank__progress-value").eq(0).text() || $(this).find(".profile-rank__rank--top").eq(0).text()}`,
        //             inline: false,
        //         })
        //     })

        //     console.log(e.fields)
        //     e.fields.splice(e.fields.findIndex(f => f.name.includes("Wins")), 0, ...modes)
        //     console.log(e.fields)

        // }

        // catch (err) {
        //     return e;
        // }


        return { e, name: r.data.data.account.name }
    }

    private async updateWithRanks(i: BaseCommandInteraction<CacheType> | SelectMenuInteraction<CacheType>, e: MessageEmbed, name: string) {
        try {

            const { data } = await axios
                .get(`http://api.scraperapi.com/?api_key=${process.env.SCRAPER_API_KEY}&render=true&url=https://fortnitetracker.com/profile/all/${name.replace(" ", "%20")}/competitive`);
            // const data = await fs.readFile(`${__dirname}/index.html`)
            const $ = cheerio.load(data)
            const modes: EmbedField[] = []

            $(".profile-ranks__container").each(function (i, el) {
                modes.push({
                    name: `Ranked - ${$(this).children(".profile-ranks__title").eq(0).text()}`,
                    value: `${$(this).find(".profile-rank__value").eq(0).text()} - ${$(this).find(".profile-rank__progress-value").eq(0).text() || $(this).find(".profile-rank__rank--top").eq(0).text()}`,
                    inline: false,
                })
            })

            e.fields.splice(e.fields.findIndex(f => f.name.includes("Wins")), 0, ...modes)
            console.log("modes", modes)
        }

        catch (err) { }
        return i.editReply({ embeds: [e], content: " " })
    }

}
