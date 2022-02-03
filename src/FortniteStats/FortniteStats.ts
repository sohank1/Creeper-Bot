import { SlashCommandBuilder } from "@discordjs/builders";
import axios from "axios";
import { BaseCommandInteraction, CacheType, Client, MessageEmbed } from "discord.js";
import { version } from "../index";

export const fortniteCommand = new SlashCommandBuilder()
    .setName('fortnite')
    .setDescription('Fortnite commands')

    .addSubcommand(subcommand =>
        subcommand.setName('stats')
            .setDescription('Get Fortnite Stats for a player')
            .addStringOption(o => o.setName('epic').setDescription('The Epic Games username of the player').setRequired(true))).toJSON()

export class FortniteStats {
    private interaction: BaseCommandInteraction<CacheType>;

    constructor(private client: Client) {


        client.on("interactionCreate", (i) => {

            if (!i.isCommand()) return
            if (i.commandName !== "fortnite") return
            if (!i.options.get('epic')) return

            this.interaction = i;
            return void this.getStats()
        })

    }

    private async getStats(): Promise<void> {
        const username = this.interaction.options.get('epic').value
        try {
            const r = await axios.get(`https://fortnite-api.com/v2/stats/br/v2?image=all&name=${username}`, {
                headers: {
                    'content-type': "application/json",
                    'Authorization': process.env.FORTNITE_API_KEY
                }
            });
            // message.channel.send(`${username} is level ${r.data.data.battlePass.level}.${r.data.data.battlePass.progress}. Wins: ${r.data.data.stats.all.overall.wins} KD: ${r.data.data.stats.all.overall.kd} Kills: ${r.data.data.stats.all.overall.kills} Matches: ${r.data.data.stats.all.overall.matches} Stats as of: ${new Date(r.data.data.stats.all.overall.lastModified).toLocaleString("en-US", { timeZone: "America/New_York" })}`);
            const e = new MessageEmbed({ footer: { text: version } })
                .setTitle(`Fortnite stats for ${r.data.data.account.name}` || "No data")
                .addField("Battle Pass Level", `${r.data.data.battlePass.level}.${r.data.data.battlePass.progress}` || "No data")
                .addField("Wins", String(r.data.data.stats.all.overall.wins) || "No data")
                .addField("Solo Wins", String(r.data.data.stats.all?.solo?.wins) || "No data")
                .addField("Duo Wins", String(r.data.data.stats.all?.duo?.wins) || "No data")
                .addField("Squad Wins", String(r.data.data.stats.all?.squad?.wins) || "No data")
                .addField("LTM Wins", String(r.data.data.stats.all?.ltm?.wins) || "No data")
                .addField("KD", String(r.data.data.stats.all.overall.kd) || "No data")
                .addField("Win Rate", String(r.data.data.stats.all.overall.winRate + "%") || "No data")
                .addField("Kills", String(r.data.data.stats.all.overall.kills) || "No data")
                .addField("Matches", String(r.data.data.stats.all.overall.matches) || "No data")
                .addField("Days Played", String((r.data.data.stats.all.overall.minutesPlayed / 60 / 24)) || "No data")
                .addField("Last Update", new Date(r.data.data.stats.all.overall.lastModified).toLocaleString("en-US", { timeZone: "America/New_York" }) || "No data")
                .setColor("#2186DB")
                .setTimestamp();

            console.log(e)
            this.interaction.reply({ embeds: [e] });
        } catch (e) {
            console.log(e)
            return void this.interaction.reply("Dumbahh, profile doesn't exist or it's private.")

        }
    }

}