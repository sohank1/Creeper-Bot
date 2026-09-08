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


    .addSubcommandGroup(group => group
        .setName('cosmetic').setDescription('Fortnite cosmetic commands')
        .addSubcommand(subcommand => subcommand
            .setName('search').setDescription('Search for a Fortnite cosmetic')
            .addStringOption(o => o.setName('query').setDescription('Name, theme, artist or season—try pink bear skin, Metallica song, or C1S9 outfit').setAutocomplete(true).setRequired(true)))
        .addSubcommand(subcommand => subcommand
            .setName('missing').setDescription('View cosmetics returning after time away from the shop')
            .addStringOption(o => o.setName('date').setDescription('Shop date in UTC (YYYY-MM-DD); defaults to today'))
            .addIntegerOption(o => o.setName('days').setDescription('Minimum days away from the shop; defaults to 300').setMinValue(1).setMaxValue(100000)))
        .addSubcommand(subcommand => subcommand.setName('alerts').setDescription('Manage your alerts or view someone else’s watchlist')
            .addUserOption(option => option.setName('user').setDescription('Whose cosmetic alerts to view; defaults to yours'))))

    .addSubcommand(subcommand =>
        subcommand
            .setName('sprites')
            .setDescription('Browse Fortnite sprites by season, variant, rarity, location, and dust cost')
            .addStringOption(o => o.setName('season').setDescription('Show sprites available during a specific season').setAutocomplete(true))
            .addStringOption(o => o.setName('search').setDescription('Search by sprite family, variant, rarity, effect, or cost').setAutocomplete(true)))

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
