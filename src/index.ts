import "dotenv/config";
import './database';

import { Client, MessageEmbed } from "discord.js";
import Teasers from "./teasers";
import { Music } from "./music/Music";
import { News } from "./news/news";
const client = new Client();
client.login(process.env.BOT_TOKEN);
const prefix = "c!";

let music: Music;

client.on("ready", () => {
    console.log(`${client.user.tag} has logged in.`);
    client.user.setActivity("c!creeper-bot-help");
    new News(client);
    // music = new Music(client);
    // new Teasers(client);
});

client.on("message", async (message) => {
    let args = message.content.substring(prefix.length).split(" ");


    switch (args[0]) {
        case "test":
            message.channel.send("Test 18 works!");
            break;

        case "Patch":
            message.channel.send("https://imgur.com/mEab2Sm");
            break;

        case "Creepers-Turtle-Wars-v3.0.1":
            message.channel.send("https://imgur.com/hKrXraM");
            break;

        case "Creepers-Turtle-Wars-v4.0":
            message.channel.send("https://imgur.com/6u32Dxa");
            break;

        case "Creepers Turtle Wars v4.0":
            message.channel.send("https://imgur.com/6u32Dxa");
            break;

        case "log-off":
            message.channel.send("Im still on.");
            break;

        case "embed":
            const embed = new MessageEmbed();
            embed.setTitle("Username");
            embed.setDescription(message.author.username);
            message.channel.send(embed);
            break;

        case "embed-test":
            const embedtest = new MessageEmbed();
            embedtest.setTitle("Info");
            embedtest.setDescription("This message is embeded. This is test 12.");
            embedtest.setColor("#2186DB");
            message.channel.send(embedtest);
            break;

        case "creeper-bot-help":
            const HelpEmbed = new MessageEmbed();
            HelpEmbed.setTitle("Help");
            HelpEmbed.setDescription("All commands and info about the bot will be listed here never!");
            HelpEmbed.setColor("#2186DB");
            message.author.send(HelpEmbed);
            break;

        case "join":
            music.join();
            break;

        case "leave":
            music.leave(message);
            break;
    }
});
