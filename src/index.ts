import "dotenv/config";
import './database';
import axios from "axios";
import { CategoryChannel, Client, Intents, MessageEmbed, TextChannel, Util } from "discord.js";
import Teasers from "./teasers";
// import { Music } from "./music/Music";
import { News } from "./news/news";
import { DonaldTracker } from "./DonaldTracker/DonaldTracker";
import { Counting, countingCommand } from "./Counting/";
import { SlashCommandBuilder } from "@discordjs/builders";
import { fortniteCommand, FortniteCosmetics, FortniteStats } from "./Fortnite/";
import { Trello, trelloCommand } from "./Trello";
import { Avatar, avatarCommand } from "./AvatarCommand";
import { DeletedClient } from "./DeletedClient/";
import { ShopSectionsTracker } from "./ShopSections/ShopSectionsTracker";
import { createClient } from "redis";
import express from "express";
import mongoose from "mongoose";
import { MissingCosmetics } from "./MissingCosmetics/MissingCosmetics";
// import { ProcessCodes } from "./InstanceManager";

export const version = `v${require("../package.json").version}`;
export const TEST_SERVER = "640262033329356822";

export const redis = createClient({ url: process.env.REDIS_URI, });
// const subscriber = redis.duplicate();
// redis.connect()
// subscriber.connect();

const key = "creeper_bot_prod_server";
// const shutdownEvent = "creeper_bot_prod_server_shutdown";
const serverStartedAt = new Date().toISOString();

const app = express();
const port = process.env.PORT || 3001;
app.get("/", (_, res) => {
  res.status(200).json({ serverStartedAt, version })
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}!`)


  setInterval(() => {
    try {
      if (process.env.NODE_ENV === "production" && process.env?.HOST_TYPE === "render") {
        console.log('fetching onrender url from main app')
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
  }, 30000) // 10 mins = 600000, 30 secs = 30000



  // const client = new Client({ restTimeOffset: 30, intents: new Intents(32767) });
  const client = new Client({ restTimeOffset: 75, intents: new Intents(["GUILDS", "GUILD_MESSAGES", "GUILD_MEMBERS",]) });
  client.login(process.env.NODE_ENV == 'production' ? process.env.BOT_TOKEN : process.env.DEV_BOT_TOKEN);

  const prefix = "c!";

  // let music: Music;

  try {
    client.on("ready", async () => {

      const c = (<TextChannel>client.channels.cache.get('1045086199053820004')) || (<TextChannel>client.channels.cache.get("725143127723212830"))

      const countChannel = (<TextChannel>client.channels.cache.get('1039551711263588372')) || (<TextChannel>client.channels.cache.get('1045085555878273136'))
      let count = 1;
      process.env.NODE_ENV === "production" && setInterval(async () => {
        if (count === 1) countChannel.send("**---------------------------------------------**")
        countChannel.send(`[\`${serverStartedAt}\`] ---- count: ${count} ---- [\`${version}\`]`)
        count++;

        // const serverInfo = JSON.parse(await redis.get(key));
        // const lastPing = new Date()
        // serverInfo.instances.find((i) => i.serverStartedAt === serverStartedAt).lastPing = lastPing.toISOString();
        // await redis.set(key, JSON.stringify(serverInfo));

        // // find servers that have not pinged in 20 seconds and delete
        // const serversToDelete = serverInfo.instances.filter((i) => i.platform === process.env.HOST_TYPE && new Date().getTime() - 20000 > new Date(i.lastPing).getTime())
        // for (const s of serversToDelete) {
        //   c?.send("removing old server from array as it has gone inactive: " + s.serverStartedAt)
        //   // remove the server from the array
        //   serverInfo.instances.splice(serverInfo.instances.indexOf(s.serverStartedAt), 1);
        //   await redis.set(key, JSON.stringify(serverInfo));
        //   // await redis.publish(shutdownEvent, s.serverStartedAt);
        // }

        // // find all the oldest servers but no the newest one
        // const serversToShutdown = serverInfo.instances.filter((i) => i.platform === process.env.HOST_TYPE).sort((a, b) => new Date(a.serverStartedAt).getTime() - new Date(b.serverStartedAt).getTime()).slice(0, -1)

      }, 10000)

      // await redis.connect();
      // process.env.NODE_ENV === "production" && setInterval(async () => {
      //   const s = await redis.get(key);
      //   const parsed = JSON.parse(s);
      //   console.log("parsed json", parsed);
      // }, 5000)

      // stop errors from crashing program
      process.on('uncaughtException', (error) => {
        console.error("here is the error stack", error.stack);
        console.log("uncaughtException happened", error)
        //   c?.send(
        //     `There was an error: 
        // \`\`\`json
        //   ${JSON.stringify(error, null, 2)}
        // \`\`\`
        // `)
      });


      // (async function () {
      //   if (process.env.NODE_ENV !== "production") return;
      //   const sessionInfo = { serverStartedAt, platform: process.env.HOST_TYPE }

      //   // let sessionInfo = JSON.parse(await redis.get(key));
      //   // if (!sessionInfo) {
      //   //   sessionInfo = { instances: [{ serverStartedAt, platform: process.env.HOST_TYPE }] };
      //   //   await redis.set(key, JSON.stringify(sessionInfo));
      //   // }

      //   // else {
      //   //   sessionInfo.instances.push({ serverStartedAt, platform: process.env.HOST_TYPE });
      //   //   await redis.set(key, JSON.stringify(sessionInfo))
      //   // }

      //   await redis.publish(key, JSON.stringify(sessionInfo));

      //   c.send(
      //     `Created new server: 
      //   \`\`\`json
      //   ${JSON.stringify(sessionInfo, null, 2)}
      //   \`\`\`
      //     `)
      // })()


      // subscriber.subscribe(key, async (m) => {
      //   if (process.env.NODE_ENV !== "production") return

      //   console.log('we got new data from redis subscription')
      //   const data = JSON.parse(m)
      //   c.send(`new data, ${m}`)


      //   // if the platform of the new server is not the same as new server OR the current server is newer or the same as the new one, then do not clean up current server 
      //   // if (data.platform !== process.env.HOST_TYPE || !(new Date(data.serverStartedAt) > new Date(serverStartedAt))) return

      //   if (data.platform === process.env.HOST_TYPE && new Date(data.serverStartedAt) > new Date(serverStartedAt)) {
      //     await c.send('we r cleaning up')

      //     await c.send(
      //       `A new server has started that is on the same host as this, the date of the new server is more than this server. Shutting down the current one. Here's the new server's data
      //     \`\`\`json
      //     ${JSON.stringify(data, null, 2)}
      //     \`\`\`
      //     >
      //     Here's the current server's data
      //     \`\`\`json
      //     ${JSON.stringify({ serverStartedAt, platform: process.env.HOST_TYPE }, null, 2)}
      //     \`\`\`
      //     `
      //     )

      //     await c.send(`shutting down: \`${serverStartedAt}\` and spawning post script`)
      //     process.send(ProcessCodes.Shutdown)
      //   }
      //   // client.destroy();
      //   // await mongoose.connection.close();
      //   // await redis.quit();
      //   // await subscriber.quit();
      // });


      client.application.commands.fetch().then(console.log);

      //  (await client.guilds.fetch(TEST_SERVER))?.commands.set([fortniteCommand]);

      // Register Slash Commands
      client.application.commands.set([countingCommand, fortniteCommand, avatarCommand])
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
      process.env.NODE_ENV === "production" && new News(client);
      // process.env.NODE_ENV === "production" && new DonaldTracker(client);
      // new Trello(client);
      new Avatar(client)
      new ShopSectionsTracker(client)
      new FortniteCosmetics(client)
      new MissingCosmetics(client)

      // music = new Music(client);
      // new Teasers(client);


      // client.guilds.cache.get("570349873337991203").commands.set([])

      client.channels.fetch("725143134044160091").then(console.log).catch(console.log)

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
      // from TTS Bot
      if (message.channel.id === "578300191501844517") { // #polls👍👎
        message.react("👍");
        message.react("👎");
        message.react("1️⃣");
        message.react("2️⃣");
        message.react("3️⃣");
        message.react("4️⃣");
        message.react("5️⃣");
      }
      if (message.channel.id === "688387179709464696") { // #suggestions📬
        message.react("👍");
        message.react("👎");
      }
      if (message.channel.id === "672646334431494144" && message.author.id === "436212260587831316") { //#item-shop-feed🛒
        message.react("🔥");
        message.react("💩");
        message.react("🤷");
      }

      // #welcome👋 reactions
      if (message.author.id === "159985870458322944" && message.channel.id === "570352068829773824" && message.content.startsWith("GG")) {
        const member = message.mentions.members.first();
        const levelTest = message.content.split("level ")[1];
        const level = levelTest.toString().match(/\d+/)[0];

        const commonRole = message.guild.roles.cache.find((role) => role.name === "COMMON");
        const uncommonRole = message.guild.roles.cache.find((role) => role.name === "UNCOMMON");
        const rareRole = message.guild.roles.cache.find((role) => role.name === "RARE");
        const epicRole = message.guild.roles.cache.find((role) => role.name === "EPIC");
        const legendaryRole = message.guild.roles.cache.find((role) => role.name === "LEGENDARY");
        const mythicRole = message.guild.roles.cache.find((role) => role.name === "MYTHIC");
        const tomatoheadRole = message.guild.roles.cache.find((role) => role.name === "TOMATOHEAD");

        if (parseInt(level) >= 1 && parseInt(level) <= 5) {
          member.roles.add(commonRole);
          member.roles.remove(uncommonRole);
          member.roles.remove(rareRole);
          member.roles.remove(epicRole);
          member.roles.remove(legendaryRole);
          member.roles.remove(mythicRole);
          member.roles.remove(tomatoheadRole);
        }
        if (parseInt(level) >= 6 && parseInt(level) <= 10) {
          member.roles.remove(commonRole);
          member.roles.add(uncommonRole);
          member.roles.remove(rareRole);
          member.roles.remove(epicRole);
          member.roles.remove(legendaryRole);
          member.roles.remove(mythicRole);
          member.roles.remove(tomatoheadRole);
        }
        if (parseInt(level) >= 11 && parseInt(level) <= 15) {
          member.roles.remove(commonRole);
          member.roles.remove(uncommonRole);
          member.roles.add(rareRole);
          member.roles.remove(epicRole);
          member.roles.remove(legendaryRole);
          member.roles.remove(mythicRole);
          member.roles.remove(tomatoheadRole);
        }
        if (parseInt(level) >= 16 && parseInt(level) <= 20) {
          member.roles.remove(commonRole);
          member.roles.remove(uncommonRole);
          member.roles.remove(rareRole);
          member.roles.add(epicRole);
          member.roles.remove(legendaryRole);
          member.roles.remove(mythicRole);
          member.roles.remove(tomatoheadRole);
        }

        if (parseInt(level) >= 21 && parseInt(level) <= 25) {
          member.roles.remove(commonRole);
          member.roles.remove(uncommonRole);
          member.roles.remove(rareRole);
          member.roles.remove(epicRole);
          member.roles.add(legendaryRole);
          member.roles.remove(mythicRole);
          member.roles.remove(tomatoheadRole);
        }
        if (parseInt(level) >= 26 && parseInt(level) <= 99) {
          member.roles.remove(commonRole);
          member.roles.remove(uncommonRole);
          member.roles.remove(rareRole);
          member.roles.remove(epicRole);
          member.roles.remove(legendaryRole);
          member.roles.add(mythicRole);
          member.roles.remove(tomatoheadRole);
        }
        if (parseInt(level) >= 100) {
          member.roles.remove(commonRole);
          member.roles.remove(uncommonRole);
          member.roles.remove(rareRole);
          member.roles.remove(epicRole);
          member.roles.remove(legendaryRole);
          member.roles.remove(mythicRole);
          member.roles.add(tomatoheadRole);
        }
      }

      if (message.channel.id === "570352068829773824") {
        if (message.author.bot) {
          if (message.content.includes("advanced to level")) {
            const possibleReactions = [
              ["🇪", "🇵", "ℹ", "🇨"],
              ["🇵", "🇴", "🇬"],
              ["🇱", "🇮", "🇹"],
              ["🇸", "🇺", "🇵", "🇪", "🇷"],
              ["🇳", "🇮", "🇨", "🇪"],
            ];
            const randomIndex = Math.floor(Math.random() * possibleReactions.length);
            message.react("👍");
            possibleReactions[randomIndex].forEach((r) => message.react(r));
          }
        }
      }

      // from Corona Bot, pokemon bot catch reactions
      if (message.author.id === "716390085896962058" && message.embeds[0]?.fields[1] && message.embeds[0]?.fields[1]?.value.split("\n").find(v => v.includes("Total IV"))) {
        const ivString = message.embeds[0].fields[1].value.split("\n").find(v => v.includes("Total IV"));
        const iv = parseInt(ivString.split(" ")[2]);
        console.log(iv, ivString, ivString.split(" ")[2]);

        const pogEmoji = client.emojis.cache.get("756550303922389156");
        const tomatoHeadEmoji = client.emojis.cache.get("574702212618649631");

        if (iv === 69) {
          const possible = ["😉", "😜"];
          const selectedIndex = Math.floor(Math.random() * possible.length);
          return void message.react(possible[selectedIndex]);
        }

        if (iv >= 1 && iv <= 29) return void message.react("🤢");
        if (iv >= 30 && iv <= 49) return void message.react("💩");
        if (iv >= 50 && iv <= 69) return void message.react("🙂");
        if (iv >= 70 && iv <= 99) return void message.react(pogEmoji);
        if (iv === 100) {
          message.channel.send("POGGERS NO WAY DUDE!");
          message.react("👍");
          message.react(pogEmoji);
          message.react(tomatoHeadEmoji);
          message.react("😱");
        }
      }

      // pokemon bot level up reactions
      if (message.author.id === "612127667138854916") {
        const levelString = message.embeds && message.embeds[0].title;
        const level = parseInt(levelString.split(" ")[levelString.split(" ").length - 1]);

        const pogEmoji = client.emojis.cache.get("756550303922389156");
        const tomatoHeadEmoji = client.emojis.cache.get("574702212618649631");

        if (level && level === 100) {
          message.channel.send("Took you long enough! Now lets go destroy a Pidgey on route 1.");
          message.react("👍");
          message.react(pogEmoji);
          message.react(tomatoHeadEmoji);
          message.react("😱");
        }
      }

      // minebot rebirth reactions
      if (message.author.id === "518759221098053634" && message.content.toLowerCase().includes("you are now rebirth"))
        message.channel.send("Congrats on the rebirth.");

      // spam reactions
      if (message.content.toLowerCase().includes("!cap") || message.content.toLowerCase().includes("cap")) {
        if (message.author.bot || message.guild.id !== "570349873337991203") return
        const messageArray = message.channel.messages.cache.toJSON();
        let index = messageArray.length - 2
        const lastMessage = messageArray[index]
        if (message.content.toLowerCase().includes("cap"))
          index = messageArray.length - 1
        lastMessage.react("🧢");
        message.channel.send({ content: "🧢 CAP!!!!", tts: true });
        message.channel.send({ content: "🧢 CAP!!!!", tts: true });
        message.channel.send({ content: "🧢 CAP!!!!", tts: true });
        message.channel.send({ content: "🧢 CAP!!!!", tts: true });
      }

      if (message.content.toLowerCase().includes("!fax") ||
        message.content.toLowerCase().includes("didn't ask") ||
        message.content.toLowerCase().includes("didnt ask") ||
        message.content.toLowerCase().includes("fax")) {
        if (message.author.bot || message.guild.id !== "570349873337991203") return
        const messageArray = message.channel.messages.cache.toJSON();
        let index = messageArray.length - 2
        if (message.content.toLowerCase().includes("didn't ask") || message.content.toLowerCase().includes("fax"))
          index = messageArray.length - 1

        const lastMessage = messageArray[index]
        lastMessage.react("📠");
        message.channel.send({ content: "📠 YOO THATS FAX BRO", tts: true });
        message.channel.send({ content: "📠 YOO THATS FAX BRO", tts: true });
        message.channel.send({ content: "📠 YOO THATS FAX BRO", tts: true });
        message.channel.send({ content: "📠 YOO THATS FAX BRO", tts: true });
      }

      if (message.content.toLowerCase().includes("pog") ||
        message.content.toLowerCase().includes("lets go")) {
        if (message.author.bot || message.guild.id !== "570349873337991203") return
        const messageArray = message.channel.messages.cache.toJSON();
        let index = messageArray.length - 2
        if (message.content.toLowerCase().includes("pog") || message.content.toLowerCase().includes("pog"))
          index = messageArray.length - 2
        const emoji = client.emojis.cache.get("756550303922389156");
        message.react(emoji);
        message.channel.send({ content: `${emoji} POG CHAMP`, tts: true });
        message.channel.send({ content: `${emoji} POG CHAMP`, tts: true });
        message.channel.send({ content: `${emoji} POG CHAMP`, tts: true });
        message.channel.send({ content: `${emoji} POG CHAMP`, tts: true });
      }

      if (message.content.toLowerCase().includes("fish") || message.content.toLowerCase().includes("box") && !message.content.toLowerCase().includes("xbox")) {
        if (message.author.bot || message.guild.id !== "570349873337991203") return
        const messageArray = message.channel.messages.cache.toJSON();
        let index = messageArray.length - 2
        if (message.content.toLowerCase().includes("pog") || message.content.toLowerCase().includes("pog"))
          index = messageArray.length - 2
        const emoji = "📦";
        message.react(emoji);
        message.channel.send({ content: `${emoji} HE'S BOXED LIKE A FISH BRO 🎣`, tts: true });
        message.channel.send({ content: `${emoji} HE'S BOXED LIKE A FISH BRO 🎣`, tts: true });
        message.channel.send({ content: `${emoji} HE'S BOXED LIKE A FISH BRO 🎣`, tts: true });
        message.channel.send({ content: `${emoji} HE'S BOXED LIKE A FISH BRO 🎣`, tts: true });
      }

      if (message.content.toLowerCase().includes("30 damage")) {
        if (message.author.bot || message.guild.id !== "570349873337991203") return
        const messageArray = message.channel.messages.cache.toJSON();
        let index = messageArray.length - 2
        if (message.content.toLowerCase().includes("pog") || message.content.toLowerCase().includes("pog"))
          index = messageArray.length - 2
        const emoji = "🗑️";
        message.react(emoji);
        message.channel.send({ content: `${emoji} PUMP TRASH`, tts: true });
        message.channel.send({ content: `${emoji} PUMP TRASH`, tts: true });
        message.channel.send({ content: `${emoji} PUMP TRASH`, tts: true });
        message.channel.send({ content: `${emoji} PUMP TRASH`, tts: true });
      }



      if (message.content.toLowerCase() === "t!ping") {
        message.channel.send("Pinging...").then((m) => {
          const ping = m.createdTimestamp - message.createdTimestamp;
          const choices = ["Is this really my ping", "Is it okay? I cant look", "I hope it isnt bad", "He's lagging bro"];
          const response = choices[Math.floor(Math.random() * choices.length)];

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


      const args = message.content.substring(prefix.length).split(" ");


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
    console.log(err);

    // const c = (<TextChannel>client.channels.cache.get('1045086199053820004'));
    // for (const part of Util.splitMessage(`An error has occurred: ${err}`)) c?.send(part);
  }
})
