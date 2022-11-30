import { SlashCommandBuilder } from "@discordjs/builders";

export const fortniteCommand = new SlashCommandBuilder()
    .setName('fortnite')
    .setDescription('Fortnite commands')

    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('Get Fortnite Stats for a player')
            .addStringOption(o => o.setName('epic').setDescription('The Epic Games username of the player').setRequired(true)))


    .addSubcommand(subcommand =>
        subcommand
            .setName('cosmetic')
            .setDescription('Search for a Fortnite cosmetic')
            .addStringOption(o => o.setName('query').setDescription('The cosmetic you are searching for').setAutocomplete(true).setRequired(true)))
    .toJSON()