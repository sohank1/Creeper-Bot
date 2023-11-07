import { CacheType, Client, Collection, Message, MessageContextMenuInteraction, Snowflake, TextChannel, WebhookEditMessageOptions } from "discord.js";
import { replyFetcherCommand } from "./replyFetcherCommand";
import fs from "fs/promises";

interface MessageTree extends Message {
    replies?: MessageTree[]
}

export class ReplyFetcher {
    constructor(private client: Client) {
        this.client.on("interactionCreate", (i) => {
            if (!i.isMessageContextMenu() || i.commandName !== replyFetcherCommand.name) return;
            i.reply("Loading history...");
            return void this.fetchReplies(i);
        })

    }

    private async fetchReplies(i: MessageContextMenuInteraction<CacheType>): Promise<void> {
        const c = this.client.channels.cache.get(i.channel.id) as TextChannel;
        let messages = new Collection<Snowflake, Message>();
        let channelMessages = await c.messages.fetch({ limit: 100, after: i.targetMessage.id });

        channelMessages.forEach(m => console.log(m.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', })));

        while (channelMessages.size > 0) {
            messages = channelMessages.concat(messages);
            channelMessages = await c.messages.fetch({
                limit: 100,
                after: messages.first().id,
            });

            console.log("messages", messages.first()?.content || messages.first()?.id)
            console.log("channelMessages", channelMessages.first()?.content || channelMessages.first()?.id)
            // this.emit('fetch', channelMessages.size, channelMessages);
            console.log("message size/date", messages.size, messages.first().createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', }), messages.first().id)
            console.log("channel size/date", channelMessages.size, channelMessages.first()?.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', }) || channelMessages, channelMessages.first()?.id)


            console.log()
        }

        console.log("while loop done")


        console.log(messages.first().createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', }), messages.size, messages.first().content, messages.first().id)
        console.log(channelMessages.first()?.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', }) || channelMessages, channelMessages.size, channelMessages.first()?.content, channelMessages.first()?.id)

        channelMessages.forEach(m => console.log(m.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', })))
        messages.forEach(m => console.log(m.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', })))

        await fs.writeFile(`${__dirname}/test.json`, JSON.stringify(messages.map(m => m.toJSON()), null, 2))


        // const channel = this.client.channels.cache.get(i.channel.id) as TextChannel;
        // let messages = new Collection<Snowflake, Message>();

        // let channelMessages = await channel.messages.fetch({ limit: 100 });


        // */
        // while (channelMessages.size > 0) {
        //     console.log(channelMessages.last()?.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', }) || null, channelMessages.size, channelMessages.last().content || "there was no content", channelMessages.last().id)

        //     console.log(messages.size)
        //     messages = messages.concat(channelMessages);
        //     channelMessages = await channel.messages.fetch({
        //         limit: 100,
        //         before: channelMessages.last()!.id,
        //     });
        // }

        // console.log(messages.last().createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', }), messages.size, messages.last().content, messages.last().id)
        // console.log(channelMessages.last()?.createdAt.toLocaleString('en-US', { timeZone: 'America/New_York', }) || null, channelMessages.size, channelMessages.last().content, channelMessages.last().id)


        i.editReply(this.runAlgorithm(messages, i));
    }

    private runAlgorithm(messages: Collection<string, Message>, i: MessageContextMenuInteraction<CacheType>): WebhookEditMessageOptions {


        // first take the original message. we need to create a tree of replies to it
        // we can do this by taking the original message and finding all messages that reply to it
        // then we can take those messages and find all messages that reply to them
        // we can do this until we have no more messages to find

        const dataTree = [i.targetMessage as MessageTree];

        /* 
        {
            content: "Message 1",
            replies: [{
          {
                content: "Message 3",
                target: true,
                replies: [{
                    content: "Message 4",
                    replies: [{
                        content: "Message 5",
                        replies: []
                    }
                }]
        
            }
         }]
        }
    */


        const repliesToOriginalMessage = messages.filter(m => m.reference?.messageId === i.targetMessage.id);
        // loop through the repliesToOriginalMessage and find all messages that reply to them. we must keep looping until we have no more messages to find

        (function findRepliesToMessage(message: MessageTree, prevIndex): void {
            // const replies = messages.filter(m => m.reference?.messageId === message.id).toJSON() as MessageTree[];
            // console.log("replies to message", replies);
            // if (replies.length === 0) return replies;
            // console.log("reply length", replies.length)
            // replies.map(r => {
            //     r.replies = findRepliesToMessage(r)
            //     return r;
            // });
            // return replies;
            const replies = messages.filter(m => m.reference?.messageId === message.id);
            const index = dataTree.findIndex(m => m.id === message.id);
            console.log(index)
            dataTree[index].replies = replies.toJSON();
            if (replies.size !== 0) replies.forEach(r => findRepliesToMessage(r, index))

        })(i.targetMessage as MessageTree)

        // let test;
        // repliesToOriginalMessage.forEach(reply => {
        //     const repliesToReplies = findRepliesToMessage(reply);
        //     console.log(`found replies to ${reply.content} ${repliesToReplies.length} times`)
        //     test = repliesToReplies
        // })

        console.log(dataTree)


        const replies = messages.filter(m => m.reference?.messageId === i.targetMessage.id);
        let str = "";
        replies.forEach(r => {
            str += `(${r.member.displayName} - ${r.createdAt.toLocaleString("en-US", { timeZone: "America/New_York" })}) ${new Date(r.createdAt)} https://discord.com/channels/${i.guildId}/${i.channelId}/${r.id}\n`
        });

        return { content: `Found ${replies.size} replies to  https://discord.com/channels/${i.guildId}/${i.channelId}/${i.targetMessage.id}\n${str}` }

    }
}