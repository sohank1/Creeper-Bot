import { ContextMenuCommandBuilder } from "@discordjs/builders";
import { ApplicationCommandType } from "discord-api-types/v9";

export const replyFetcherCommand = new ContextMenuCommandBuilder()
    .setName('Get all replies')
    .setType(ApplicationCommandType.Message)

    .toJSON()