import { SlashCommandBuilder } from "@discordjs/builders";

export const avatarCommand = new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('See the profile picture of a user')
    .addUserOption(o => o.setName("user").setDescription("The user to see the profile picture of").setRequired(true))
    .addStringOption(o => o.setName("size").setDescription("The size of the avatar. Default is 4096").addChoices([
        ["4096 (default)", "4096",],
        ["2048", "2048",],
        ["1024", "1024",],
        ["600", "600",],
        ["512", "512",],
        ["300", "300",],
        ["256", "256",],
        ["128", "128",],
        ["96", "96",],
        ["64", "64",],
        ["56", "56",],
        ["32", "32",],
        ["16", "16",],
    ]))

    .addStringOption(o => o.setName("format").setDescription("The file format of the avatar. Default is webp").addChoices([
        ["webp (default)", "webp",],
        ["png", "png",],
        ["jpg", "jpg",],
        ["jpeg", "jpeg",],
    ]))

    .toJSON()