import { SlashCommandBuilder } from "@discordjs/builders";
import { TrelloConstants } from ".";

export const trelloCommand = new SlashCommandBuilder()
    .setName(TrelloConstants.TRELLO)
    .setDescription('See Creeper Bot\'s Trello')
    .addStringOption(o => o.setName(TrelloConstants.TYPE).setDescription(`Type of trello. ⬜ Board: Colum trello. ⬜ Spreadsheet: Row colum trello. ⬜ Default option: board 🛹`).setChoices([["board 🛹", TrelloConstants.BOARD], ["spreadsheet 📰", TrelloConstants.SPREADSHEET]]))
    .toJSON();