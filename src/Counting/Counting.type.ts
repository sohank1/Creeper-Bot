export interface CountingData {
    guildId: string;
    channelId: string;

    current?: {
        numberNow: number,
        userId: string,
    }
}