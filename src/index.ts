import "dotenv/config";
import './database';
import axios from "axios";
import { Client, Intents, MessageEmbed, TextChannel } from "discord.js";
import Teasers from "./teasers";
// import { Music } from "./music/Music";
import { News } from "./news/news";
import { DonaldTracker } from "./DonaldTracker/DonaldTracker";
import { Counting, countingCommand } from "./Counting/Counting";
const client = new Client({ restTimeOffset: 30, intents: new Intents(32767) });
client.login(process.env.BOT_TOKEN);
const prefix = "c!";

// let music: Music;




client.on("ready", () => {

  // Register Slash Commands
  // client.application.commands.create(countingCommand)

  // client.application.commands.create({
  //   options: [{}]
  //  })


  const instance = process.env.NODE_ENV === 'production' ? process.env.NODE_ENV : 'development'
  console.log(client.guilds.cache);
  (<TextChannel>client.channels.cache.get('767763290004652037')).send(`${client.user.tag} has logged in at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}. Instance is on **${instance}**.`);
  console.log(`${client.user.tag} has logged in at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })}. Instance is on **${instance}**.`);
  client.user.setActivity("c!creeper-bot-help");
  new Counting(client);
  new News(client);
  new DonaldTracker(client);
  // music = new Music(client);
  new Teasers(client);


  const oldObj = [
    {
      id: 'The Fortnite Crew Announcement',
      title: 'The Fortnite Crew',
      tabTitle: 'New Subscription',
      body: 'Coming in Season 5, join the Fortnite Crew to unlock the Battle Pass for the full Season, get a monthly exclusive Crew Pack and 1,000 V-bucks every month! Learn more at fn.gg/FortniteCrew',
      image: 'https://cdn2.unrealengine.com/en-14br-social-subscriptions-motd-1920x1080-1920x1080-617263273.jpg',
      tileImage: 'https://cdn2.unrealengine.com/en-14br-social-subscriptions-motd-1024x512-1024x512-617263267.jpg',
      sortingPriority: 50,
      hidden: false
    },
    {
      id: 'Devourer of Worlds - Battle Bus Render Image',
      title: 'The Devourer of Worlds',
      tabTitle: 'Galactus Approaches',
      body: 'You do know how to drive the Battle Bus... right? Galactus arrives Tuesday, December 1 at 4 PM ET. Learn more at fn.gg/DevourerOfWorlds',
      image: 'https://cdn2.unrealengine.com/14br-battlebus-render-motd-1920x1080-lasersgopewpew-1920x1080-658872810.jpg',
      tileImage: 'https://cdn2.unrealengine.com/14br-battlebus-render-motd-1024x512-lasersgopewpew-1024x512-658872797.jpg',
      sortingPriority: 40,
      hidden: false
    }
  ]

  const newObj = [
    {
      id: 'The Fortnite Crew Announcement',
      title: 'The Fortnite Crew',
      tabTitle: 'New Subscription',
      body: 'Coming in Season 5, join the Fortnite Crew to unlock the Battle Pass for the full Season, get a monthly exclusive Crew Pack and 1,000 V-bucks every month! Learn more at fn.gg/FortniteCrew',
      image: 'https://cdn2.unrealengine.com/en-14br-social-subscriptions-motd-1920x1080-1920x1080-617263273.jpg',
      tileImage: 'https://cdn2.unrealengine.com/en-14br-social-subscriptions-motd-1024x512-1024x512-617263267.jpg',
      sortingPriority: 50,
      hidden: false
    },
    {
      id: 'Devourer of Worlds - Battle Bus Render Image',
      title: 'The Devourer of Worlds',
      tabTitle: 'Galactus Approaches',
      body: 'You do know how to drive the Battle Bus... right? Galactus arrives Tuesday, December 1 at 4 PM ET. Learn more at fn.gg/DevourerOfWorlds',
      image: 'https://cdn2.unrealengine.com/14br-battlebus-render-motd-1920x1080-lasersgopewpew-1920x1080-658872810.jpg',
      tileImage: 'https://cdn2.unrealengine.com/14br-battlebus-render-motd-1024x512-lasersgopewpew-1024x512-658872797.jpg',
      sortingPriority: 40,
      hidden: false
    }
  ]
  // const oldObj = [
  //     { name: "bob" },
  //     { name: "joe" }
  // ];

  // const newObj = [
  //     { name: "sam" },
  //     { name: "bob" }
  // ];
  // const diff = [];
  // for (const newItem of newObj) {
  //     for (const oldItem of oldObj) {
  //         if (!oldObj.includes(newItem)) diff.push(newItem);
  //     }
  // }
  // console.log(diff)

});

client.on("messageCreate", async (message) => {
  if (message.content.toLowerCase().startsWith("c!fn")) {
    const username = message.content.split("c!fn ")[1];
    console.log(username, message.content.split("c!fn "))
    try {
      const r = await axios.get(`https://fortnite-api.com/v1/stats/br/v2?image=all&name=${username}`);
      // message.channel.send(`${username} is level ${r.data.data.battlePass.level}.${r.data.data.battlePass.progress}. Wins: ${r.data.data.stats.all.overall.wins} KD: ${r.data.data.stats.all.overall.kd} Kills: ${r.data.data.stats.all.overall.kills} Matches: ${r.data.data.stats.all.overall.matches} Stats as of: ${new Date(r.data.data.stats.all.overall.lastModified).toLocaleString("en-US", { timeZone: "America/New_York" })}`);
      const e = new MessageEmbed()
        .setTitle(`Fortnite Stats for ${r.data.data.account.name}`)
        .addField("Battle Pass Level", `${r.data.data.battlePass.level}.${r.data.data.battlePass.progress}` || "No data")
        .addField("Wins", r.data.data.stats.all.overall.wins || "No data")
        .addField("Solo Wins", r.data.data.stats.all?.solo?.wins || "No data")
        .addField("Duo Wins", r.data.data.stats.all?.duo?.wins || "No data")
        .addField("Trio Wins", r.data.data.stats.all?.trio?.wins || "No data")
        .addField("Squad Wins", r.data.data.stats.all?.squad?.wins || "No data")
        .addField("LTM Wins", r.data.data.stats.all?.ltm?.wins || "No data")
        .addField("KD", r.data.data.stats.all.overall.kd || "No data")
        .addField("Win Rate", r.data.data.stats.all.overall.winRate + "%" || "No data")
        .addField("Kills", r.data.data.stats.all.overall.kills || "No data")
        .addField("Matches", r.data.data.stats.all.overall.matches || "No data")
        .addField("Days Played", (r.data.data.stats.all.overall.minutesPlayed / 60 / 24).toString() || "No data")
        .addField("Last Update", new Date(r.data.data.stats.all.overall.lastModified).toLocaleString("en-US", { timeZone: "America/New_York" }) || "No data")
        .setColor("#2186DB")
        .setTimestamp();

      // message.channel.send(e); 
    } catch {
      return void message.channel.send("Dumbahh, profile doesn't exist or it's private.")
    }
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
      process.exit(1);
    }
    else message.channel.send('Instance is on **development**. Did not shut down.');
  }
});


client.on("ready", () => console.log(`${client.user.tag} has logged in.`));


