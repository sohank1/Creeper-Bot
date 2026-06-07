import axios from "axios";
import { fortniteApiUrl } from "../Fortnite/fortniteApi";

// --- 1. Mock Interfaces (Matches the new JSON structure) ---
interface RootResponse {
    status: number;
    data: {
        br?: CosmeticItem[];
        cars?: CosmeticItem[];
        instruments?: CosmeticItem[];
        lego?: CosmeticItem[];
        legoKits?: CosmeticItem[];
        tracks?: TrackItem[];
        beans?: CosmeticItem[];
    };
}

interface CosmeticItem {
    id: string;
    name: string;
    type: { value: string; displayValue: string };
    shopHistory?: string[] | null;
    images?: {
        icon?: string;
        small?: string;
        large?: string;
    };
}

interface TrackItem extends CosmeticItem {
    title?: string;
    artist?: string;
}

// --- 2. Configuration ---
const DAYS_THRESHOLD = 300; // Items not seen for this many days are "Missing"
const API_URL = fortniteApiUrl("/v2/cosmetics/?responseFlags=7");

// --- 3. Main Script ---
(async () => {
    console.log("🔵 Starting Cosmetic Fetch Test...");
    console.log(`🎯 Looking for items last seen > ${DAYS_THRESHOLD} days ago.`);

    try {
        // 1. Fetch Data
        const startTime = Date.now();
        const response = await axios.get<RootResponse>(API_URL);
        const duration = Date.now() - startTime;

        const data = response.data.data;

        if (!data) {
            console.error("❌ Error: API returned no data object.");
            return;
        }

        console.log(`✅ API Response received in ${duration}ms.`);

        // 2. Flatten Data (The Logic)
        let allItems: CosmeticItem[] = [];

        // Helper to add category items safely
        const addCategory = (items: CosmeticItem[] | undefined, label: string) => {
            if (items && Array.isArray(items)) {
                // Label them for debugging visibility if needed
                console.log(`   - Found ${items.length} ${label}`);
                allItems.push(...items);
            }
        };

        addCategory(data.br, "BR Items");
        addCategory(data.cars, "Cars");
        addCategory(data.instruments, "Instruments");
        addCategory(data.lego, "Lego Decor");
        addCategory(data.legoKits, "Lego Kits");
        addCategory(data.beans, "Beans");

        // Tracks need special name formatting
        if (data.tracks) {
            console.log(`   - Found ${data.tracks.length} Jam Tracks`);
            const formattedTracks = data.tracks.map((t) => ({
                ...t,
                // Create a readable name for tracks which split Title/Artist
                name: (t.artist && t.title) ? `${t.artist} - ${t.title}` : t.name,
                type: { value: 'music', displayValue: 'Jam Track' }
            }));
            allItems.push(...formattedTracks);
        }

        console.log(`📦 Total Flat List Size: ${allItems.length} items.`);

        // 3. Filter for Missing Items
        const now = new Date();
        let missingItems: { name: string; type: string; days: number; date: string }[] = [];

        for (const item of allItems) {
            // Skip items that have never been in the shop
            if (!item.shopHistory || item.shopHistory.length === 0) continue;

            const lastSeenStr = item.shopHistory[item.shopHistory.length - 1];
            const lastSeenDate = new Date(lastSeenStr);

            // Calculate gap
            const diffTime = Math.abs(now.getTime() - lastSeenDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= DAYS_THRESHOLD) {
                missingItems.push({
                    name: item.name,
                    type: item.type?.displayValue || "Unknown",
                    days: diffDays,
                    date: lastSeenDate.toLocaleDateString("en-US")
                });
            }
        }

        // 4. Sort (Rarest First)
        missingItems.sort((a, b) => b.days - a.days);

        // 5. Output Report
        console.log(`\n--------- 📊 RESULTS ---------`);
        console.log(`Found ${missingItems.length} items missing for ${DAYS_THRESHOLD}+ days.\n`);

        // Show top 15 rarest items
        console.log("--- Top 15 Rarest ---");
        missingItems.slice(0, 15).forEach((item, index) => {
            console.log(`${index + 1}. [${item.days} days] ${item.name} (${item.type}) - Last Seen: ${item.date}`);
        });

        if (missingItems.length > 15) {
            console.log(`\n... plus ${missingItems.length - 15} others.`);
        }

        console.log("\n✅ Test Complete.");

    } catch (error: any) {
        console.error("❌ Script failed:", error.message);
    }
})();