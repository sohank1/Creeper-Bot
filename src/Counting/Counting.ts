import { Client, Message, MessageEmbed, TextChannel } from "discord.js";
import CountingModel from "./Counting.model";

export class Counting {
    private message: Message;

    constructor(private client: Client) {
        client.on('message', (message) => {
            if (message.author.bot) return;
            this.message = message;
            if (message.content.startsWith('c!set-counting')) return this.setChannel();
            if (message.content.startsWith('c!stats')) return this.getStats();
            if (message.content.startsWith('c!info')) return this.getStats();
            this.check();
        });
    }

    // private async claimSave(): Promise<void> {

    // }

    private async getStats(): Promise<Message> {
        const doc = await CountingModel.findOne({ guildId: this.message.guild.id });
        if (!doc) return this.message.channel.send("You don't have any stats. Use `c!set-counting #channel` or `c!set-counting` in the channel to activate the counting feature.");

        const e = new MessageEmbed()
            .setTitle(`${this.message.guild.name}'s stats for Creeper Counting`)
            .setThumbnail(this.message.guild.iconURL())
            .addField('Next Number', doc.current.numberNow + 1, true)
            .addField('Current Number', `${doc.current.numberNow} (Sent by ${this.client.users.cache.get(doc.current.userId)?.username})`, true)
            .setColor('2186DB')
            .setTimestamp()
        this.message.channel.send(e);
    }

    private async setChannel(): Promise<Message> {
        if (!this.message.member.permissions.has('ADMINISTRATOR'))
            return this.message.channel.send("You don't have permission to do this. You require the **Administrator** permission");

        const args = this.message.content.split('c!set-counting ');
        //@ts-ignore
        const channel: TextChannel = this.client.channels.cache.find((c: TextChannel) => c.toString() === args[1]) || this.client.channels.cache.get(args[1]) || this.message.channel;

        try {
            const doc = await CountingModel.findOne({ guildId: this.message.guild.id });
            if (!doc) await CountingModel.create({
                guildId: this.message.guild.id,
                channelId: channel.id,
            });
            else {
                doc.channelId = channel.id;
                await doc.save();
            }
        }

        catch (err) {
            this.message.channel.send(`An error occurred while setting the counting channel: ${err} `);
        }

        this.message.channel.send(`Successfully set the counting channel to ${channel}`)
    }

    private async check(): Promise<void> {
        const doc = await CountingModel.findOne({ guildId: this.message.guild.id });
        if (!doc) return;

        if (this.message.channel.id === doc.channelId && Number((this.message.content))) {
            if (Number((this.message.content)) && Number((this.message.content)) === doc.current.numberNow + 1 && this.message.author.id !== doc.current.userId) {
                doc.current.numberNow = doc.current.numberNow + 1;
                doc.current.userId = this.message.author.id;
                this.message.react('☑️');

                if (Number((this.message.content)) === 42) this.message.react('🌐');
                if (Number((this.message.content)) === 64) this.message.react('🟫');
                if (Number((this.message.content)) === 164) ['1️⃣', '🟫',].forEach(e => this.message.react(e));
                if (Number((this.message.content)) === 264) ['2️⃣', '🟫',].forEach(e => this.message.react(e));
                if (Number((this.message.content)) === 364) ['3️⃣', '🟫',].forEach(e => this.message.react(e));
                if (Number((this.message.content)) === 464) ['4️⃣', '🟫',].forEach(e => this.message.react(e));
                if (Number((this.message.content)).toString().includes('69')) ['😉', '🐠', this.client.emojis.cache.get('781787884906348584'), '😜'].forEach(e => this.message.react(e));
                if (Number((this.message.content)) === 100) this.message.react('💯');
                if (Number((this.message.content)) === 123 || Number((this.message.content)) === 1234) this.message.react('🔢');
                if (Number((this.message.content)) === 151) this.message.react('🐭');
            }

            else {
                const badPool = [];
                doc.current.numberNow = 0;
                doc.current.userId = '';
                this.message.react('❌');
                this.message.channel.send(`**${this.message.author.username}** ruined it! The next number is 1.`);
            }

            await doc.save();
        }
    }
}