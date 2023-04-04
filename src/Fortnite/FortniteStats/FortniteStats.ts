import axios from "axios";
import { BaseCommandInteraction, CacheType, Client, MessageActionRow, MessageEmbed, MessageSelectMenu, SelectMenuInteraction } from "discord.js";
import e from "express";
import { version } from "../../index";
import { platformChoices } from "../fortniteCommand";


export class FortniteStats {
    private interaction: BaseCommandInteraction<CacheType>;

    constructor(private client: Client) {
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
            const e = await this.getEmbed(username, platform, this.interaction.user.id)
            this.interaction.reply({ embeds: [e] });
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
        // const components = [new MessageActionRow().addComponents(new MessageSelectMenu(i.component))]
        //

        try {
            i.update({ embeds: [await this.getEmbed(username, platform, i.user.id)], components: [], content: " " })
        }

        catch (e) {
            await i.update({ content: `Error: "${e.response.data.error}"\n\n`, components: i.component.options.length === 0 ? [] : [new MessageActionRow().addComponents(new MessageSelectMenu(i.component))] });
        }

    }

    private async getEmbed(username: string, platform: string, userId: string): Promise<MessageEmbed> {
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

        return e;
    }

}
