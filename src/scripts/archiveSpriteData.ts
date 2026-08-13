import axios from "axios";
import { createHash } from "crypto";
import * as fs from "fs";
import https from "https";
import * as path from "path";
import { loadImage } from "@napi-rs/canvas/node-canvas";
import { fetchSpriteData, SpriteDataFile, stableSpriteDataJson, validateSpriteData } from "../Fortnite/FortniteSprites/spriteDataSource";

type ArchiveAsset = {
    variantId: number;
    familyKey: string;
    spriteName: string;
    sourceUrl: string;
    resolvedFrom: string;
    file: string;
    mimeType: string;
    bytes: number;
    width: number;
    height: number;
    sha256: string;
};

type SpriteArchiveManifest = {
    schemaVersion: 1;
    season: {
        id: string;
        displayName: string;
        chapter?: number;
        season?: number;
    };
    archivedAt: string;
    source: {
        page: string;
        fetchedAt: string;
        dataFile: string;
        dataSha256: string;
    };
    localDataFile: string;
    familyCount: number;
    spriteCount: number;
    totalAssetBytes: number;
    assets: ArchiveAsset[];
};

const DEFAULT_SEASON_ID = "chapter-7-season-3";
const DEFAULT_SEASON_NAME = "Fortnite Chapter 7 Season 3";
const DEFAULT_ARCHIVE_ROOT = process.env.FORTNITE_SPRITE_ARCHIVE_DIR
    ? path.resolve(process.env.FORTNITE_SPRITE_ARCHIVE_DIR)
    : path.join(process.cwd(), "sprite-archives");
const SOURCE_PAGE = "https://fortnite.gg/sprites";
const DOWNLOAD_CONCURRENCY = 6;
const SPRITE_CACHE_DIR = path.join(process.cwd(), ".cache", "fortnite-sprites", "assets");
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function argument(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseOptionalInteger(name: string): number | undefined {
    const value = argument(name);
    if (value == null) return undefined;
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`--${name} must be a non-negative integer.`);
    return parsed;
}

function validateSeasonId(value: string): string {
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(value)) {
        throw new Error("--season-id must use 2-49 lowercase letters, numbers, or hyphens.");
    }
    return value;
}

function sha256(value: Buffer | string): string {
    return createHash("sha256").update(value).digest("hex");
}

function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "sprite";
}

function extensionFor(mimeType: string, sourceUrl: string): string {
    const normalized = mimeType.split(";")[0].trim().toLowerCase();
    if (normalized === "image/png") return ".png";
    if (normalized === "image/webp") return ".webp";
    if (normalized === "image/jpeg") return ".jpg";
    const sourceExtension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
    return [".png", ".webp", ".jpg", ".jpeg"].includes(sourceExtension) ? sourceExtension : ".img";
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    async function worker() {
        while (true) {
            const index = nextIndex++;
            if (index >= items.length) return;
            results[index] = await mapper(items[index], index);
        }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => worker()));
    return results;
}

async function decodeImage(data: Buffer, mimeType: string, resolvedFrom: string) {
    if (!mimeType.startsWith("image/") || data.length === 0) {
        throw new Error(`Expected an image but received ${mimeType} (${data.length} bytes).`);
    }
    const decoded = await loadImage(data);
    return { data, mimeType, width: decoded.width, height: decoded.height, resolvedFrom };
}

function imageUrlCandidates(url: string): string[] {
    const candidates = [url];
    if (/\.png(\?.*)?$/i.test(url)) candidates.push(url.replace(/\.png(\?.*)?$/i, ".webp$1"));
    return [...new Set(candidates)];
}

function readCachedImage(url: string): { data: Buffer; mimeType: string } | null {
    const cacheKey = sha256(url);
    const cachePath = path.join(SPRITE_CACHE_DIR, `${cacheKey}.txt`);
    if (!fs.existsSync(cachePath)) return null;
    const cached = fs.readFileSync(cachePath, "utf8");
    const match = cached.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i);
    if (!match) return null;
    return { mimeType: match[1], data: Buffer.from(match[2], "base64") };
}

async function downloadImage(url: string): Promise<{ data: Buffer; mimeType: string; width: number; height: number; resolvedFrom: string }> {
    let lastError: unknown;

    for (const candidate of imageUrlCandidates(url)) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await axios.get(candidate, {
                    responseType: "arraybuffer",
                    timeout: 45_000,
                    maxContentLength: 30 * 1024 * 1024,
                    httpsAgent,
                    headers: {
                        "User-Agent": "Creeper-Bot sprite archival backup",
                        "Accept": "image/avif,image/webp,image/png,image/jpeg,*/*"
                    }
                });
                const data = Buffer.from(response.data);
                const mimeType = String(response.headers["content-type"] || "application/octet-stream").split(";")[0];
                return decodeImage(data, mimeType, candidate);
            } catch (error: any) {
                lastError = error;
                if (error?.response?.status === 404) break;
                if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 750));
            }
        }
    }

    for (const candidate of imageUrlCandidates(url)) {
        const cached = readCachedImage(candidate);
        if (cached) return decodeImage(cached.data, cached.mimeType, `cache:${candidate}`);
    }

    throw new Error(`Failed to archive ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function fetchCurrentSourceData(): Promise<{ raw: Buffer; data: SpriteDataFile }> {
    console.log(`Fetching the current sprite dataset from ${SOURCE_PAGE}...`);
    const data = await fetchSpriteData(0);
    validateSpriteData(data);
    const raw = Buffer.from(stableSpriteDataJson(data), "utf8");
    console.log(`Fetched and validated ${data.families.flatMap(family => family.variants).length} current sprites across ${data.families.length} families.`);
    return { raw, data };
}

async function verifyArchive(archivePath: string): Promise<void> {
    const manifestPath = path.join(archivePath, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as SpriteArchiveManifest;
    const dataPath = path.join(archivePath, manifest.source.dataFile);
    const dataHash = sha256(fs.readFileSync(dataPath));
    if (dataHash !== manifest.source.dataSha256) throw new Error("Archived sprite data checksum does not match the manifest.");

    let totalBytes = 0;
    for (const asset of manifest.assets) {
        const assetPath = path.resolve(archivePath, asset.file);
        if (!assetPath.startsWith(`${path.resolve(archivePath)}${path.sep}`)) throw new Error(`Unsafe asset path in manifest: ${asset.file}`);
        const bytes = fs.readFileSync(assetPath);
        if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) {
            throw new Error(`Archived asset failed verification: ${asset.file}`);
        }
        totalBytes += bytes.length;
    }
    if (totalBytes !== manifest.totalAssetBytes) throw new Error("Archived asset byte total does not match the manifest.");
    console.log(`Verified ${manifest.season.displayName}: ${manifest.spriteCount} sprites, ${manifest.assets.length} assets, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB.`);
}

async function createArchive(): Promise<void> {
    const seasonId = validateSeasonId(argument("season-id")?.trim() || DEFAULT_SEASON_ID);
    const displayName = argument("name")?.trim() || DEFAULT_SEASON_NAME;
    const chapter = parseOptionalInteger("chapter") ?? 7;
    const season = parseOptionalInteger("season") ?? 3;
    const archiveRoot = path.resolve(argument("output") || DEFAULT_ARCHIVE_ROOT);
    const finalPath = path.join(archiveRoot, seasonId);
    const stagingPath = path.join(archiveRoot, `.${seasonId}.staging-${process.pid}`);

    if (fs.existsSync(finalPath)) {
        throw new Error(`Archive already exists at ${finalPath}. It will not be overwritten. Run with --verify to check it.`);
    }
    if (fs.existsSync(stagingPath)) fs.rmSync(stagingPath, { recursive: true, force: true });

    const source = await fetchCurrentSourceData();
    const data = source.data;
    const variants = data.families.flatMap(family => family.variants.map(variant => ({ family, variant })));
    fs.mkdirSync(path.join(stagingPath, "assets"), { recursive: true });

    try {
        console.log(`Archiving ${variants.length} latest sprites for ${displayName} to ${finalPath}...`);
        const assetRecords = await mapWithConcurrency(variants, DOWNLOAD_CONCURRENCY, async ({ family, variant }, index) => {
            const image = await downloadImage(variant.imageUrl);
            const filename = `${variant.id}-${slug(variant.name)}${extensionFor(image.mimeType, variant.imageUrl)}`;
            const relativeFile = path.posix.join("assets", filename);
            fs.writeFileSync(path.join(stagingPath, relativeFile), image.data, { flag: "wx" });
            console.log(`[${index + 1}/${variants.length}] ${variant.name} (${image.width}x${image.height})`);
            return {
                variantId: variant.id,
                familyKey: family.key,
                spriteName: variant.name,
                sourceUrl: variant.imageUrl,
                resolvedFrom: image.resolvedFrom,
                file: relativeFile,
                mimeType: image.mimeType,
                bytes: image.data.length,
                width: image.width,
                height: image.height,
                sha256: sha256(image.data)
            } as ArchiveAsset;
        });

        const assetById = new Map(assetRecords.map(asset => [asset.variantId, asset]));
        const localData: SpriteDataFile = {
            ...data,
            families: data.families.map(family => ({
                ...family,
                variants: family.variants.map(variant => ({
                    ...variant,
                    imageUrl: assetById.get(variant.id)!.file
                }))
            }))
        };
        const manifest: SpriteArchiveManifest = {
            schemaVersion: 1,
            season: { id: seasonId, displayName, ...(chapter == null ? {} : { chapter }), ...(season == null ? {} : { season }) },
            archivedAt: new Date().toISOString(),
            source: {
                page: SOURCE_PAGE,
                fetchedAt: source.data.fetchedAt,
                dataFile: "spriteData.json",
                dataSha256: sha256(source.raw)
            },
            localDataFile: "spriteData.local.json",
            familyCount: data.families.length,
            spriteCount: variants.length,
            totalAssetBytes: assetRecords.reduce((sum, asset) => sum + asset.bytes, 0),
            assets: assetRecords.sort((a, b) => a.variantId - b.variantId)
        };

        fs.writeFileSync(path.join(stagingPath, "spriteData.json"), source.raw, { flag: "wx" });
        fs.writeFileSync(path.join(stagingPath, "spriteData.local.json"), `${JSON.stringify(localData, null, 2)}\n`, { flag: "wx" });
        fs.writeFileSync(path.join(stagingPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
        fs.mkdirSync(archiveRoot, { recursive: true });
        fs.renameSync(stagingPath, finalPath);
        await verifyArchive(finalPath);
        console.log(`Immutable sprite archive created at ${finalPath}`);
    } catch (error) {
        fs.rmSync(stagingPath, { recursive: true, force: true });
        throw error;
    }
}

async function main() {
    const seasonId = validateSeasonId(argument("season-id")?.trim() || DEFAULT_SEASON_ID);
    const archiveRoot = path.resolve(argument("output") || DEFAULT_ARCHIVE_ROOT);
    if (process.argv.includes("--verify")) {
        await verifyArchive(path.join(archiveRoot, seasonId));
        return;
    }
    await createArchive();
}

main().catch(error => {
    console.error(`[SpriteArchive] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
