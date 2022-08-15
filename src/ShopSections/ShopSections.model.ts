import mongoose from "mongoose";

export interface ShopSections extends mongoose.Document {
    updatedAt: Date;
}

const ShopSectionsSchema = new mongoose.Schema({
    updatedAt: { type: Date },
});

export default mongoose.model<ShopSections>("ShopSections", ShopSectionsSchema);
