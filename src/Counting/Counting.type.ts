export interface CountingData {
    guildId: string;
    channelId: string;

    current?: {
        numberNow: number,
        userId: string,
        waitingOnId: string
    }

    users?: { id: string; saves?: number; lastVotedAt?: Date }[];
}