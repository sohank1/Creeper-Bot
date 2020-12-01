import "dotenv/config";
import './database';

import { Client, MessageEmbed } from "discord.js";
import Teasers from "./teasers";
import { Music } from "./music/Music";
import { News } from "./news/news";
import { DonaldTracker } from "./DonaldTracker/DonaldTracker";
const client = new Client();
client.login(process.env.BOT_TOKEN);
const prefix = "c!";

let music: Music;

client.on("ready", () => {
    console.log(`${client.user.tag} has logged in.`);
    client.user.setActivity("c!creeper-bot-help");
    new News(client);
    new DonaldTracker(client);
    // music = new Music(client);
    // new Teasers(client);


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
