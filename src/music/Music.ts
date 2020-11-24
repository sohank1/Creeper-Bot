import { Client, Message, TextChannel, VoiceChannel, VoiceConnection } from "discord.js";
import { promises as fs } from 'fs';
import { TextChange } from "typescript";

export class Music {
    private connection: VoiceConnection;
    private vc: VoiceChannel;

    constructor(private client: Client) {
        this.join();
    }

    public async join(message?: Message): Promise<void> {
        this.vc = message?.member.voice.channel || <VoiceChannel>this.client.channels.cache.get("570349873824792577");
        this.connection = await this.vc.join();
        // this.connection.play("assets/Fortnite_The_End_Event_Music.mp3");

        message ? message.channel.send(`Joined ${this.vc.name}!`) :
            (this.client.channels.cache.get("570377690268434432") as TextChannel).send(`Joined ${this.vc.name}!`);
    }

    public async leave(message: Message): Promise<void> {
        this.vc.leave();
        message.channel.send(`Left ${this.vc.name}!`);
    }
}