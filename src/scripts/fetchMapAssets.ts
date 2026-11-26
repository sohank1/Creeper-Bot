import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import https from "https";
import "dotenv/config";

type MapDataItem = {
    version: string;
    chapter: number;
    season: number;
    hasImage: boolean;
};

type ArchiveManifestEntry = {
    version: string;
    chapter: number;
    season: number;
    path: string;
    hasMap: boolean;
    mapFile: string | null;
};

type ArchiveManifest = {
    generated: string;
    versions: ArchiveManifestEntry[];
};

type LocalImageManifestEntry = {
    archiveVersion: string;
    relativePath: string;
    sourceUrl: string;
    chapter: number;
    season: number;
    downloadedAt: string;
};

type LocalImageManifest = {
    generatedAt: string;
    source: string;
    count: number;
    versions: Record<string, LocalImageManifestEntry>;
};

const ARCHIVE_MANIFEST_URL = "https://raw.githubusercontent.com/yaelbrinkert/fortnite-archives/main/manifest.json";
const API_HISTORY_URL = "https://prod.api-fortnite.com/api/v1/map/history";
const API_IMAGE_URL = "https://prod.api-fortnite.com/api/v1/map/image";
const LOCAL_HISTORY_PATH = path.join(__dirname, "../Fortnite/FortniteMap/mapHistory.json");
const OUTPUT_DIR = path.join(process.cwd(), "assets", "fortnite-maps");
const OUTPUT_MANIFEST_PATH = path.join(__dirname, "../Fortnite/FortniteMap/mapImageManifest.json");
const HTTP_AGENT = new https.Agent({ rejectUnauthorized: false });
const DOWNLOAD_CONCURRENCY = 6;

function normalizeVersion(version: string): string {
    return version.replace(/\./g, "_");
}

function encodeRawGithubPath(inputPath: string): string {
    return inputPath.split("/").map(part => encodeURIComponent(part)).join("/");
}

function buildSourceUrl(entry: ArchiveManifestEntry): string {
    if (!entry.mapFile) {
        throw new Error(`Archive entry ${entry.version} does not include a map file.`);
    }

    return `https://raw.githubusercontent.com/yaelbrinkert/fortnite-archives/main/${encodeRawGithubPath(entry.path)}/${encodeURIComponent(entry.mapFile)}`;
}

async function downloadFile(url: string, outputPath: string): Promise<void> {
    const res = await axios.get<ArrayBuffer>(url, {
        responseType: "arraybuffer",
        httpsAgent: HTTP_AGENT,
        timeout: 60000
    });

    await fs.promises.writeFile(outputPath, Buffer.from(res.data));
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
    let currentIndex = 0;

    const runWorker = async () => {
        while (true) {
            const index = currentIndex++;
            if (index >= items.length) {
                return;
            }

            await worker(items[index], index);
        }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => runWorker()));
}

async function fetchApiHistory(): Promise<MapDataItem[] | null> {
    const apiKey = process.env.FORTNITE_MAP_API_KEY;
    if (!apiKey) {
        console.warn("FORTNITE_MAP_API_KEY is not set. Skipping live history validation.");
        return null;
    }

    try {
        const res = await axios.get(API_HISTORY_URL, {
            headers: { "x-api-key": apiKey },
            httpsAgent: HTTP_AGENT,
            timeout: 30000
        });

        const history = Array.isArray(res.data?.data) ? res.data.data : [];
        console.log(`Fetched ${history.length} versions from live API history.`);
        return history;
    } catch (error: any) {
        console.warn(`Live API history check failed, falling back to local history: ${error.message}`);
        return null;
    }
}

async function downloadApiImage(version: string) {
    const apiKey = process.env.FORTNITE_MAP_API_KEY;
    if (!apiKey) {
        throw new Error(`Cannot download ${version} from API without FORTNITE_MAP_API_KEY.`);
    }

    const res = await axios.get<ArrayBuffer>(`${API_IMAGE_URL}?version=${encodeURIComponent(version)}`, {
        responseType: "arraybuffer",
        headers: { "x-api-key": apiKey },
        httpsAgent: HTTP_AGENT,
        timeout: 60000
    });

    const contentType = String(res.headers["content-type"] || "").toLowerCase();
    const ext = contentType.includes("png") ? ".png" : ".jpg";

    return {
        buffer: Buffer.from(res.data),
        ext
    };
}

async function fetchMapAssets() {
    console.log("Fetching archive manifest...");
    const manifestRes = await axios.get<ArchiveManifest>(ARCHIVE_MANIFEST_URL, {
        httpsAgent: HTTP_AGENT,
        timeout: 30000
    });

    const archiveManifest = manifestRes.data;
    const archiveByVersion = new Map<string, ArchiveManifestEntry>();
    for (const entry of archiveManifest.versions || []) {
        archiveByVersion.set(normalizeVersion(entry.version), entry);
    }

    const localHistory: MapDataItem[] = JSON.parse(await fs.promises.readFile(LOCAL_HISTORY_PATH, "utf8"));
    const apiHistory = await fetchApiHistory();
    const historySource = apiHistory && apiHistory.length > 0 ? apiHistory : localHistory;
    const imageVersions = historySource.filter(item => item.hasImage);

    if (apiHistory) {
        const localVersions = new Set(localHistory.map(item => normalizeVersion(item.version)));
        const apiOnlyVersions = apiHistory
            .map(item => normalizeVersion(item.version))
            .filter(version => !localVersions.has(version));

        if (apiOnlyVersions.length > 0) {
            console.warn(`Live API history contains ${apiOnlyVersions.length} versions not present in local mapHistory.json: ${apiOnlyVersions.join(", ")}`);
        }
    }

    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

    const localManifest: LocalImageManifest = {
        generatedAt: new Date().toISOString(),
        source: ARCHIVE_MANIFEST_URL,
        count: 0,
        versions: {}
    };

    const missingVersions: string[] = [];

    await mapWithConcurrency(imageVersions, DOWNLOAD_CONCURRENCY, async (item, index) => {
        const archiveEntry = archiveByVersion.get(normalizeVersion(item.version));
        let fileName: string;
        let outputPath: string;
        let sourceUrl: string;

        if (archiveEntry && archiveEntry.hasMap && archiveEntry.mapFile) {
            const ext = path.extname(archiveEntry.mapFile) || ".jpg";
            fileName = `${normalizeVersion(item.version)}${ext.toLowerCase()}`;
            outputPath = path.join(OUTPUT_DIR, fileName);
            sourceUrl = buildSourceUrl(archiveEntry);

            if (!fs.existsSync(outputPath)) {
                console.log(`[${index + 1}/${imageVersions.length}] Downloading ${item.version} from archive -> ${fileName}`);
                await downloadFile(sourceUrl, outputPath);
            }

            localManifest.versions[normalizeVersion(item.version)] = {
                archiveVersion: archiveEntry.version,
                relativePath: path.relative(process.cwd(), outputPath).replace(/\\/g, "/"),
                sourceUrl,
                chapter: item.chapter,
                season: item.season,
                downloadedAt: new Date().toISOString()
            };
            return;
        }

        try {
            console.log(`[${index + 1}/${imageVersions.length}] Archive missing ${item.version}, downloading directly from API...`);
            const apiImage = await downloadApiImage(item.version);
            fileName = `${normalizeVersion(item.version)}${apiImage.ext}`;
            outputPath = path.join(OUTPUT_DIR, fileName);
            sourceUrl = `${API_IMAGE_URL}?version=${encodeURIComponent(item.version)}`;
            await fs.promises.writeFile(outputPath, apiImage.buffer);

            localManifest.versions[normalizeVersion(item.version)] = {
                archiveVersion: item.version,
                relativePath: path.relative(process.cwd(), outputPath).replace(/\\/g, "/"),
                sourceUrl,
                chapter: item.chapter,
                season: item.season,
                downloadedAt: new Date().toISOString()
            };
        } catch (error) {
            missingVersions.push(item.version);
        }
    });

    localManifest.count = Object.keys(localManifest.versions).length;

    await fs.promises.writeFile(OUTPUT_MANIFEST_PATH, JSON.stringify(localManifest, null, 2), "utf8");

    console.log(`Saved ${localManifest.count} cached map images to ${OUTPUT_DIR}`);
    console.log(`Saved local image manifest to ${OUTPUT_MANIFEST_PATH}`);

    if (missingVersions.length > 0) {
        console.warn(`Archive did not contain ${missingVersions.length} requested versions: ${missingVersions.join(", ")}`);
    }
}

fetchMapAssets().catch((error: any) => {
    console.error("Failed to fetch Fortnite map assets:", error.message);
    if (error.response?.status) {
        console.error("Status:", error.response.status);
    }
    process.exit(1);
});
