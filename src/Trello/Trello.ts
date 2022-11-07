import { SlashCommandBuilder } from "@discordjs/builders";
import { BaseCommandInteraction, CacheType, Client, MessageActionRow, MessageAttachment, MessageButton, MessageEmbed } from "discord.js";
import { TrelloConstants } from ".";
// import { browser } from "../DonaldTracker/DonaldTracker";

export class Trello {
    private interaction: BaseCommandInteraction<CacheType>;

    constructor(private client: Client) {


        client.on("interactionCreate", (i) => {

            if (!i.isCommand()) return
            if (i.commandName !== TrelloConstants.TRELLO) return

            this.interaction = i;
            return void this.sendImage()
        })

    }

    private async sendImage(): Promise<void> {
        this.interaction.deferReply();
        let url: string;
        // const page = await (await browser).newPage();

        const type = this.interaction.options.get(TrelloConstants.TYPE)?.value || TrelloConstants.BOARD

        // if (type === TrelloConstants.BOARD) {
        //     page.setViewport({ width: 2570, height: 1080 })
        //     url = 'https://github.com/users/CreeperPlanet26/projects/2/views/10'
        // }


        // if (type === TrelloConstants.SPREADSHEET) {
        //     page.setViewport({ width: 1570, height: 800 })
        //     url = 'https://github.com/users/CreeperPlanet26/projects/2/views/1'
        // }

        // await page.cookies(url);
        // page.setCookie({
        //     name: "color_mode",
        //     value: "%7B%22color_mode%22%3A%22dark%22%2C%22light_theme%22%3A%7B%22name%22%3A%22light%22%2C%22color_mode%22%3A%22light%22%7D%2C%22dark_theme%22%3A%7B%22name%22%3A%22dark%22%2C%22color_mode%22%3A%22dark%22%7D%7D"
        // })

        // await page.goto(url, { waitUntil: 'networkidle2', });
        // page.waitForNavigation({ waitUntil: "networkidle2" })
        // await page.waitForTimeout(1000)

        // const row = new MessageActionRow()
        //     .addComponents(
        //         new MessageButton()
        //             .setLabel('Visit')
        //             .setStyle('LINK')
        //             .setURL(url)
        //     )

        // this.interaction.editReply({ files: [await page.screenshot({ fullPage: true }) as Buffer], components: [row] })
    }

}