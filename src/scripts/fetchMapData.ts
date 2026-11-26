import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import "dotenv/config";
import https from "https";

type MapHistoryItem = {
    version: string;
    chapter: number;
    season: number;
    patch: string;
    releaseDate: string;
    hasImage: boolean;
    imageUrl: string;
    hasPois: boolean;
};

type Poi = {
    name: string;
    x: number | null;
    y: number | null;
    type: string;
};

type MapDetailedResponse = MapHistoryItem & {
    pois: Poi[];
};

type ArchiveLocation = {
    city: string;
    versions: string[];
};

async function fetchMapData() {
    const apiKey = process.env.FORTNITE_MAP_API_KEY;
    if (!apiKey) {
        console.error("Missing FORTNITE_MAP_API_KEY in environment variables.");
        process.exit(1);
    }

    const agent = new https.Agent({ rejectUnauthorized: false });

    try {
        console.log("Fetching map history...");
        const historyRes = await axios.get("https://prod.api-fortnite.com/api/v1/map/history", {
            headers: { "x-api-key": apiKey },
            httpsAgent: agent
        });
        const history: MapHistoryItem[] = historyRes.data.data;

        console.log("Fetching Fortnite Archives POI data...");
        const archiveRes = await axios.get("https://raw.githubusercontent.com/yaelbrinkert/fortnite-archives/main/named_locations_through_updates.json", {
            httpsAgent: agent
        });
        const archiveData: ArchiveLocation[] = archiveRes.data;

        // Invert archive data into a map of version -> Set of POI names
        const archiveVersionToPois = new Map<string, Set<string>>();
        for (const loc of archiveData) {
            for (const v of loc.versions) {
                if (!archiveVersionToPois.has(v)) {
                    archiveVersionToPois.set(v, new Set<string>());
                }
                archiveVersionToPois.get(v)!.add(loc.city);
            }
        }

        const outputDir = path.join(__dirname, "../Fortnite/FortniteMap");
        fs.mkdirSync(outputDir, { recursive: true });

        const historyPath = path.join(outputDir, "mapHistory.json");
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2), "utf8");

        const dataPath = path.join(outputDir, "mapData.json");
        let existingData: MapDetailedResponse[] = [];
        if (fs.existsSync(dataPath)) {
            try {
                existingData = JSON.parse(fs.readFileSync(dataPath, "utf8"));
            } catch (e) {
                console.warn("Could not parse existing mapData.json, creating new.");
            }
        }

        const existingVersions = new Set(existingData.map(d => d.version));
        let finalData: MapDetailedResponse[] = [...existingData];
        const newEntries: MapDetailedResponse[] = [];

        for (const h of history) {
            if (existingVersions.has(h.version)) {
                continue;
            }

            console.log(`Fetching detailed data for version ${h.version}...`);
            let detailed: MapDetailedResponse;
            try {
                const detailRes = await axios.get(`https://prod.api-fortnite.com/api/v1/map?version=${h.version}`, {
                    headers: { "x-api-key": apiKey },
                    httpsAgent: agent
                });
                detailed = detailRes.data.data;
            } catch (err: any) {
                console.error(`Failed to fetch version ${h.version}, creating fallback entry...`);
                detailed = { ...h, pois: [] };
            }

            if (detailed.hasImage === undefined) {
                detailed.hasImage = h.hasImage;
            }

            // Ensure pois array exists
            if (!detailed.pois) {
                detailed.pois = [];
            }

            // Merge missing POIs from archives
            const versionNoV = h.version.replace(/^v/, '');
            const versionDotted = h.version.replace(/_/g, '.');
            const versionDottedNoV = versionNoV.replace(/_/g, '.');

            let archivePois = archiveVersionToPois.get(h.version)
                || archiveVersionToPois.get(versionNoV)
                || archiveVersionToPois.get(versionDotted)
                || archiveVersionToPois.get(versionDottedNoV);

            if (!archivePois && h.patch) {
                archivePois = archiveVersionToPois.get(h.patch)
                    || archiveVersionToPois.get(h.patch.replace(/_/g, '.'));
            }

            if (archivePois) {
                const existingPoiNames = new Set(detailed.pois.map(p => p.name.toLowerCase()));
                for (const poiName of archivePois) {
                    if (!existingPoiNames.has(poiName.toLowerCase())) {
                        detailed.pois.push({
                            name: poiName,
                            x: null,
                            y: null,
                            type: "Archive"
                        });
                        detailed.hasPois = true;
                    }
                }
            }

            newEntries.push(detailed);

            // small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 200));
        }

        finalData = [...newEntries, ...finalData];

        // Post-processing: chronologically inherit POIs for versions that are missing them   this is wrong get 
        // finalData is sorted Newest to Oldest. We want to iterate from Oldest to Newest
        let lastSeenPois: Poi[] = [];
        for (let i = finalData.length - 1; i >= 0; i--) {
            const entry = finalData[i];
            if (entry.pois && entry.pois.length > 0) {
                lastSeenPois = entry.pois;
            } else if (lastSeenPois.length > 0) {
                // Inherit from the previous chronological version
                entry.pois = lastSeenPois.map(p => ({ ...p, type: "Inherited" }));
                entry.hasPois = true;
            }
        }

        // Write final data mapping out
        fs.writeFileSync(dataPath, JSON.stringify(finalData, null, 2), "utf8");
        console.log(`Successfully saved detailed map data to ${dataPath}`);
    } catch (err: any) {
        console.error("Error fetching map data:", err.message);
        if (err.response) {
            console.error("Response data:", err.response.data);
            console.error("Response status:", err.response.status);
        }
        process.exit(1);
    }
}

fetchMapData();
