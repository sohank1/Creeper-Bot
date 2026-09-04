import "dotenv/config";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
    archiveCurrentSpriteSnapshot,
    fetchSpriteArchiveAsset,
    ResolvedSpriteArchiveAsset,
    SpriteArchiveAssetRequest,
    spriteArchiveSlug
} from "../Fortnite/FortniteSprites/spriteArchive";
import { SpriteDataFile, spriteDataContentFingerprint, validateSpriteData } from "../Fortnite/FortniteSprites/spriteDataSource";
import { backupSpriteArchive } from "../Fortnite/FortniteSprites/spriteArchiveBackup";
import { SPRITE_STORAGE_NAMESPACE } from "../Fortnite/FortniteSprites/spriteStorage";

const productionLinux = process.platform === "linux" && process.env.NODE_ENV === "production";
const spriteCacheRoot = path.join(process.cwd(), ".cache", "fortnite-sprites", SPRITE_STORAGE_NAMESPACE);
const dataPath = path.resolve(process.env.FORTNITE_SPRITE_DATA_PATH || (
    productionLinux
        ? path.join(spriteCacheRoot, "spriteData.json")
        : path.join(process.cwd(), "src", "Fortnite", "FortniteSprites", "spriteData.json")
));
const archiveRoot = path.resolve(process.env.FORTNITE_SPRITE_ARCHIVE_DIR || (
    path.join(spriteCacheRoot, "archives")
));
const assetCacheRoot = path.resolve(process.env.FORTNITE_SPRITE_ASSET_CACHE_DIR || path.join(spriteCacheRoot, "assets"));
const assetCacheVersion = process.env.FORTNITE_SPRITE_ASSET_CACHE_VERSION || "v4-binary-assets";

type SpriteAssetDiskEntry = {
    contentType?: string;
    contentSha256?: string;
    resolvedUrl?: string;
};

type SpriteAssetDiskManifest = {
    dataFingerprint?: string;
    assets?: Record<string, SpriteAssetDiskEntry>;
};

type CachedAsset = {
    dataFingerprint: string;
    metadata: SpriteAssetDiskEntry;
};

// The runtime currently uses SHA-1 namespaces while the source-data helper
// uses SHA-256 fingerprints. Accept both formats, but require the manifest to
// agree with its directory name before reading any cached bytes.
const DATA_FINGERPRINT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

function sha256(buffer: Buffer): string {
    return createHash("sha256").update(buffer).digest("hex");
}

function spriteAssetCacheFile(dataFingerprint: string, imageUrl: string): string {
    const cacheKey = createHash("sha1")
        .update(`${assetCacheVersion}:${dataFingerprint}:${imageUrl}`)
        .digest("hex");
    return path.join(assetCacheRoot, dataFingerprint, `${cacheKey}.bin`);
}

function inferContentType(buffer: Buffer): string | null {
    if (
        buffer.length >= 8
        && buffer[0] === 0x89
        && buffer[1] === 0x50
        && buffer[2] === 0x4e
        && buffer[3] === 0x47
    ) return "image/png";
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    return null;
}

async function readCachedAssets(preferredFingerprint: string): Promise<Map<string, CachedAsset[]>> {
    const byUrl = new Map<string, CachedAsset[]>();
    if (!fs.existsSync(assetCacheRoot)) return byUrl;

    for (const entry of await fs.promises.readdir(assetCacheRoot, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!DATA_FINGERPRINT_PATTERN.test(entry.name)) continue;
        const manifestPath = path.join(assetCacheRoot, entry.name, "manifest.json");
        try {
            const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as SpriteAssetDiskManifest;
            const dataFingerprint = String(manifest.dataFingerprint || "");
            if (dataFingerprint !== entry.name || !DATA_FINGERPRINT_PATTERN.test(dataFingerprint)) continue;
            for (const [imageUrl, metadata] of Object.entries(manifest.assets || {})) {
                const candidates = byUrl.get(imageUrl) || [];
                candidates.push({ dataFingerprint, metadata });
                byUrl.set(imageUrl, candidates);
            }
        } catch {
            // An incomplete artwork cache is recoverable through the source URL.
        }
    }
    for (const candidates of byUrl.values()) {
        candidates.sort((left, right) => {
            if (left.dataFingerprint === preferredFingerprint) return -1;
            if (right.dataFingerprint === preferredFingerprint) return 1;
            return right.dataFingerprint.localeCompare(left.dataFingerprint);
        });
    }
    return byUrl;
}

function cachedAssetResolver(cachedAssets: Map<string, CachedAsset[]>) {
    return async ({ family, variant }: SpriteArchiveAssetRequest): Promise<ResolvedSpriteArchiveAsset | null> => {
        const imageUrl = variant.imageUrl;
        if (!imageUrl) return null;

        for (const candidate of cachedAssets.get(imageUrl) || []) {
            try {
                const buffer = await fs.promises.readFile(spriteAssetCacheFile(candidate.dataFingerprint, imageUrl));
                if (buffer.length === 0) continue;
                if (candidate.metadata.contentSha256 && sha256(buffer) !== candidate.metadata.contentSha256) continue;
                const contentType = String(candidate.metadata.contentType || inferContentType(buffer) || "").split(";", 1)[0].trim();
                if (!contentType.startsWith("image/")) continue;
                return {
                    buffer,
                    contentType,
                    resolvedUrl: candidate.metadata.resolvedUrl || imageUrl
                };
            } catch {
                // Try another cache namespace, then fall back to Fortnite.GG.
            }
        }

        return fetchSpriteArchiveAsset({ family, variant });
    };
}

async function main(): Promise<void> {
    if (process.platform !== "linux") {
        console.log("Current sprite snapshot archiving is disabled outside Linux.");
        return;
    }
    if (!fs.existsSync(dataPath)) throw new Error(`Sprite data file does not exist at ${dataPath}.`);

    const json = await fs.promises.readFile(dataPath, "utf8");
    const data = JSON.parse(json) as SpriteDataFile;
    validateSpriteData(data);
    if (!data.seasonContext?.id) throw new Error("Current sprite data has no season context.");

    const fingerprint = spriteDataContentFingerprint(data);
    const defaultArchiveKey = `${spriteArchiveSlug(data.seasonContext.id)}--bootstrap-${fingerprint.slice(0, 12)}`;
    const archiveKey = process.env.FORTNITE_SPRITE_ARCHIVE_CURRENT_KEY || defaultArchiveKey;
    const cachedAssets = await readCachedAssets(fingerprint);
    const result = await archiveCurrentSpriteSnapshot({
        archiveRoot,
        data,
        json,
        archiveKey,
        assetConcurrency: Number(process.env.FORTNITE_SPRITE_ARCHIVE_ASSET_CONCURRENCY || 4),
        assetResolver: cachedAssetResolver(cachedAssets),
        backup: backupSpriteArchive
    });

    console.log(
        `[SpriteArchive] ${result.created ? "Seeded" : "Verified"} ${result.manifest.season.displayName} `
        + `at ${result.archivePath}: ${result.manifest.spriteCount - result.manifest.missingAssetCount}/`
        + `${result.manifest.spriteCount} artwork assets frozen.`
    );
}

main().catch(error => {
    console.error(`[SpriteArchiveSeed] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
