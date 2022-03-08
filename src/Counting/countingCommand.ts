import { SlashCommandBuilder } from "@discordjs/builders";

export const countingCommand = new SlashCommandBuilder()
    .setName('counting')
    .setDescription('Get info about a user or a server!')

    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('Get the counting stats for this server'))

    .addSubcommand(subcommand =>
        subcommand
            .setName('hack')
            .setDescription('Hack and change the current counting number for this server')
            .addNumberOption(o => o.setName('new-number').setDescription('The new number to change to').setRequired(true)))
    .toJSON()




// .addSubcommand(subcommand =>
//     subcommand
//         .setName('set')
//         .addChannelOption(o => o.setName('channel').setDescription('The channel to setup counting for')
//             // .setRequired(false)
//         )
//         .setDescription('Set the counting channel'))
