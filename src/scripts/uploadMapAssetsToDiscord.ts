import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { once } from "events";
import { Client, Intents, TextChannel } from "discord.js";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

type MapImageManifestEntry = {
    archiveVersion: string;
    relativePath: string;
    sourceUrl: string;
    chapter: number;
    season: number;
    downloadedAt: string;
    discordUrl?: string;
    discordMessageId?: string;
    discordChannelId?: string;
    discordGuildId?: string;
    uploadedAt?: string;
};

type MapImageManifest = {
    generatedAt: string;
    source: string;
    count: number;
    versions: Record<string, MapImageManifestEntry>;
};

const GUILD_ID = "795712339240419329";
const CHANNEL_ID = "1516970992155492512";
const MANIFEST_PATH = path.join(process.cwd(), "src", "Fortnite", "FortniteMap", "mapImageManifest.json");
const ASSET_ROOT = path.join(process.cwd(), "assets", "fortnite-maps");
const UPLOAD_DELAY_MS = 1500;
const MANIFEST_WRITE_RETRIES = 5;

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getBotToken() {
    return process.env.BOT_TOKEN || process.env.DEV_BOT_TOKEN || "";
}

async function saveManifest(manifest: MapImageManifest) {
    const tempPath = `${MANIFEST_PATH}.tmp`;
    const payload = JSON.stringify(manifest, null, 2);

    for (let attempt = 1; attempt <= MANIFEST_WRITE_RETRIES; attempt++) {
        try {
            await fs.promises.writeFile(tempPath, payload, "utf8");
            await fs.promises.rename(tempPath, MANIFEST_PATH);
            return;
        } catch (error) {
            if (attempt === MANIFEST_WRITE_RETRIES) {
                throw error;
            }

            await sleep(250 * attempt);
        }
    }
}

async function uploadMapAssets() {
    const token = getBotToken();
    if (!token) {
        throw new Error("Missing Discord bot token.");
    }

    const manifest = JSON.parse(await fs.promises.readFile(MANIFEST_PATH, "utf8")) as MapImageManifest;
    const versions = Object.entries(manifest.versions);

    const client = new Client({
        restTimeOffset: 75,
        intents: new Intents(["GUILDS", "GUILD_MESSAGES"])
    });

    const readyPromise = once(client, "ready");
    await client.login(token);
    await readyPromise;

    try {
        await client.guilds.fetch(GUILD_ID);
        const rawChannel = await client.channels.fetch(CHANNEL_ID);
        if (!rawChannel || rawChannel.type !== "GUILD_TEXT") {
            throw new Error(`Channel ${CHANNEL_ID} is not a text channel.`);
        }

        const channel = rawChannel as TextChannel;

        let uploaded = 0;
        let skipped = 0;

        for (const [version, entry] of versions) {
            if (entry.discordUrl) {
                skipped++;
                continue;
            }

            const filePath = path.join(process.cwd(), ...entry.relativePath.split("/"));
            if (!filePath.startsWith(ASSET_ROOT)) {
                throw new Error(`Resolved file path escaped asset root for ${version}: ${filePath}`);
            }

            if (!fs.existsSync(filePath)) {
                throw new Error(`Missing asset file for ${version}: ${filePath}`);
            }

            console.log(`Uploading ${version} from ${path.basename(filePath)}...`);
            const message = await channel.send({
                content: `fortnite-map:${version}`,
                files: [filePath]
            });

            const attachment = message.attachments.first();
            if (!attachment?.url) {
                throw new Error(`Upload for ${version} did not return an attachment URL.`);
            }

            entry.discordUrl = attachment.url;
            entry.discordMessageId = message.id;
            entry.discordChannelId = channel.id;
            entry.discordGuildId = channel.guild.id;
            entry.uploadedAt = new Date().toISOString();

            uploaded++;
            await saveManifest(manifest);
            await sleep(UPLOAD_DELAY_MS);
        }

        console.log(`Upload complete. Uploaded ${uploaded}, skipped ${skipped}.`);
    } finally {
        client.destroy();
    }
}

uploadMapAssets().catch((error: any) => {
    console.error("Failed to upload Fortnite map assets to Discord:", error.message);
    process.exit(1);
});
