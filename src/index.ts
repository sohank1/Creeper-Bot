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
import { fortniteCommand, FortniteStats } from "./FortniteStats/";
import { Trello, trelloCommand } from "./Trello";
import { Avatar, avatarCommand } from "./AvatarCommand";
import { DeletedClient } from "./DeletedClient/";
import { ShopSectionsTracker } from "./ShopSections/ShopSectionsTracker";
import { createClient } from "redis";
import express from "express";
import mongoose from "mongoose";
import { spawn } from "child_process";

export const version = `v${require("../package.json").version}`;
export const TEST_SERVER = "695646961763614740";

export const redis = createClient({ url: process.env.REDIS_URI, });
const subscriber = redis.duplicate();
redis.connect()
subscriber.connect();

const key = "creeper_bot_prod_server";
const serverStartedAt = new Date().toISOString();




const app = express();
const port = process.env.PORT || 3001;
app.get("/", (req, res) => res.json({ serverStartedAt, version }));
app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)


  setInterval(() => {
    try {
      if (process.env.NODE_ENV === "production" && process.env?.HOST_TYPE === "render") {
        console.log('fetching onrender url')
        axios.get('https://creeper-bot.onrender.com/');
      }
      // var os = require('os');

      //   console.log(os.cpus());
      //   console.log(os.totalmem() / 1024 / 1024);
      //  console.log(os.freemem() / 1024 / 1024)
    }
    catch (e) {
      console.log(e.message);
    }
  }, 5000)



  // const client = new Client({ restTimeOffset: 30, intents: new Intents(32767) });
  const client = new Client({ restTimeOffset: 75, intents: new Intents(["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS",]) });
  client.login(process.env.NODE_ENV == 'production' ? process.env.BOT_TOKEN : process.env.DEV_BOT_TOKEN);

  const prefix = "c!";


  // let music: Music;

  try {
    client.on("ready", async () => {

      const c = (<TextChannel>client.channels.cache.get('767763290004652037')) || (<TextChannel>client.channels.cache.get("725143127723212830"))

      // stop errors from crashing program
      process.on('uncaughtException', (error) => {
        console.error(error.stack);
        c?.send(
          `There was an error: 
      \`\`\`json
        ${JSON.stringify(error, null, 2)}
      \`\`\`
      `)
      });


      (async function () {


        if (process.env.NODE_ENV !== "production") return


        await redis.publish(key, JSON.stringify({
          serverStartedAt,
          platform: process.env.HOST_TYPE
        }));
        c.send(
          `New server is here: 
        \`\`\`json
        ${JSON.stringify({ serverStartedAt, platform: process.env.HOST_TYPE }, null, 2)}
        \`\`\`
          `)


        // redis.hSet(key, { serverStartedAt, platform: process.env.HOST_TYPE });


      })()



      subscriber.subscribe(key, async (m) => {
        if (process.env.NODE_ENV !== "production") return

        console.log('we got new data')
        const data = JSON.parse(m)
        c.send(`new data, ${m}`)

        // if the platform of the new server is not the same as new server OR the current server is newer or the same as the new one, then do not clean up current server 
        // c.send('checking if we should clean up')
        // c.send(`are the platforms the same? ${data.platform === process.env.HOST_TYPE}`)
        // if (data.platform !== process.env.HOST_TYPE || new Date(serverStartedAt) >= new Date(data.serverStartedAt)) return
        if (data.platform !== process.env.HOST_TYPE || new Date(serverStartedAt) === new Date(data.serverStartedAt)) return
        await c.send('we r cleaning up')

        await c.send(
          `A new server has started that is on the same host as this, the date of the new server is more than this server. Shutting down the current one. Here's the new server's data
          \`\`\`json
          ${JSON.stringify(data, null, 2)}
          \`\`\`

          Here's the current server's data
          \`\`\`json
          ${JSON.stringify({ serverStartedAt, platform: process.env.HOST_TYPE }, null, 2)}
          \`\`\`
          `
        )

        await c.send("spawning new script and shutting down current one")
        spawn('node ./server.js', { detached: true })
        process.exit(0)
        // client.destroy();
        // await mongoose.connection.close();
        // await redis.quit();
        // await subscriber.quit();
      });


      client.application.commands.fetch().then(console.log);

      // (await client.guilds.fetch(TEST_SERVER))?.commands.set([countingCommand]);

      // Register Slash Commands
      client.application.commands.create(countingCommand)
      client.application.commands.create(fortniteCommand)
      client.application.commands.create(avatarCommand)

      // client.application.commands.create({
      //   options: [{}]
      //  })


      const instance = process.env.NODE_ENV === 'production' ? process.env.NODE_ENV : 'development';

      console.log(c.name)
      c.send(`${client.user.tag} has logged in at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}. Instance is on **${instance}**. Version is ${version}`);
      console.log(`${client.user.tag} has logged in at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}. Instance is on **${instance}**.`);
      client.user.setActivity(`${version}, c!creeper-bot-help`);
      new DeletedClient(client)
      new Counting(client);
      new FortniteStats(client);
      new News(client);
      // new DonaldTracker(client);
      new Trello(client);
      new Avatar(client)
      new ShopSectionsTracker(client)

      // music = new Music(client);
      // new Teasers(client);


      // client.guilds.cache.get("570349873337991203").commands.set([])
    });



    client.on("messageCreate", async (message) => {
      if (!message.author.bot && message.content.toLowerCase().includes("who asked") || message.content.toLowerCase().includes("didn't ask") || message.content.toLowerCase().includes("didn't ask")) message.channel.send(`After heavy contemplation, I have finally figured out how to answer the popular question, “Who asked?“

The obvious response to “who asked?“ is “nobody.“  That’s right, nobody asked.  In other words, the person who asked is “imaginary.“

In mathematics, an “imaginary“ figure is the square root of -1.  This can also be simplified to the variable, i.

So, “nobody“=an imaginary figure=the square root of -1=i 

So, “nobody“=i 

This can be substituted back into the response to “who asked?“, yielding an answer of “i asked.“

That’s right, the answer to “who asked?“ is i.  

I ASKED.`)

      if (message.content.toLowerCase() === "t!ping") {
        message.channel.send("Pinging...").then((m) => {
          let ping = m.createdTimestamp - message.createdTimestamp;
          let choices = ["Is this really my ping", "Is it okay? I cant look", "I hope it isnt bad", "He's lagging bro"];
          let response = choices[Math.floor(Math.random() * choices.length)];

          m.edit(`${response}: Bot Latency: \`${ping}\`, API Latency: \`${Math.round(client.ws.ping)}\` host: ${process.env.HOST_TYPE} took ${Math.floor(Date.now() - m.createdAt.getTime())}ms ${m.createdAt.toISOString()}, ${new Date().toISOString()} serverStartedAt: ${serverStartedAt}`);
        });
      }
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

})
