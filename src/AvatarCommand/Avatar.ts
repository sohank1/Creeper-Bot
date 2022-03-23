import axios from "axios";
import { AllowedImageFormat, AllowedImageSize, BaseCommandInteraction, CacheType, Client, DynamicImageFormat, MessageEmbed } from "discord.js";
import { version } from "../index";


export class Avatar {
    private interaction: BaseCommandInteraction<CacheType>;

    constructor(private client: Client) {


        this.client.on("interactionCreate", (i) => {

            if (!i.isCommand()) return
            if (i.commandName !== "avatar") return

            this.interaction = i;
            return void this.sendAvatar()
        })

    }

    private async sendAvatar(): Promise<void> {
        await this.interaction.deferReply();

        const user = await this.interaction.options.getUser('user').fetch()
        const size = <AllowedImageSize><unknown>+this.interaction.options.get("size")?.value || 4096
        const format = <DynamicImageFormat><unknown>this.interaction.options.get("format")?.value || "webp"

        const url = user.avatarURL({ dynamic: true, size, format })

        const e = new MessageEmbed({ footer: { text: version }, author: { iconURL: url, name: `${user.username}'s avatar` } })
            .setImage(url)
            .setColor(user.accentColor || "#2186DB")
            .setTimestamp();

        this.interaction.editReply({ embeds: [e] });
    }

}