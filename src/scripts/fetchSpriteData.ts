import * as fs from "fs";
import * as path from "path";
import { fetchSpriteData, stableSpriteDataJson, validateSpriteData } from "../Fortnite/FortniteSprites/spriteDataSource";

async function fetchAndWriteSpriteData() {
    try {
        console.log("Fetching Fortnite sprite data...");
        const data = await fetchSpriteData();
        validateSpriteData(data);

        const outputPath = path.join(__dirname, "../Fortnite/FortniteSprites/spriteData.json");
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, stableSpriteDataJson(data), "utf8");

        console.log(`Successfully saved Fortnite sprite data to ${outputPath}`);
    } catch (err: any) {
        console.error("Error fetching Fortnite sprite data:", err.message || err);
        if (err.response) {
            console.error("Response data:", err.response.data);
            console.error("Response status:", err.response.status);
        }
        process.exit(1);
    }
}

fetchAndWriteSpriteData();
