import mongoose from "mongoose";
import { SectionStoreEnds } from "./ShopSections.type";

export interface ShopSections extends mongoose.Document {
    updatedAt: Date;
    sections: SectionStoreEnds;
}

const ShopSectionsSchema = new mongoose.Schema({
    updatedAt: { type: Date },
    sections: { type: Object },
});

export default mongoose.model<ShopSections>("ShopSections", ShopSectionsSchema);
