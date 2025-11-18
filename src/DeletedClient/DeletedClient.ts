import { Client, Message, MessageEmbed, TextChannel } from "discord.js";
import { version } from "../"

export class DeletedClient {
    constructor(private client: Client) {
        this.handle();
    }

    private handle() {
        this.client.on("messageDelete", async (message: Message) => {
            try {
                if (!message) return;
                if (message.partial) {
                    try { await message.fetch(); } catch { /* ignore */ }
                }
                if (!message.guild) return;

                const logs = await message.guild.fetchAuditLogs({ type: 72 }).catch(() => null);
                const entry = logs?.entries?.first();
                const channel = this.client.channels.cache.get("695646963235946549") as TextChannel;
                if (!channel) return;

                const content = (message.content || "None").toString() || "None";
                const authorTag = message.author?.tag ?? "Unknown";
                const authorId = message.author?.id ?? "Unknown";
                const deleter = (entry?.executor && (entry.executor as any).tag) ? (entry.executor as any).tag : (entry?.executor ? String(entry.executor) : "Unknown");
                const serverName = message.guild?.name ?? "Unknown";
                const serverId = message.guild?.id ?? "Unknown";
                const chanName = (message.channel as TextChannel)?.name ?? "Unknown";
                const chanId = message.channel?.id ?? "Unknown";

                const deletedMessageEmbed = new MessageEmbed()
                    .setTitle("Deleted Message")
                    .addField("Message", content)
                    .addField("Author", `${authorTag} (${authorId})`)
                    .addField("Deleter (may be wrong)", deleter)
                    .addField("Server", `${serverName} (${serverId})`)
                    .addField("Channel", `${chanName} (${chanId})`)
                    .setThumbnail("https://media.graytvinc.com/images/810*455/Coronavirus52.jpg")
                    .setColor("#FFC433")
                    .setTimestamp()
                    .setFooter("Creeper Bot" + version);

                await channel.send({ embeds: [deletedMessageEmbed] }).catch(console.error);
            } catch (err) {
                console.error("DeletedClient messageDelete error:", err);
            }
        });

        this.client.on("messageUpdate", async (oldMessage: Message, newMessage: Message) => {
            try {
                if (!oldMessage || !newMessage) return;
                if (oldMessage.partial) {
                    try { await oldMessage.fetch(); } catch { /* ignore */ }
                }
                if (newMessage.partial) {
                    try { await newMessage.fetch(); } catch { /* ignore */ }
                }
                if (oldMessage.content === newMessage.content) return;
                if (!oldMessage.guild) return;

                const editlogschannel = this.client.channels.cache.get("698712954362658857") as TextChannel;
                if (!editlogschannel) return;

                const oldContent = (oldMessage.content || "None").toString();
                const newContent = (newMessage.content || "None").toString();
                const editedAt = newMessage.editedAt ? newMessage.editedAt.toLocaleString('en-US', { timeZone: 'America/New_York' }) : "Unknown";
                const editedTimestamp = newMessage.editedTimestamp ? String(newMessage.editedTimestamp) : "Unknown";
                const authorTag = oldMessage.author?.tag ?? "Unknown";
                const authorId = oldMessage.author?.id ?? "Unknown";
                const serverName = oldMessage.guild?.name ?? "Unknown";
                const serverId = oldMessage.guild?.id ?? "Unknown";
                const chanName = (oldMessage.channel as TextChannel)?.name ?? "Unknown";
                const chanId = oldMessage.channel?.id ?? "Unknown";

                const editEmbed = new MessageEmbed()
                    .setTitle("Message Edit")
                    .addField("Old Message", oldContent)
                    .addField("New Message", newContent)
                    .addField("Message Edits At", editedAt)
                    .addField("Message Edited Timestamp", editedTimestamp)
                    .addField("Author", `${authorTag} (${authorId})`)
                    .addField("Server", `${serverName} (${serverId})`)
                    .addField("Channel", `${chanName} (${chanId})`)
                    .setThumbnail("https://media.graytvinc.com/images/810*455/Coronavirus52.jpg")
                    .setColor("#FFC433")
                    .setTimestamp();

                await editlogschannel.send({ embeds: [editEmbed] }).catch(console.error);
            } catch (err) {
                console.error("DeletedClient messageUpdate error:", err);
            }
        });

        this.client.on("messageDeleteBulk", (messages) => {
            try {
                if (!messages) return;
                const purgedChannel = this.client.channels.cache.get("720667264738787340") as TextChannel;
                if (!purgedChannel) return;
                const deletedArray = messages.toJSON().reverse();

                (async () => {
                    for (const message of deletedArray) {
                        try {
                            if (message.partial) {
                                try { await message.fetch(); } catch { /* ignore */ }
                            }
                            const content = (message.content || "None").toString();
                            const authorTag = message.author?.tag ?? "Unknown";
                            const authorId = message.author?.id ?? "Unknown";
                            const serverName = message.guild?.name ?? "Unknown";
                            const serverId = message.guild?.id ?? "Unknown";
                            const chanName = (message.channel as TextChannel)?.name ?? "Unknown";
                            const chanId = message.channel?.id ?? "Unknown";
                            const createdAt = message.createdAt ? message.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York' }) : "Unknown";
                            const editedAt = message.editedAt ? message.editedAt.toString() : "None";

                            const purgedMessageEmbed = new MessageEmbed()
                                .setTitle(`${deletedArray.length} Purged Messages`)
                                .addField("Message", content)
                                .addField("Author", `${authorTag} (${authorId})`)
                                .addField("Server", `${serverName} (${serverId})`)
                                .addField("Channel", `${chanName} (${chanId})`)
                                .addField("Time Message Was Created", createdAt)
                                .addField("Message Edits", content)
                                .addField("Message Edits Time", editedAt)
                                .setThumbnail("https://media.graytvinc.com/images/1920*1080/Coronavirus52.jpg")
                                .setColor("#FFC433")
                                .setTimestamp();

                            await purgedChannel.send({ embeds: [purgedMessageEmbed] }).catch(console.error);
                        } catch (innerErr) {
                            console.error("Error sending purged message embed:", innerErr);
                        }
                    }
                })();
            } catch (err) {
                console.error("DeletedClient messageDeleteBulk error:", err);
            }
        });
    }
}