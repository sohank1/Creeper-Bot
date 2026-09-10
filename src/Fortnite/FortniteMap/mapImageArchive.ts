import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import https from "https";
import { Client, TextChannel } from "discord.js";

export type MapImageManifestEntry = {
    archiveVersion: string;
    relativePath?: string;
    sourceUrl: string;
    chapter: number;
    season: number;
    downloadedAt?: string;
    discordUrl?: string;
    discordMessageId?: string;
    discordChannelId?: string;
    discordGuildId?: string;
    uploadedAt?: string;
};

export type MapImageManifest = {
    generatedAt: string;
    source: string;
    count: number;
    versions: Record<string, MapImageManifestEntry>;
};

export type FortniteArchiveManifestEntry = {
    version: string;
    chapter: number;
    season: number;
    path: string;
    hasMap: boolean;
    mapFile: string | null;
    hasPois?: boolean;
    poisFile?: string | null;
};

export type FortniteArchiveManifest = {
    generated: string;
    latest?: string;
    count: number;
    versions: FortniteArchiveManifestEntry[];
};

type MapImageArchiveTarget = {
    version: string;
    chapter: number;
    season: number;
};

const MAP_IMAGE_MANIFEST_PATH = path.join(process.cwd(), "src", "Fortnite", "FortniteMap", "mapImageManifest.json");
const MAP_IMAGE_API_URL = "https://prod.api-fortnite.com/api/v1/map/image";
export const FORTNITE_ARCHIVE_MANIFEST_URL = "https://raw.githubusercontent.com/yaelbrinkert/fortnite-archives/main/manifest.json";
const FORTNITE_ARCHIVE_RAW_ROOT = "https://raw.githubusercontent.com/yaelbrinkert/fortnite-archives/main";
const HTTP_AGENT = new https.Agent({ rejectUnauthorized: false });
const MANIFEST_WRITE_RETRIES = 5;
const MAP_IMAGE_GUILD_ID = "795712339240419329";
const MAP_IMAGE_CHANNEL_ID = "1516970992155492512";
const UPLOAD_DELAY_MS = 1500;

export function normalizeMapVersion(version: string): string {
    return version.replace(/\./g, "_");
}

function getEmptyManifest(): MapImageManifest {
    return {
        generatedAt: new Date().toISOString(),
        source: MAP_IMAGE_API_URL,
        count: 0,
        versions: {}
    };
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getArchiveVersion(version: string) {
    return version.replace(/_/g, ".");
}

function detectImageExtension(contentType: string) {
    const normalized = contentType.toLowerCase();
    if (normalized.includes("png")) return ".png";
    if (normalized.includes("webp")) return ".webp";
    if (normalized.includes("jpg") || normalized.includes("jpeg")) return ".jpg";
    return ".jpg";
}

function encodeRawGithubPath(inputPath: string): string {
    return inputPath.split("/").map(part => encodeURIComponent(part)).join("/");
}

export function getFortniteArchiveMapImageUrl(entry: FortniteArchiveManifestEntry): string | null {
    if (!entry.hasMap || !entry.mapFile) return null;

    return `${FORTNITE_ARCHIVE_RAW_ROOT}/${encodeRawGithubPath(entry.path)}/${encodeURIComponent(entry.mapFile)}`;
}

export async function loadFortniteArchiveManifest(): Promise<FortniteArchiveManifest | null> {
    try {
        const response = await axios.get<FortniteArchiveManifest>(FORTNITE_ARCHIVE_MANIFEST_URL, {
            httpsAgent: HTTP_AGENT,
            timeout: 30000
        });

        if (!Array.isArray(response.data?.versions)) {
            throw new Error("Archive manifest does not contain a versions array.");
        }

        return response.data;
    } catch (error: any) {
        console.warn(`[FortniteMap] Failed to load the GitHub archive manifest: ${error.message}`);
        return null;
    }
}

export async function loadMapImageManifest(): Promise<MapImageManifest> {
    try {
        const fileContent = await fs.promises.readFile(MAP_IMAGE_MANIFEST_PATH, "utf8");
        const parsed = JSON.parse(fileContent) as MapImageManifest;

        return {
            generatedAt: parsed.generatedAt || new Date().toISOString(),
            source: parsed.source || MAP_IMAGE_API_URL,
            count: parsed.count || Object.keys(parsed.versions || {}).length,
            versions: parsed.versions || {}
        };
    } catch (error: any) {
        if (error?.code !== "ENOENT") {
            throw error;
        }

        return getEmptyManifest();
    }
}

export async function saveMapImageManifest(manifest: MapImageManifest) {
    const tempPath = `${MAP_IMAGE_MANIFEST_PATH}.tmp`;
    const payload = JSON.stringify(manifest, null, 2);

    for (let attempt = 1; attempt <= MANIFEST_WRITE_RETRIES; attempt++) {
        try {
            await fs.promises.writeFile(tempPath, payload, "utf8");
            await fs.promises.copyFile(tempPath, MAP_IMAGE_MANIFEST_PATH);
            await fs.promises.unlink(tempPath);
            return;
        } catch (error) {
            if (attempt === MANIFEST_WRITE_RETRIES) {
                throw error;
            }

            await sleep(250 * attempt);
        }
    }
}

async function downloadApiImage(version: string, apiKey: string) {
    const res = await axios.get<ArrayBuffer>(`${MAP_IMAGE_API_URL}?version=${encodeURIComponent(version)}`, {
        responseType: "arraybuffer",
        headers: { "x-api-key": apiKey },
        httpsAgent: HTTP_AGENT,
        timeout: 60000
    });

    return {
        buffer: Buffer.from(res.data),
        ext: detectImageExtension(String(res.headers["content-type"] || ""))
    };
}

async function resolveMapImageChannel(client: Client): Promise<TextChannel> {
    await client.guilds.fetch(MAP_IMAGE_GUILD_ID);
    const rawChannel = await client.channels.fetch(MAP_IMAGE_CHANNEL_ID);

    if (!rawChannel || rawChannel.type !== "GUILD_TEXT") {
        throw new Error(`Channel ${MAP_IMAGE_CHANNEL_ID} is not a text channel.`);
    }

    return rawChannel as TextChannel;
}

export async function ensureMapImageHosted(target: MapImageArchiveTarget, apiKey: string, client: Client): Promise<MapImageManifestEntry> {
    const normalizedVersion = normalizeMapVersion(target.version);
    const manifest = await loadMapImageManifest();
    const existingEntry = manifest.versions[normalizedVersion];

    if (existingEntry?.discordUrl) {
        return existingEntry;
    }

    const image = await downloadApiImage(target.version, apiKey);
    const channel = await resolveMapImageChannel(client);
    const fileName = `${normalizedVersion}${image.ext}`;
    const message = await channel.send({
        content: `fortnite-map:${normalizedVersion}`,
        files: [{ attachment: image.buffer, name: fileName }]
    });

    const attachment = message.attachments.first();
    if (!attachment?.url) {
        throw new Error(`Upload for ${normalizedVersion} did not return an attachment URL.`);
    }

    const nextEntry: MapImageManifestEntry = {
        ...existingEntry,
        archiveVersion: existingEntry?.archiveVersion || getArchiveVersion(target.version),
        sourceUrl: `${MAP_IMAGE_API_URL}?version=${encodeURIComponent(target.version)}`,
        chapter: target.chapter,
        season: target.season,
        downloadedAt: existingEntry?.downloadedAt || new Date().toISOString(),
        discordUrl: attachment.url,
        discordMessageId: message.id,
        discordChannelId: channel.id,
        discordGuildId: channel.guild.id,
        uploadedAt: new Date().toISOString()
    };

    manifest.versions[normalizedVersion] = nextEntry;
    manifest.generatedAt = new Date().toISOString();
    manifest.count = Object.keys(manifest.versions).length;

    await saveMapImageManifest(manifest);
    await sleep(UPLOAD_DELAY_MS);

    return nextEntry;
}
