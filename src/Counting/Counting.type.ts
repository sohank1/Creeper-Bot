export interface CountingData {
    guildId: string;
    channelId: string;

    current?: {
        numberNow: number,
        userId: string,
    }

    users?: { id: string; saves?: number; canVoteAt: Date }[];
}