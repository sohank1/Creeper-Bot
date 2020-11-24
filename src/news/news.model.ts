import mongoose from "mongoose";
import { NewsResponseObject } from "./news.type";

interface News extends mongoose.Document {
    responseObject: NewsResponseObject;
}

const newsSchema = new mongoose.Schema({
    responseObject: { type: Object },
});

export default mongoose.model<News>("news", newsSchema);
