import mongoose from "mongoose";

export interface DonaldData extends mongoose.Document {
    location: string;
    banner: string;
}

const newsSchema = new mongoose.Schema({
    location: String,
    banner: String,
});

export default mongoose.model<DonaldData>("DonaldTracker", newsSchema);
