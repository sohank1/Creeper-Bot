import "dotenv/config";
import './database';
import axios from "axios";
import { CategoryChannel, Client, Intents, MessageEmbed, TextChannel } from "discord.js";
import Teasers from "./teasers";
// import { Music } from "./music/Music";
import { News } from "./news/news";
import { DonaldTracker } from "./DonaldTracker/DonaldTracker";
import { Counting, countingCommand } from "./Counting/";
import { SlashCommandBuilder } from "@discordjs/builders";
import { fortniteCommand, FortniteStats } from "./FortniteStats/FortniteStats";
import { Trello, trelloCommand } from "./Trello";
import { countingHackCommand, createCountingCommand } from "./Counting/countingCommand";



// const client = new Client({ restTimeOffset: 30, intents: new Intents(32767) });
const client = new Client({ intents: new Intents(["GUILDS", "GUILD_MESSAGES"]) });
client.login(process.env.NODE_ENV == 'production' ? process.env.BOT_TOKEN : process.env.DEV_BOT_TOKEN);
const prefix = "c!";

export const version = `v${require("../package.json").version}`;


// let music: Music;

try {
  client.on("ready", async () => {



    // console.log(client.guilds.cache.get("685935846557614120").channels.cache.forEach((c: TextChannel) => console.log(`Name: ${c.name}, Position: ${c.position}, Parent: ${c.parent?.name}`)))

    // client.application.commands.fetch().then(console.log)

    client.guilds.cache.get("570349873337991203").commands.set([trelloCommand, countingCommand]);

    // Register Slash Commands
    client.application.commands.create(countingCommand)
    client.application.commands.create(countingHackCommand)
    client.application.commands.create(fortniteCommand)

    // client.application.commands.create({
    //   options: [{}]
    //  })


    const instance = process.env.NODE_ENV === 'production' ? process.env.NODE_ENV : 'development';
    (<TextChannel>client.channels.cache.get('767763290004652037')).send(`${client.user.tag} has logged in at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}. Instance is on **${instance}**. Version is ${version}`);
    console.log(`${client.user.tag} has logged in at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}. Instance is on **${instance}**.`);
    client.user.setActivity(`${version}, c!creeper-bot-help`);
    new Counting(client);
    new FortniteStats(client);
    new News(client);
    new DonaldTracker(client);
    new Trello(client);
    // music = new Music(client);
    // new Teasers(client);


    // client.guilds.cache.get("570349873337991203").commands.set([])

    await createCountingCommand(client)
  });



  client.on("messageCreate", async (message) => {
    if (message.content.toLowerCase().startsWith("c!date")) {


      const dateStr = `${message.content.split("c!date ")[1]} EST`;
      if (!dateStr) return void message.channel.send("Please enter a date string");

      try {
        const estDate = new Date(dateStr);

        return void message.channel.send(`\`\`\`\n${estDate.toISOString()}\n\`\`\``);


      } catch (e) {
        return void message.channel.send(`Please format your date string using valid JavaScript Date rules. ex. **${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}**`);
      }
    }


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
        message.channel.send({ embeds: [embed] });
        break;

      case "embed-test":
        const embedtest = new MessageEmbed();
        embedtest.setTitle("Info");
        embedtest.setDescription("This message is embeded. This is test 12.");
        embedtest.setColor("#2186DB");
        message.channel.send({ embeds: [embedtest] });
        break;

      case "creeper-bot-help":
        const HelpEmbed = new MessageEmbed();
        HelpEmbed.setTitle("Help");
        HelpEmbed.setDescription("All commands and info about the bot will be listed here never!");
        HelpEmbed.setColor("#2186DB");
        message.author.send({ embeds: [HelpEmbed] });
        break;

      case "join":
        // music.join();
        break;

      case "leave":
        // music.leave(message);
        break;
    }

    if (message.content.startsWith('c!shutdown')) {
      if (message.author.id !== '481158632008974337') return void message.channel.send("What a idiot!. You don't have permission to preform that action.");

      if (process.env.NODE_ENV === 'production') {
        await message.channel.send('Instance is on **production**. Shutting down to stop counting from breaking...');
        client.destroy();
        process.exit();
      }
      else message.channel.send('Instance is on **development**. Did not shut down.');
    }
  });


  client.on("ready", () => console.log(`${client.user.tag} has logged in.`));
} catch (err) {
  (<TextChannel>client.channels.cache.get('767763290004652037')).send(`An error has occurred: ${err}`);
}


