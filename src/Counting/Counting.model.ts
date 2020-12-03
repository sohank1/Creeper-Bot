import mongoose from 'mongoose';
import { CountingData } from './Counting.type';

export interface CountingDoc extends mongoose.Document, CountingData { }

const countingSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    current: {
        userId: { type: String, required: false },
        numberNow: { type: Number, required: false, default: 0 }
    }
});

export default mongoose.model<CountingDoc>('counting', countingSchema);
