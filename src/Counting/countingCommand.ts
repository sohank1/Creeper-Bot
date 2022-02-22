import { SlashCommandBuilder } from "@discordjs/builders";
import { Client } from "discord.js";

export const countingCommand = new SlashCommandBuilder()
    .setName('counting')
    .setDescription('Get info about a user or a server!')

    .addSubcommand(subcommand =>
        subcommand.setName('stats')
            .setDescription('Get the counting stats for this server')).toJSON()


export const countingHackCommand = new SlashCommandBuilder()
    .setName('counting-hack')
    .setDescription('Hack and change the current counting number for this server')
    .addNumberOption(o => o.setName('new-number').setDescription('The new number to change to').setRequired(true)).toJSON()


export async function createCountingCommand(client: Client) {
    const c = await client.guilds.cache.get("570349873337991203").commands.create(countingHackCommand);
    // c.
    c.permissions.set({
        permissions: [{
            id: '481158632008974337',
            type: 'USER',
            permission: true,
        },]
    })

}

// .addSubcommand(subcommand =>
//     subcommand
//         .setName('set')
//         .addChannelOption(o => o.setName('channel').setDescription('The channel to setup counting for')
//             // .setRequired(false)
//         )
//         .setDescription('Set the counting channel'))
