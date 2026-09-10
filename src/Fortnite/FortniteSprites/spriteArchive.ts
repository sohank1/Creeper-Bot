import axios from "axios";
import { createHash } from "crypto";
import * as fs from "fs";
import { loadImage } from "@napi-rs/canvas/node-canvas";
import * as path from "path";
import type { FortniteSeasonContext } from "./fortniteSeason";
import { SpriteDataFile, SpriteFamily, SpriteVariant, validateSpriteData } from "./spriteDataSource";

export type SpriteArchiveAsset = {
    variantId: number;
    familyKey: string;
    spriteName: string;
    sourceUrl: string;
    resolvedFrom: string;
    file: string;
    mimeType: string;
    bytes: number;
    sha256: string;
};

export type SpriteArchiveManifest = {
    schemaVersion: 1;
    season: {
        id: string;
        displayName: string;
        chapter?: number;
        season?: string;
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
    missingAssetCount: number;
    assets: SpriteArchiveAsset[];
};

export type ResolvedSpriteArchiveAsset = {
    buffer: Buffer;
    contentType: string;
    resolvedUrl: string;
};

export type SpriteArchiveAssetRequest = {
    family: SpriteFamily;
    variant: SpriteVariant;
};

export type SpriteArchiveResult = {
    archivePath: string;
    created: boolean;
    manifest: SpriteArchiveManifest;
};

export type SpriteArchiveOptions = {
    archiveRoot: string;
    archiveRoots?: string[];
    previousData: SpriteDataFile;
    previousJson: string;
    nextSeason: FortniteSeasonContext;
    /** Optional immutable destination key used by migration/bootstrap jobs. */
    archiveKey?: string;
    sourcePage?: string;
    assetConcurrency?: number;
    assetResolver?: (request: SpriteArchiveAssetRequest) => Promise<ResolvedSpriteArchiveAsset | null>;
    backup?: (archivePath: string, manifest: SpriteArchiveManifest) => Promise<void>;
};

export type SpriteCurrentArchiveOptions = {
    archiveRoot: string;
    archiveRoots?: string[];
    data: SpriteDataFile;
    json: string;
    /** Optional immutable destination key used by migration/bootstrap jobs. */
    archiveKey?: string;
    sourcePage?: string;
    assetConcurrency?: number;
    assetResolver?: (request: SpriteArchiveAssetRequest) => Promise<ResolvedSpriteArchiveAsset | null>;
    backup?: (archivePath: string, manifest: SpriteArchiveManifest) => Promise<void>;
};

const DEFAULT_SOURCE_PAGE = "https://fortnite.gg/sprites";
const DEFAULT_ASSET_CONCURRENCY = 2;

function sha256(value: Buffer | string): string {
    return createHash("sha256").update(value).digest("hex");
}

export function spriteArchiveSlug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 56) || "sprite";
}

function extensionFor(contentType: string, sourceUrl: string): string {
    const normalized = contentType.split(";", 1)[0].trim().toLowerCase();
    if (normalized === "image/png") return ".png";
    if (normalized === "image/jpeg") return ".jpg";
    if (normalized === "image/webp") return ".webp";

    try {
        const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
        if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) return extension === ".jpeg" ? ".jpg" : extension;
    } catch {
        // Use a stable binary extension for malformed or legacy URLs.
    }
    return ".bin";
}

function archiveVariantKey(family: SpriteFamily, variant: SpriteVariant): string {
    return `${family.key}:${variant.id}:${variant.name}:${variant.variant}`.toLowerCase();
}

function imageUrlCandidates(url: string): string[] {
    const candidates = [url];
    if (/\.png(\?.*)?$/i.test(url)) candidates.push(url.replace(/\.png(\?.*)?$/i, ".webp$1"));
    return [...new Set(candidates)];
}

function inferImageContentType(buffer: Buffer): string | null {
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

/** Fetches and decodes an image for the CLI archive path. */
export async function fetchSpriteArchiveAsset(request: SpriteArchiveAssetRequest): Promise<ResolvedSpriteArchiveAsset | null> {
    const sourceUrl = request.variant.imageUrl;
    if (!sourceUrl) return null;
    let lastError: unknown;

    for (const candidateUrl of imageUrlCandidates(sourceUrl)) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await axios.get<ArrayBuffer>(candidateUrl, {
                    responseType: "arraybuffer",
                    timeout: 45_000,
                    maxContentLength: 30 * 1024 * 1024,
                    headers: {
                        "User-Agent": "Creeper-Bot sprite archive backup",
                        Accept: "image/avif,image/webp,image/png,image/jpeg,*/*"
                    }
                });
                const buffer = Buffer.from(response.data);
                const responseContentType = String(response.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
                const contentType = responseContentType.startsWith("image/")
                    ? responseContentType
                    : inferImageContentType(buffer);
                if (!contentType?.startsWith("image/") || buffer.length === 0) {
                    throw new Error(`Expected an image but received ${contentType || "unknown content"} (${buffer.length} bytes).`);
                }
                await loadImage(buffer);
                return { buffer, contentType, resolvedUrl: candidateUrl };
            } catch (error) {
                lastError = error;
                if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 750));
            }
        }
    }

    console.warn(`[SpriteArchive] Could not freeze ${sourceUrl}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
    return null;
}

async function forEachConcurrent<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
    let nextIndex = 0;
    async function runWorker() {
        while (true) {
            const index = nextIndex++;
            if (index >= items.length) return;
            await worker(items[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, () => runWorker()));
}

function safeChildPath(root: string, relativePath: string): string {
    const resolvedRoot = path.resolve(root);
    const resolved = path.resolve(root, relativePath);
    if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error(`Unsafe archive path: ${relativePath}`);
    return resolved;
}

export async function verifySpriteArchive(archivePath: string): Promise<SpriteArchiveManifest> {
    const manifestPath = safeChildPath(archivePath, "manifest.json");
    const parsedManifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8")) as Partial<SpriteArchiveManifest>;
    if (parsedManifest.schemaVersion !== 1) throw new Error("Unsupported Fortnite sprite archive manifest schema.");
    if (!parsedManifest.season?.id || !parsedManifest.season.displayName || !parsedManifest.source?.page || !parsedManifest.source.fetchedAt || !parsedManifest.source.dataFile || !parsedManifest.source?.dataSha256) {
        throw new Error("Fortnite sprite archive manifest is missing its season or source metadata.");
    }
    if (!parsedManifest.archivedAt || !parsedManifest.localDataFile) throw new Error("Fortnite sprite archive manifest is missing its archive timestamp or local catalog file.");

    const requireNonNegativeInteger = (value: unknown, label: string, fallback?: number): number => {
        const numberValue = value === undefined && fallback !== undefined ? fallback : Number(value);
        if (!Number.isSafeInteger(numberValue) || numberValue < 0) {
            throw new Error(`Fortnite sprite archive manifest has an invalid ${label}.`);
        }
        return numberValue;
    };

    const manifest: SpriteArchiveManifest = {
        ...parsedManifest,
        schemaVersion: 1,
        season: parsedManifest.season,
        archivedAt: parsedManifest.archivedAt,
        source: parsedManifest.source,
        localDataFile: parsedManifest.localDataFile,
        familyCount: requireNonNegativeInteger(parsedManifest.familyCount, "family count"),
        spriteCount: requireNonNegativeInteger(parsedManifest.spriteCount, "sprite count"),
        totalAssetBytes: requireNonNegativeInteger(parsedManifest.totalAssetBytes, "asset byte total"),
        missingAssetCount: requireNonNegativeInteger(parsedManifest.missingAssetCount, "missing asset count", 0),
        assets: Array.isArray(parsedManifest.assets) ? parsedManifest.assets : []
    };

    if (manifest.assets.length + manifest.missingAssetCount !== manifest.spriteCount) {
        throw new Error("Fortnite sprite archive manifest asset coverage does not match its sprite count.");
    }

    const dataPath = safeChildPath(archivePath, manifest.source.dataFile);
    const sourceBuffer = await fs.promises.readFile(dataPath);
    const dataHash = sha256(sourceBuffer);
    if (dataHash !== manifest.source.dataSha256) throw new Error("Archived sprite data checksum does not match the manifest.");
    let sourceData: SpriteDataFile;
    try {
        sourceData = JSON.parse(sourceBuffer.toString("utf8")) as SpriteDataFile;
        validateSpriteData(sourceData);
    } catch (error) {
        throw new Error(`Archived sprite data is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (sourceData.seasonContext?.id && sourceData.seasonContext.id !== manifest.season.id) {
        throw new Error("Archived sprite data season does not match the manifest.");
    }

    const localDataPath = safeChildPath(archivePath, manifest.localDataFile);
    const localDataBuffer = await fs.promises.readFile(localDataPath);
    let localData: SpriteDataFile;
    try {
        localData = JSON.parse(localDataBuffer.toString("utf8")) as SpriteDataFile;
        validateSpriteData(localData);
    } catch (error) {
        throw new Error(`Archived local sprite data is invalid: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (localData.seasonContext?.id && localData.seasonContext.id !== manifest.season.id) {
        throw new Error("Archived local sprite data season does not match the manifest.");
    }
    if (localData.families.length !== manifest.familyCount || localData.families.flatMap(family => family.variants).length !== manifest.spriteCount) {
        throw new Error("Archived local sprite data counts do not match the manifest.");
    }
    const localVariantKeys = new Set(
        localData.families.flatMap(family => family.variants.map(variant => `${family.key}:${variant.id}:${variant.name}`.toLowerCase()))
    );

    let totalBytes = 0;
    const assetFiles = new Set<string>();
    const assetVariants = new Set<string>();
    for (const asset of manifest.assets) {
        if (!Number.isSafeInteger(asset.variantId) || asset.variantId < 0 || !asset.familyKey || !asset.spriteName || !asset.sourceUrl || !asset.file || !String(asset.mimeType || "").startsWith("image/")) {
            throw new Error("Fortnite sprite archive manifest contains an invalid asset entry.");
        }
        if (!Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || !/^[a-f0-9]{64}$/i.test(asset.sha256 || "")) {
            throw new Error(`Fortnite sprite archive manifest contains invalid integrity metadata for ${asset.file}.`);
        }
        if (assetFiles.has(asset.file)) throw new Error(`Fortnite sprite archive manifest contains a duplicate asset file: ${asset.file}`);
        const assetIdentity = `${asset.familyKey}:${asset.variantId}:${asset.spriteName}`.toLowerCase();
        if (assetVariants.has(assetIdentity)) throw new Error(`Fortnite sprite archive manifest contains a duplicate asset variant: ${assetIdentity}`);
        if (!localVariantKeys.has(assetIdentity)) throw new Error(`Fortnite sprite archive manifest references an unknown sprite variant: ${assetIdentity}`);
        assetFiles.add(asset.file);
        assetVariants.add(assetIdentity);
        const assetPath = safeChildPath(archivePath, asset.file);
        const bytes = await fs.promises.readFile(assetPath);
        if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256) {
            throw new Error(`Archived asset failed verification: ${asset.file}`);
        }
        totalBytes += bytes.length;
    }
    if (totalBytes !== manifest.totalAssetBytes) throw new Error("Archived asset byte total does not match the manifest.");

    const referencedAssetFiles = new Set<string>();
    for (const family of localData.families) {
        for (const variant of family.variants) {
            if (/^(?:https?:|data:)/i.test(variant.imageUrl)) continue;
            const imagePath = safeChildPath(archivePath, variant.imageUrl);
            const normalizedImagePath = variant.imageUrl.replace(/\\/g, "/");
            if (!fs.existsSync(imagePath) || !assetFiles.has(normalizedImagePath)) {
                throw new Error(`Archived local sprite data references an untracked artwork asset: ${variant.imageUrl}`);
            }
            referencedAssetFiles.add(normalizedImagePath);
        }
    }
    if (referencedAssetFiles.size !== assetFiles.size) {
        throw new Error("Fortnite sprite archive contains artwork assets that are not referenced by its local catalog.");
    }
    return manifest;
}

function archiveManifestPath(root: string, seasonId: string): string {
    return path.join(root, seasonId, "manifest.json");
}

function archiveFileName(family: SpriteFamily, variant: SpriteVariant, contentType: string, sourceUrl: string): string {
    return `${variant.id}-${spriteArchiveSlug(family.key)}-${spriteArchiveSlug(variant.variant)}-${spriteArchiveSlug(variant.name)}${extensionFor(contentType, sourceUrl)}`;
}

type SpriteArchiveBuildOptions = {
    archiveRoot: string;
    archiveRoots?: string[];
    data: SpriteDataFile;
    json: string;
    archiveKey?: string;
    sourcePage?: string;
    assetConcurrency?: number;
    assetResolver?: (request: SpriteArchiveAssetRequest) => Promise<ResolvedSpriteArchiveAsset | null>;
    backup?: (archivePath: string, manifest: SpriteArchiveManifest) => Promise<void>;
};

type ExistingSpriteArchive = {
    archivePath: string;
    manifest: SpriteArchiveManifest;
};

async function replaceArchiveDirectory(stagingPath: string, archivePath: string, replaceExisting: boolean): Promise<void> {
    if (!replaceExisting) {
        await fs.promises.rename(stagingPath, archivePath);
        return;
    }

    const displacedPath = `${archivePath}.replaced-${process.pid}-${Date.now()}`;
    await fs.promises.rename(archivePath, displacedPath);
    try {
        await fs.promises.rename(stagingPath, archivePath);
    } catch (error) {
        await fs.promises.rename(displacedPath, archivePath).catch(() => undefined);
        throw error;
    }
    await fs.promises.rm(displacedPath, { recursive: true, force: true }).catch((error) => {
        console.warn(`[SpriteArchive] Could not remove the replaced partial archive at ${displacedPath}:`, error?.message || error);
    });
}

async function archiveSpriteData(options: SpriteArchiveBuildOptions): Promise<SpriteArchiveResult> {
    const season = options.data.seasonContext;
    if (!season?.id) throw new Error("Cannot archive sprite data without a season context.");

    const archiveRoots = Array.from(new Set([options.archiveRoot, ...(options.archiveRoots || [])].map(root => path.resolve(root))));
    const seasonId = spriteArchiveSlug(season.id);
    const destinationKey = spriteArchiveSlug(options.archiveKey || season.id);
    const sourceBuffer = Buffer.from(options.json, "utf8");
    const sourceDataSha256 = sha256(sourceBuffer);
    const existingManifestPath = archiveRoots.map(root => archiveManifestPath(root, destinationKey)).find(filePath => fs.existsSync(filePath));
    let existingArchive: ExistingSpriteArchive | undefined;
    if (existingManifestPath) {
        const existingArchivePath = path.dirname(existingManifestPath);
        const manifest = await verifySpriteArchive(existingArchivePath);
        if (manifest.season.id !== season.id || manifest.source.dataSha256 !== sourceDataSha256) {
            throw new Error(`A different Fortnite sprite archive already exists at ${existingArchivePath}; refusing to overwrite it.`);
        }
        if (manifest.missingAssetCount === 0) {
            if (options.backup) await options.backup(existingArchivePath, manifest);
            return { archivePath: existingArchivePath, created: false, manifest };
        }
        existingArchive = { archivePath: existingArchivePath, manifest };
    }

    const archivePath = path.join(path.resolve(options.archiveRoot), destinationKey);
    const replacingExistingPartial = existingArchive?.archivePath === archivePath;
    if (fs.existsSync(archivePath) && !replacingExistingPartial) {
        throw new Error(`Sprite archive directory exists without a manifest: ${archivePath}`);
    }

    const stagingPath = path.join(path.dirname(archivePath), `.${destinationKey}.staging-${process.pid}-${Date.now()}`);
    const archiveData: SpriteDataFile = { ...options.data, seasonContext: season };
    validateSpriteData(archiveData);
    const variants = archiveData.families.flatMap(family => family.variants.map(variant => ({ family, variant })));
    const localImagePaths = new Map<string, string>();
    const archiveAssets: SpriteArchiveAsset[] = [];
    let missingAssetCount = 0;
    const assetResolver = options.assetResolver || fetchSpriteArchiveAsset;
    const existingAssets = new Map<string, { asset: SpriteArchiveAsset; buffer: Buffer }>();
    if (existingArchive) {
        for (const asset of existingArchive.manifest.assets) {
            try {
                existingAssets.set(
                    `${asset.familyKey}:${asset.variantId}:${asset.spriteName}`.toLowerCase(),
                    { asset, buffer: await fs.promises.readFile(safeChildPath(existingArchive.archivePath, asset.file)) }
                );
            } catch {
                // The archive was verified above, so this is only a defensive
                // fallback if the source changes during a repair.
            }
        }
    }

    try {
        await fs.promises.mkdir(path.join(stagingPath, "assets"), { recursive: true });
        await forEachConcurrent(variants, options.assetConcurrency || DEFAULT_ASSET_CONCURRENCY, async ({ family, variant }) => {
            if (!variant.imageUrl) {
                missingAssetCount++;
                return;
            }

            const existing = existingAssets.get(`${family.key}:${variant.id}:${variant.name}`.toLowerCase());
            const resolved = existing
                ? {
                    buffer: existing.buffer,
                    contentType: existing.asset.mimeType,
                    resolvedUrl: existing.asset.resolvedFrom || existing.asset.sourceUrl
                }
                : await assetResolver({ family, variant });
            if (!resolved) {
                missingAssetCount++;
                return;
            }

            const relativeFile = path.posix.join("assets", archiveFileName(family, variant, resolved.contentType, variant.imageUrl));
            await fs.promises.writeFile(safeChildPath(stagingPath, relativeFile), resolved.buffer, { flag: "wx" });
            localImagePaths.set(archiveVariantKey(family, variant), relativeFile);
            archiveAssets.push({
                variantId: variant.id,
                familyKey: family.key,
                spriteName: variant.name,
                sourceUrl: variant.imageUrl,
                resolvedFrom: resolved.resolvedUrl,
                file: relativeFile,
                mimeType: resolved.contentType,
                bytes: resolved.buffer.length,
                sha256: sha256(resolved.buffer)
            });
        });

        const localData: SpriteDataFile = {
            ...archiveData,
            families: archiveData.families.map(family => ({
                ...family,
                variants: family.variants.map(variant => ({
                    ...variant,
                    imageUrl: localImagePaths.get(archiveVariantKey(family, variant)) || variant.imageUrl
                }))
            }))
        };
        const manifest: SpriteArchiveManifest = {
            schemaVersion: 1,
            season: {
                id: season.id,
                displayName: season.displayName,
                chapter: season.chapter,
                season: season.season
            },
            archivedAt: new Date().toISOString(),
            source: {
                page: options.sourcePage || DEFAULT_SOURCE_PAGE,
                fetchedAt: archiveData.fetchedAt,
                dataFile: "spriteData.json",
                dataSha256: sourceDataSha256
            },
            localDataFile: "spriteData.local.json",
            familyCount: archiveData.families.length,
            spriteCount: variants.length,
            totalAssetBytes: archiveAssets.reduce((total, asset) => total + asset.bytes, 0),
            missingAssetCount,
            assets: archiveAssets.sort((a, b) => a.variantId - b.variantId || a.file.localeCompare(b.file))
        };

        await fs.promises.writeFile(safeChildPath(stagingPath, "spriteData.json"), sourceBuffer, { flag: "wx" });
        await fs.promises.writeFile(safeChildPath(stagingPath, "spriteData.local.json"), `${JSON.stringify(localData, null, 2)}\n`, { flag: "wx" });
        await fs.promises.writeFile(safeChildPath(stagingPath, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
        await verifySpriteArchive(stagingPath);
        await fs.promises.mkdir(path.dirname(archivePath), { recursive: true });
        await replaceArchiveDirectory(stagingPath, archivePath, replacingExistingPartial);
        if (options.backup) await options.backup(archivePath, manifest);
        return { archivePath, created: !existingArchive, manifest };
    } catch (error) {
        await fs.promises.rm(stagingPath, { recursive: true, force: true }).catch(() => { });
        throw error;
    }
}

export async function archiveSpriteSnapshot(options: SpriteArchiveOptions): Promise<SpriteArchiveResult> {
    const previousSeason = options.previousData.seasonContext;
    if (!previousSeason?.id || !options.nextSeason?.id || previousSeason.id === options.nextSeason.id) {
        throw new Error("Cannot archive a sprite snapshot without two different season contexts.");
    }

    return archiveSpriteData({
        archiveRoot: options.archiveRoot,
        archiveRoots: options.archiveRoots,
        data: { ...options.previousData, seasonContext: previousSeason },
        json: options.previousJson,
        archiveKey: options.archiveKey,
        sourcePage: options.sourcePage,
        assetConcurrency: options.assetConcurrency,
        assetResolver: options.assetResolver,
        backup: options.backup
    });
}

/**
 * Freezes a currently installed catalog for migration/bootstrap purposes.
 * The caller can give it a content-specific archiveKey so this provisional
 * snapshot never blocks the canonical end-of-season archive later.
 */
export async function archiveCurrentSpriteSnapshot(options: SpriteCurrentArchiveOptions): Promise<SpriteArchiveResult> {
    if (!options.data.seasonContext?.id) {
        throw new Error("Cannot archive the current sprite catalog without a season context.");
    }

    return archiveSpriteData(options);
}
