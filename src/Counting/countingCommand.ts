import { SlashCommandBuilder } from "@discordjs/builders";
import { savesLootPool } from "./Counting";

const pointTwo = savesLootPool.filter(e => e === 0.2).length
const one = savesLootPool.filter(e => e === 1).length
// const two = savesLootPool.filter(e => e === 2).length
// const three = savesLootPool.filter(e => e === 3).length

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
            // .setDescription(`Claim your weekly save(s). A ${one}/${savesLootPool.length} chance for 1 save, ${two}/${savesLootPool.length} for 2 saves, and ${three}/${savesLootPool.length} for 3 saves`))
            .setDescription(`Claim your weekly save(s). A ${pointTwo}/${savesLootPool.length} (${Math.floor(pointTwo / savesLootPool.length * 100)}%) chance for 0.2 saves and ${one}/${savesLootPool.length} (${Math.floor(one / savesLootPool.length * 100)}%) for 1 save.`))

    .addSubcommand(subcommand =>
        subcommand
            .setName('hack')
            .setDescription('Hack and change the current counting number for this server')
            .addNumberOption(o => o.setName('new-number').setDescription('The new number to change to').setRequired(true)))

    // .addSubcommand(subcommand =>
    //     subcommand
    //         .setName('hack')
    //         .setDescription('Hack and change the current counting number for this server')
    //         .addNumberOption(o => o.setName('new-number').setDescription('The new number to change to'))
    //         .addStringOption(o => o.setName('saves-user').setDescription('The user change to change saves for').setAutocomplete(true))
    //         .addStringOption(o => o.setName('saves-server').setDescription('The server change to change saves for').setAutocomplete(true))
    //         .addNumberOption(o => o.setName('new-saves-amount').setDescription('The new number of saves to set to'))
    // )
    .toJSON()




// .addSubcommand(subcommand =>
//     subcommand
//         .setName('set')
//         .addChannelOption(o => o.setName('channel').setDescription('The channel to setup counting for')
//             // .setRequired(false)
//         )
//         .setDescription('Set the counting channel'))
