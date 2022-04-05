import { Client, Message, MessageEmbed, TextChannel } from "discord.js";
import { version } from "../"

export class DeletedClient {
    constructor(private client: Client) {
        this.handle();
    }

    private handle() {
        this.client.on("messageDelete", async (message: Message) => {
            console.log(message.content)
            let logs = await message.guild.fetchAuditLogs({ type: 72 });
            let entry = logs.entries.first();
            // if (message.deleted) {
            const channel = <TextChannel>this.client.channels.cache.get("695646963235946549");
            console.log(channel)
            if (channel) {
                const deletedMessageEmbed = new MessageEmbed()
                    .setTitle("Deleted Message")
                    .addField("Message", message.content)
                    .addField("Author", `${message.author.tag} (${message.author.id})`)
                    .addField("Deleter (Can be wrong if message deleted by bot.", `${entry.executor}`)
                    .addField("Server", `${message.guild.name} (${message.guild.id})`)
                    .addField("Channel", `${(<TextChannel>message.channel).name} (${message.channel.id})`)
                    .setThumbnail("https://media.graytvinc.com/images/810*455/Coronavirus52.jpg")
                    .setColor("#FFC433")
                    .setTimestamp()
                    .setFooter("Creeper Bot" + version);
                channel.send({ embeds: [deletedMessageEmbed] });
                //   }
            }
        });
        this.client.on("messageUpdate", (oldMessage: Message, newMessage: Message) => {
            const editlogschannel = <TextChannel>this.client.channels.cache.get("698712954362658857");
            if (oldMessage.content === newMessage.content) {
                return;
            }
            if (editlogschannel) {
                const editEmbed = new MessageEmbed()
                    .setTitle("Message Edit")
                    .addField("Old Message", oldMessage.content)
                    .addField("New Message", newMessage.content)
                    // .addField("Message Edits (Newest to Oldest)", oldMessage.edits)
                    .addField("Message Edits At", oldMessage.editedAt.toString())
                    .addField("Message Edited Timestamp", oldMessage.editedTimestamp.toString())
                    .addField("Author", `${oldMessage.author.tag} (${oldMessage.author.id})`)
                    .addField("Server", `${oldMessage.guild.name} (${oldMessage.guild.id})`)
                    .addField("Channel", `${(<TextChannel>oldMessage.channel).name} (${oldMessage.channel.id})`)
                    .setThumbnail("https://media.graytvinc.com/images/810*455/Coronavirus52.jpg")
                    .setColor("#FFC433")
                    .setTimestamp()
                    .setFooter("Creeper Bot" + version);

                editlogschannel.send({ embeds: [editEmbed] });
            }
        });

        this.client.on("messageDeleteBulk", (messages) => {
            const purgedChannel = <TextChannel>this.client.channels.cache.get("720667264738787340");
            let deletedArray = messages.toJSON();
            deletedArray.reverse();
            deletedArray.forEach(async (message) => {
                if (purgedChannel) {
                    const purgedMessageEmbed = new MessageEmbed()
                        .setTitle(`${deletedArray.length} Purged Messages`)
                        .addField("Message", message.content)
                        .addField("Author", `${message.author.tag} (${message.author.id})`)
                        .addField("Server", `${message.guild.name} (${message.guild.id})`)
                        .addField("Channel", `${(<TextChannel>message.channel).name} (${message.channel.id})`)
                        .addField("Time Message Was Created", `${message.createdAt.toLocaleString()}`)
                        .addField("Message Edits", `${message.content}`)
                        .addField("Message Edits Time", `${message.editedAt}`)
                        .setThumbnail("https://media.graytvinc.com/images/1920*1080/Coronavirus52.jpg")
                        .setColor("#FFC433")
                        .setTimestamp()
                        .setFooter("Creeper Bot" + version);
                    await purgedChannel.send({ embeds: [purgedMessageEmbed] });
                }
            });
        });
    }
}