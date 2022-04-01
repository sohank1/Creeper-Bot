import { SlashCommandBuilder } from "@discordjs/builders";
import { savesLootPool } from "./Counting";

const one = savesLootPool.filter(e => e === 1).length
const two = savesLootPool.filter(e => e === 2).length
const three = savesLootPool.filter(e => e === 3).length

export const countingCommand = new SlashCommandBuilder()
    .setName('counting')
    .setDescription('Get info about a user or a server!')

    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('Get the counting stats for this server'))

    .addSubcommand(subcommand =>
        subcommand
            .setName('claim')
            .setDescription(`Claim your weekly save(s). A ${one} in ${savesLootPool.length} chance for 1 save, ${two} in ${savesLootPool.length} for 2 saves, and ${three} in ${savesLootPool.length} for 3 saves`))

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
