import { SlashCommandBuilder } from "@discordjs/builders";

export const fortniteCommand = new SlashCommandBuilder()
    .setName('fortnite')
    .setDescription('Fortnite commands')

    .addSubcommand(subcommand =>
        subcommand.setName('stats')
            .setDescription('Get Fortnite Stats for a player')
            .addStringOption(o => o.setName('epic').setDescription('The Epic Games username of the player').setRequired(true))).toJSON()