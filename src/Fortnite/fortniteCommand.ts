import { SlashCommandBuilder } from "@discordjs/builders";


export const platformChoices = [
    { name: "<:epicgames:1092603394373472356> Epic Games", value: "epic" },
    { name: "<:xbox:1092603259614662656> Xbox", value: "xbl" },
    { name: "<:playstation:1092603290635751484> PlayStation", value: "psn" }
]

export const fortniteCommand = new SlashCommandBuilder()
    .setName('fortnite')
    .setDescription('Fortnite commands')

    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('Get Fortnite Stats for a player')
            .addStringOption(o => o.setName('username').setDescription("The username of the player's platform").setRequired(true))
            .addStringOption(o => o.setName("platform").setDescription("The platform that the username is. (Default: Epic Games)")
                .setChoices(platformChoices.map(e => <[name: string, value: string]>[e.name.split(">")[1], e.value])))

    )


    .addSubcommand(subcommand =>
        subcommand
            .setName('cosmetic')
            .setDescription('Search for a Fortnite cosmetic')
            .addStringOption(o => o.setName('query').setDescription('The cosmetic you are searching for').setAutocomplete(true).setRequired(true)))

    .addSubcommandGroup(group =>
        group
            .setName('map')
            .setDescription('Fortnite map commands')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('view')
                    .setDescription('Search for a specific Fortnite map version')
                    .addStringOption(o => o.setName('version').setDescription('The version of the map').setAutocomplete(true).setRequired(true))
            )
            .addSubcommand(subcommand =>
                subcommand
                    .setName('options')
                    .setDescription('View all Fortnite map versions')
            )
    )
    .toJSON()