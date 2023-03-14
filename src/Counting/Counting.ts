import { ApplicationCommandOptionChoice, AutocompleteInteraction, BaseCommandInteraction, ButtonInteraction, CacheType, Client, Message, MessageActionRow, MessageButton, MessageEmbed, TextChannel, User } from "discord.js";
import CountingModel from "./Counting.model";
import { CountingService } from "./CountingService";

// export const savesLootPool = [1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3];
export const savesLootPool = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 1]

export class Counting {
    private message: Message;
    private interaction: BaseCommandInteraction<CacheType>;
    private saveTimeout = new Map<string, NodeJS.Timeout>();
    /**
     * guildId, Message
     */
    private warnings = new Map<string, Message>()
    private _service = new CountingService();

    constructor(private client: Client) {
        // reset all waiting decisions for servers
        CountingModel.find().then((docs) => {
            for (const d of docs) {
                d.current.waitingOnId = "";
                this._service.saveDoc(d)
            }
        })

        client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            this.message = message;
            if (message.content.startsWith('c!set-counting')) return void this.setChannel();
            // if (message.content.startsWith('c!stats')) return void this.getStats();
            // if (message.content.startsWith('c!info')) return void this.getStats();
            // if (message.content.startsWith('c!claim')) return void this.claimSaves();
            this.check(message);

        });

        client.on("interactionCreate", (i) => {
            if (i.isButton() && i.customId.startsWith("counting-use-save")) return void this.handleSaveButton(i)
            // if (i.isAutocomplete() && i.options.getSubcommand() === "hack") return void this.handleHackSaveUserAutoComplete(i)
            if (!i.isCommand()) return
            this.interaction = i;

            if (i.commandName === "counting" && i.options.getSubcommand() === "stats") return void this.getStatsByInteraction();
            if (i.commandName === "counting" && i.options.getSubcommand() === "hack") return void this.hack(i);
            if (i.commandName === "counting" && i.options.getSubcommand() === "claim") return void this.claimSaves(i);

        })
    }

    private async claimSaves(i: BaseCommandInteraction<CacheType>): Promise<Message> {

        const doc = await this._service.findOneByGuild(this.interaction.guild.id);

        // const doc = await CountingModel.findOne({ guildId: this.interaction.guild.id });
        if (!doc) return this.interaction.channel.send("You don't have a counting channel!. Use `c!set-counting #channel` or `c!set-counting` in the channel to activate the counting feature.");

        let isNewUser = false;
        let user = doc.users.find(u => u.id === this.interaction.user.id);

        // user.lastVotedAt = new Date("2022-02-21T15:33:18.439Z")
        // console.log('doc before change', doc)
        // doc.users[doc.users.findIndex(u => u.id === this.interaction.user.id)] = user
        // console.log("doc after change", doc)
        // await this._service.saveDoc(doc)
        // doc.users[0].saves = 200
        // doc.users[0].lastVotedAt = new Date("2022-02-21T15:33:18.439Z")
        // await doc.overwrite(doc);


        // doc.users[0].saves = 200
        // doc.users[0].lastVotedAt = new Date("2022-02-21T15:33:18.439Z")
        // doc.markModified("users")
        // await doc.save();



        if (!user) {
            console.log("a user was not found")
            user = { id: i.user.id, saves: 0, lastVotedAt: new Date() }
            doc.users.push(user);
            isNewUser = true;
        }

        console.log("last voted", user.lastVotedAt.toLocaleString())
        console.log("last voted day", user.lastVotedAt.getDate())

        const canVoteAgainAt = new Date(user.lastVotedAt.getTime()).setDate(user.lastVotedAt.getDate() + 7)
        console.log("canvoteagain", new Date(canVoteAgainAt).toLocaleString())
        console.log("canvoteagain day", new Date(canVoteAgainAt).getDate())

        if (Date.now() >= canVoteAgainAt || isNewUser) {
            console.log("isNewUser=", isNewUser)
            console.log("is now more than the voted time", Date.now() >= canVoteAgainAt)
            const savesChosen = savesLootPool[Math.floor(Math.random() * savesLootPool.length)];

            // const guildSaves = (await this._service.findOneByGuild(this.interaction.guildId)).users.map(u => u.saves)
            // const netSaves =  guildSaves.reduce((prev, cur) => prev + cur) + savesChosen
            // if (netSaves > 3) return void this.interaction.reply("This server has reached the cap of 3 saves. Use this command once your server has less than 3 saves.")

            user.saves += savesChosen
            user.lastVotedAt = new Date();

            doc.users[doc.users.findIndex(u => u.id === this.interaction.user.id)] = user
            await this._service.saveDoc(doc)


            let str = `You have claimed your weekly save^. You now have **${user.saves.toFixed(1)}** save%! (+${savesChosen} save^!)`
            if (savesChosen > 0) str = str.replaceAll("^", "s")
            else str = str.replaceAll("^", "")
            if (user.saves > 0) str = str.replaceAll("%", "s")
            else str = str.replaceAll("%", "")
            return void this.interaction.reply(str);
        }



        let delta = Math.abs(canVoteAgainAt - Date.now()) / 1000;

        const days = Math.floor(delta / 86400);
        delta -= days * 86400;

        const hours = Math.floor(delta / 3600) % 24;
        delta -= hours * 3600;

        const minutes = Math.floor(delta / 60) % 60;

        delta -= minutes * 60;
        const seconds = Math.floor(delta % 60)  // i

        doc.users[doc.users.findIndex(u => u.id === this.interaction.user.id)] = user
        await this._service.saveDoc(doc)

        return void this.interaction.reply(`Please use this command again in **${days}d ${hours}h ${minutes}m ${seconds}s** to claim more saves.`);


    }

    // private async getStats(): Promise<Message> {
    //     // const doc = await CountingModel.findOne({ guildId: this.message.guild.id });
    //     const doc = await this._service.findOneByGuild(this.message.guild.id);
    //     if (!doc) return this.message.channel.send("You don't have any stats. Use `c!set-counting #channel` or `c!set-counting` in the channel to activate the counting feature.");

    //     const e = new MessageEmbed()
    //         .setTitle(`${this.message.guild.name}'s stats for Creeper Counting`)
    //         .setThumbnail(this.message.guild.iconURL())
    //         .addField('Next Number', (doc.current.numberNow + 1).toString(), true)
    //         .addField('Current Number', `${doc.current.numberNow} (Sent by ${this.client.users.cache.get(doc.current.userId)?.username})`, true)
    //         .setColor('#2186DB')
    //         .setTimestamp()
    //     this.message.channel.send({ embeds: [e] });
    // }

    private async getStatsByInteraction(): Promise<void> {
        // const doc = await CountingModel.findOne({ guildId: this.message.guild.id });
        const doc = await this._service.findOneByGuild(this.interaction.guild.id);
        if (!doc) return this.interaction.reply("You don't have any stats. Use `c!set-counting #channel` or `c!set-counting` in the channel to activate the counting feature.");

        let d = "";
        for (const u of doc.users) if (u.saves > 0) d += `**${(await this.client.users.fetch(u.id))?.username || u.id}**: ${u.saves.toFixed(1)}\n`
        if (doc.current.waitingOnId) {
            const split = d.split("\n")
            const name = (await this.client.users.fetch(doc.current.waitingOnId))?.username
            let e = split.find(e => e.includes(name))
            const index = split.indexOf(e)
            e += " (Waiting for decision)"
            split[index] = e
            d = split.join("")

            // const index = d.indexOf(name) + name.length

            // console.log(index)
            // if (index) d = `${d.substring(0, index) + "(Waiting for decision)" + d.substring(index, d.length)}`
        }
        // const username = await this.client.users.fetch(doc.current.userId).catch(() => null).username
        let username: string;
        try {
            username = (await this.client.users.fetch(doc.current.userId)).username
        } catch (e) { username = "" }
        const e = new MessageEmbed()
            .setTitle(`${this.interaction.guild.name}'s stats for Creeper Counting`)
            .setThumbnail(this.interaction.guild.iconURL())
        d && e.addField("Saves", d);
        e
            .addField('Next Number', (doc.current.numberNow + 1).toString(), true)
            .addField('Current Number', username ? `${doc.current.numberNow} (Sent by ${username})` : doc.current.numberNow.toString(), true)
            .setColor('#2186DB')
            .setTimestamp()
        this.interaction.reply({ content: `took ${Math.floor(Date.now() - this.interaction.createdAt.getTime())}ms ${this.interaction.createdAt.toISOString()}, ${new Date().toISOString()} host: ${process.env.HOST_TYPE}`, embeds: [e] });
    }

    private async hack(i: BaseCommandInteraction<CacheType>): Promise<void> {

        if (i.user.id !== "481158632008974337" && i.user.id !== "539928835953524757") return i.reply({ content: "You don't have permission", ephemeral: true })

        const newNumber = i.options.get('new-number').value as number;
        const doc = await this._service.findOneByGuild(i.guild.id)
        if (!doc) return i.reply("You don't have any stats. Use `c!set-counting #channel` or `c!set-counting` in the channel to activate the counting feature.");

        doc.current.numberNow = newNumber;
        doc.current.userId = i.user.id;
        await this._service.saveDoc(doc);

        i.reply(`The current number was set to **${doc.current.numberNow}**. The next number is **${doc.current.numberNow + 1}**`)
    }


    // private async hack(i: BaseCommandInteraction<CacheType>): Promise<void> {

    //     if (i.user.id !== "481158632008974337" && i.user.id !== "539928835953524757") return i.reply({ content: "You don't have permission", ephemeral: true })

    //     const newNumber = i.options.get('new-number')?.value as number;
    //     const savesUser = i.options.get('saves-user')?.value as string;
    //     const savesServer = i.options.get('saves-server')?.value as string;

    //     const newSavesAmount = i.options.get('new-saves-amount')?.value as string;

    //     if (savesUser && !newSavesAmount || newSavesAmount && !savesUser) return this.interaction.reply({ content: 'You need both "saves-user" and "new-saves-amount" to change someones saves!', ephemeral: true })

    //     const doc = await this._service.findOneByGuild(i.guild.id)
    //     if (!doc) return i.reply("You don't have any stats. Use `c!set-counting #channel` or `c!set-counting` in the channel to activate the counting feature.");

    //     newNumber ? doc.current.numberNow = newNumber : null;
    //     newNumber ? doc.current.userId = i.user.id : null;
    //     const user = doc.current.

    //     await this._service.saveDoc(doc);

    //     let str = '';
    //     newNumber ? str += `The current number was set to **${doc.current.numberNow}**. The next number is **${doc.current.numberNow + 1}**` : null;
    //     i.reply(str)
    // }

    // private async handleHackSaveUserAutoComplete(i: AutocompleteInteraction<CacheType>) {
    //     const users = new Set<User>()
    //     const docs = await CountingModel.find()
    //     for (const doc of docs) for (const { id } of doc.users) {

    //         const u = await this.client.users.fetch(id).catch(() => null)
    //         users.add(u)
    //     }


    //     const usernames = [...users].map(u => u.username);
    //     const r: ApplicationCommandOptionChoice[] = []
    //     for (const u of usernames) {
    //         const o = <string>i.options.get("saves-user").value
    //         if (u.toLowerCase().match(o.toLowerCase())) r.push({ name: u, value: this.client.users.cache.find(us => us.username === u).id })
    //     }

    //     console.log(r)
    //     i.respond(r);
    // }

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

    private async check(msg: Message): Promise<void> {
        console.time(this.message.id)
        // const doc = await CountingModel.findOne({ guildId: this.message.guild.id });
        const doc = await this._service.findOneByGuild(this.message.guild.id)
        if (!doc) return;
        console.timeEnd(this.message.id)

        if (this.message.channel.id === doc.channelId && Number((this.message.content))) {

            if (doc.current.waitingOnId) {
                this.message.react("⌛")
                const m = await this.message.reply(`Waiting on ${(await this.client.users.fetch(doc.current.waitingOnId)).username} to finish their decision.`)
                // fix this so its ephemeral
                return void setTimeout(async () => {
                    try {
                        await msg.delete()
                        await m.delete()
                    } catch (e) {
                        console.error(e);

                    }
                }, 1000)
            }

            if (Number((this.message.content)) && Number((this.message.content)) === doc.current.numberNow + 1 && this.message.author.id !== doc.current.userId) {

                doc.current.numberNow = doc.current.numberNow + 1;
                doc.current.userId = msg.author.id;
                doc.current.waitingOnId = "";

                console.log("reacting")
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
                const badPool = [`What a idiot, **${this.message.author.username}**! You ruined it!`, `**${this.message.author.username}**, What an aerial! You ruined it!`, `**${this.message.author.username}**, I guess we can confirm now, math isn't your strong suite.`, `${this.message.author.username} missed an open net! You ruined it!`, `${this.message.author.username} whiffed! You ruined it!`, `${this.message.author.username} sold the game!`, `${this.message.author.username} threw the game!`];

                const user = doc.users.find(u => u.id === this.message.author.id)
                if (user?.saves >= 1) {
                    this.message.react('⚠️');
                    this.message.channel.send(`${badPool[Math.floor(badPool.length * Math.random())]} but... There is a chance to fix it!`);
                    this.warnings.set(doc.guildId, this.message)

                    const row = new MessageActionRow()
                        .addComponents(
                            new MessageButton()
                                .setCustomId(`counting-use-save-yes-${this.message.author.id}`)
                                .setLabel('✅ Yes')
                                .setStyle('PRIMARY'),
                            new MessageButton()
                                .setCustomId(`counting-use-save-no-${this.message.author.id}`)
                                .setLabel('🚫 No')
                                .setStyle('DANGER'),
                        );
                    console.log(doc.current)

                    const m = await this.message.channel.send({
                        content: `<@${this.message.author.id}>, you have **${user.saves}** saves. Would you like to use one to keep the current number as **${doc.current.numberNow.toString()}**?`,
                        components: [row]
                    })

                    doc.current.waitingOnId = msg.author.id;
                    await this._service.saveDoc(doc)

                    this.saveTimeout.set(m.id, setTimeout(async () => {
                        doc.current.numberNow = 0;
                        doc.current.userId = '';
                        doc.current.waitingOnId = "";
                        await this._service.saveDoc(doc)
                        await m.edit({ content: `**${msg.author.username}** took too long to decide if they should use a save. The next number is **1**`, components: [] })
                        msg.react('❌');

                    }, 15000))
                }
                else {
                    doc.current.numberNow = 0;
                    doc.current.userId = '';
                    this.message.react('❌');
                    this.message.channel.send(`${badPool[Math.floor(badPool.length * Math.random())]} The next number is 1.`);
                    // }
                }
            }

            console.time("save")
            await this._service.saveDoc(doc);
            // await doc.save();
            console.timeEnd("save")
        }
    }

    private async handleSaveButton(buttonI: ButtonInteraction<CacheType>) {
        const doc = await this._service.findOneByGuild(buttonI.guild.id)

        if (buttonI.customId.startsWith("counting-use-save-yes")) {
            if (!buttonI.customId.includes(buttonI.user.id)) return buttonI.reply({ content: `${await this.client.users.fetch(buttonI.customId.split("counting-use-save-yes-")[1])} makes their own decisions.`, ephemeral: true })

            doc.users[doc.users.findIndex(u => u.id === buttonI.user.id)].saves--
            doc.current.userId = buttonI.user.id;
            doc.current.waitingOnId = "";
            await this._service.saveDoc(doc)

            clearTimeout(this.saveTimeout.get(buttonI.message.id));
            this.saveTimeout.delete(buttonI.message.id);
            this.warnings.get(doc.guildId).react('☑️')
            this.warnings.delete(doc.guildId)
            buttonI.update({
                content: `The next number is **${doc.current.numberNow + 1}**. Someone that is *not* ${buttonI.user.username} should send the next number. ${buttonI.user.username} now has ${doc.users.find(u => u.id === buttonI.user.id).saves} saves.`,
                components: []
            })
        }

        else if (buttonI.customId.startsWith("counting-use-save-no")) {
            if (!buttonI.customId.includes(buttonI.user.id)) return buttonI.reply({ content: `${await this.client.users.fetch(buttonI.customId.split("counting-use-save-no-")[1])} makes their own decision.`, ephemeral: true })

            doc.current.numberNow = 0;
            doc.current.userId = '';
            doc.current.waitingOnId = "";
            await this._service.saveDoc(doc)

            clearTimeout(this.saveTimeout.get(buttonI.message.id));
            this.saveTimeout.delete(buttonI.message.id);
            this.warnings.get(doc.guildId)?.react('❌')
            this.warnings.delete(doc.guildId)
            buttonI.update({
                content: `**${buttonI.user.username}** did not use a save. The next number is **1**. They still have ${doc.users.find(u => u.id === buttonI.user.id).saves} saves.`,
                components: []
            })

        }
    }
}
