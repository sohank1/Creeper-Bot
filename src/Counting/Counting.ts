import { SlashCommandBuilder } from "@discordjs/builders";
import { ApplicationCommandDataResolvable, BaseCommandInteraction, CacheType, Client, Message, MessageEmbed, TextChannel } from "discord.js";
import CountingModel from "./Counting.model";
import { CountingService } from "./CountingService";


export const countingCommand = new SlashCommandBuilder()
    .setName('counting')
    .setDescription('Get info about a user or a server!')

    .addSubcommand(subcommand =>
        subcommand.setName('stats')
            .setDescription('Get the counting stats for this server')).toJSON();

// .addSubcommand(subcommand =>
//     subcommand
//         .setName('set')
//         .addChannelOption(o => o.setName('channel').setDescription('The channel to setup counting for')
//             // .setRequired(false)
//         )
//         .setDescription('Set the counting channel'))



export class Counting {
    private message: Message;
    private interaction: BaseCommandInteraction<CacheType>;
    private _service = new CountingService();

    constructor(private client: Client) {
        client.on('messageCreate', (message) => {
            if (message.author.bot) return;
            this.message = message;
            if (message.content.startsWith('c!set-counting')) return void this.setChannel();
            if (message.content.startsWith('c!stats')) return void this.getStats();
            if (message.content.startsWith('c!info')) return void this.getStats();
            if (message.content.startsWith('c!claim')) return void this.claimSaves();
            this.check();
        });

        client.on("interactionCreate", (i) => {
            if (!i.isApplicationCommand()) return

            if (i.commandName !== "counting") return
            if (!i.options.data.find(e => e.name === "stats")) return

            this.interaction = i;
            return void this.getStatsByInteraction();

        })
    }

    private async claimSaves(): Promise<Message> {
        const doc = await this._service.findOneByGuild(this.message.guild.id);

        // const doc = await CountingModel.findOne({ guildId: this.message.guild.id });
        if (!doc) return this.message.channel.send("You don't have a counting channel!. Use `c!set-counting #channel` or `c!set-counting` in the channel to activate the counting feature.");

        let isNewUser = false;
        let user = doc.users.find(u => u.id === this.message.author.id);
        if (!user) {
            user = { id: this.message.author.id, saves: 0, lastVotedAt: new Date() }
            doc.users.push(user);
            isNewUser = true;
        }

        if (Date.now() - user.lastVotedAt.getTime() >= 8.64e+7 || isNewUser) {
            const lootPool = [1, 2, 3, 3, 3,];

            user.saves += lootPool[Math.floor(Math.random() * lootPool.length)];
            user.lastVotedAt = new Date();
            this.message.channel.send(`You now have **${user.saves}** saves!`);
        }
        else {
            const h = Math.floor((user.lastVotedAt.getTime() % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((user.lastVotedAt.getTime() % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((user.lastVotedAt.getTime() % (1000 * 60)) / 1000);
            this.message.channel.send(`Please use this command again in **${h}h ${m}m ${s}s** to claim saves.`);
        }

        await this._service.saveDoc(doc)

    }

    private async getStats(): Promise<Message> {
        // const doc = await CountingModel.findOne({ guildId: this.message.guild.id });
        const doc = await this._service.findOneByGuild(this.message.guild.id);
        if (!doc) return this.message.channel.send("You don't have any stats. Use `c!set-counting #channel` or `c!set-counting` in the channel to activate the counting feature.");

        const e = new MessageEmbed()
            .setTitle(`${this.message.guild.name}'s stats for Creeper Counting`)
            .setThumbnail(this.message.guild.iconURL())
            .addField('Next Number', (doc.current.numberNow + 1).toString(), true)
            .addField('Current Number', `${doc.current.numberNow} (Sent by ${this.client.users.cache.get(doc.current.userId)?.username})`, true)
            .setColor('#2186DB')
            .setTimestamp()
        this.message.channel.send({ embeds: [e] });
    }

    private async getStatsByInteraction(): Promise<void> {
        // const doc = await CountingModel.findOne({ guildId: this.message.guild.id });
        const doc = await this._service.findOneByGuild(this.interaction.guild.id);
        if (!doc) return this.interaction.reply("You don't have any stats. Use `c!set-counting #channel` or `c!set-counting` in the channel to activate the counting feature.");

        const e = new MessageEmbed()
            .setTitle(`${this.interaction.guild.name}'s stats for Creeper Counting`)
            .setThumbnail(this.interaction.guild.iconURL())
            .addField('Next Number', (doc.current.numberNow + 1).toString(), true)
            .addField('Current Number', `${doc.current.numberNow} (Sent by ${this.client.users.cache.get(doc.current.userId)?.username})`, true)
            .setColor('#2186DB')
            .setTimestamp()
        this.interaction.reply({ embeds: [e] });
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
                await this._service.saveDoc(doc)
            }
        }

        catch (err) {
            this.message.channel.send(`An error occurred while setting the counting channel: ${err} `);
        }

        this.message.channel.send(`Successfully set the counting channel to ${channel}`)
    }

    private async check(): Promise<void> {
        console.time(this.message.id)
        // const doc = await CountingModel.findOne({ guildId: this.message.guild.id });
        const doc = await this._service.findOneByGuild(this.message.guild.id)
        if (!doc) return;
        console.timeEnd(this.message.id)
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
                if (Number((this.message.content)).toString().includes('69')) ['😜', '🐠', this.client.emojis.cache.get('781787884906348584')].forEach(e => this.message.react(e));
                if (Number((this.message.content)) === 100) this.message.react('💯');
                if (Number((this.message.content)) === 123 || Number((this.message.content)) === 1234) this.message.react('🔢');
                if (Number((this.message.content)) === 151) this.message.react('🐭');
                if (Number((this.message.content)) === 360) ['🚫', '👀', '🔫'].forEach(this.message.react);
                if (Number((this.message.content)) === 404) ['🚫', '🇳', '🇴', '🇹', '⬛', '🇫', '🅾️', '🇺', '🆖', '🇩'].forEach(this.message.react);
                if (Number((this.message.content)) === 420) this.message.react('🍀');
                if (Number((this.message.content)) === 115) this.message.react('🧟');
            }

            else {
                // const user = doc.users.find(u => u.id === this.message.author.id);
                // console.log("F", user, user.saves > 0)
                // if (user?.saves > 0) {
                //     doc.users.find(u => u.id === this.message.author.id).saves--;
                //     this.message.react('🥅');
                //     this.message.channel.send(`Saved by the keeper! ${this.message.author} you now have **${user.saves}** saves. The next number is ${doc.current.numberNow}.`);

                //     await doc.updateOne(doc);
                // }
                // else {
                const badPool = ['What a idiot!', 'What an aerial!', "I guess we can confirm now, math isn't your strong suite.", `${this.message.author.username} missed an open net!`, `${this.message.author.username} whiffed!`, `${this.message.author.username} sold the game!`, `${this.message.author.username} threw the game!`];
                doc.current.numberNow = 0;
                doc.current.userId = '';
                this.message.react('❌');
                this.message.channel.send(`**${this.message.author.username}** ruined it! ${badPool[Math.floor(badPool.length * Math.random())]} The next number is 1.`);
                // }
            }

            console.time("save")
            await this._service.saveDoc(doc);
            // await doc.save();
            console.timeEnd("save")
        }
    }
}
