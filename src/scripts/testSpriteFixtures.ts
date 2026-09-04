import * as assert from "assert";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { parseFortniteGgCountdownHtml, parseFortniteGgSeasonFilter } from "../Fortnite/FortniteSprites/fortniteSeason";
import { archiveCurrentSpriteSnapshot, archiveSpriteSnapshot, verifySpriteArchive } from "../Fortnite/FortniteSprites/spriteArchive";
import { backupSpriteArchive, backupSpriteHistory, B2Request } from "../Fortnite/FortniteSprites/spriteArchiveBackup";
import { buildTrackedSpriteMessageEditPayload } from "../Fortnite/FortniteSprites/spriteMessage";
import { SPRITE_STORAGE_NAMESPACE } from "../Fortnite/FortniteSprites/spriteStorage";
import { applySpriteHistory, mergeSpriteCatalog, SpriteDataFile, stableSpriteDataJson, updateSpriteHistory, validateSpriteData } from "../Fortnite/FortniteSprites/spriteDataSource";
import { syncSpriteCatalog } from "../Fortnite/FortniteSprites/spriteSyncService";

const fixtureRoot = path.join(process.cwd(), "test", "fixtures");

function readFixture(name: string): string {
    return fs.readFileSync(path.join(fixtureRoot, name), "utf8");
}

function seasonContext(season: string, seasonKey: string) {
    return {
        id: `chapter-7-season-${season}`,
        chapter: 7,
        season,
        seasonKey,
        displayName: `Chapter 7 Season ${season}`,
        source: "fortnite-gg" as const,
        validatedBy: ["fortnite-gg" as const]
    };
}

function spriteData(season: string, fetchedAt: string, name = "Water Sprite"): SpriteDataFile {
    return {
        fetchedAt,
        totalSprites: 1,
        totalLevels: 1,
        listedVariantIds: [1],
        seasonContext: seasonContext(season, season === "4" ? "42" : "41"),
        families: [{
            key: "water",
            displayName: "Water Sprite",
            effectSummary: "Restores shields.",
            levelScaling: "Scales with level.",
            location: "The island",
            variants: [{
                id: 1,
                name,
                rarity: "rare",
                chancePercent: 10,
                chanceLabel: "10%",
                starter: false,
                variant: "Base",
                summonCost: 1,
                imageUrl: "https://fortnite.gg/img/sprite-water.png",
                effectText: "Restores shields.",
                detailStatus: "complete",
                sourceSeasonKey: season === "4" ? "42" : "41"
            }]
        }]
    };
}

async function testSeasonFixtures() {
    const countdown = parseFortniteGgCountdownHtml(readFixture("fortnite-gg-season-countdown.html"));
    assert.deepStrictEqual(countdown, {
        chapter: 7,
        season: "4",
        displayName: "Chapter 7 Season 4",
        endsAt: new Date(1893456000000).toISOString()
    });

    const selected = parseFortniteGgSeasonFilter(readFixture("fortnite-gg-sprites.html"), countdown);
    assert.deepStrictEqual(selected, { seasonKey: "42", chapter: 7, season: "4" });

    const reversedCountdown = parseFortniteGgCountdownHtml(
        readFixture("fortnite-gg-season-countdown.html").replace(
            "id=\"big-countdown\" data-target=\"1893456000\"",
            "data-target=\"1893456000\" id=\"big-countdown\""
        )
    );
    assert.strictEqual(reversedCountdown.endsAt, countdown.endsAt);

    const fallback = parseFortniteGgSeasonFilter(
        "<html><body><div class='filter-season'></div></body></html>",
        countdown,
        seasonContext("4", "42")
    );
    assert.deepStrictEqual(fallback, { seasonKey: "42", chapter: 7, season: "4" });
}

async function testRolloverOrdering() {
    const previous = spriteData("3", "2026-07-01T00:00:00.000Z");
    const latest = spriteData("4", "2026-08-01T00:00:00.000Z");
    const events: string[] = [];
    let persistedData = "";
    let persistedHistory = "";

    const result = await syncSpriteCatalog({
        existingData: previous,
        existingJson: stableSpriteDataJson(previous),
        history: { schemaVersion: 1, records: [] },
        fetchLatest: async () => latest,
        archivePrevious: async args => {
            events.push("archive");
            assert.strictEqual(args.previousData.seasonContext?.id, "chapter-7-season-3");
            assert.strictEqual(args.nextSeason.id, "chapter-7-season-4");
        },
        persistHistory: async history => {
            events.push("history");
            persistedHistory = JSON.stringify(history);
        },
        persistData: async json => {
            events.push("data");
            persistedData = json;
        }
    });

    assert.strictEqual(result.changed, true);
    assert.deepStrictEqual(events, ["archive", "data", "history"]);
    assert.ok(persistedData.includes("chapter-7-season-4"));
    assert.ok(persistedHistory.includes("chapter-7-season-4"));
}

async function testSameSeasonDoesNotRewriteForTimestamp() {
    const previous = spriteData("4", "2026-08-01T00:00:00.000Z");
    const latest = spriteData("4", "2026-08-02T00:00:00.000Z");
    const previousHistory = updateSpriteHistory({ schemaVersion: 1, records: [] }, previous);
    const persistedPrevious = applySpriteHistory(previous, previousHistory);
    let archiveCalls = 0;
    let dataWrites = 0;
    const result = await syncSpriteCatalog({
        existingData: persistedPrevious,
        existingJson: stableSpriteDataJson(persistedPrevious),
        history: previousHistory,
        fetchLatest: async () => latest,
        archivePrevious: async () => { archiveCalls++; },
        persistHistory: async () => { },
        persistData: async () => { dataWrites++; }
    });

    assert.strictEqual(result.changed, false);
    assert.strictEqual(archiveCalls, 0);
    assert.strictEqual(dataWrites, 0);
}

async function testPartialArchiveRepairsOnRetry() {
    const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "creeper-partial-sprite-archive-test-"));
    try {
        const current = spriteData("4", "2026-08-26T00:00:00.000Z");
        const json = stableSpriteDataJson(current);
        let resolverCalls = 0;
        const backup = async (_archivePath: string, manifest: { missingAssetCount: number }) => {
            if (manifest.missingAssetCount > 0) throw new Error("partial archive rejected by fixture backup");
        };
        const options = {
            archiveRoot,
            data: current,
            json,
            assetResolver: async () => {
                resolverCalls += 1;
                return resolverCalls === 1
                    ? null
                    : {
                        buffer: Buffer.from("recovered sprite"),
                        contentType: "image/png",
                        resolvedUrl: "https://fortnite.gg/img/sprite-water.png"
                    };
            },
            backup
        };

        await assert.rejects(() => archiveCurrentSpriteSnapshot(options), /partial archive rejected/);
        const repaired = await archiveCurrentSpriteSnapshot(options);
        assert.strictEqual(repaired.created, false);
        assert.strictEqual(repaired.manifest.missingAssetCount, 0);
        assert.strictEqual(resolverCalls, 2);
        await verifySpriteArchive(repaired.archivePath);
    } finally {
        fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
}

async function testCatalogMergeRejectsCrossFamilyIdCollision() {
    const previous = spriteData("3", "2026-07-01T00:00:00.000Z");
    const previousWithDifferentFamily = {
        ...previous,
        families: [{
            ...previous.families[0],
            key: "fire",
            displayName: "Fire Sprite"
        }]
    };
    const merged = mergeSpriteCatalog(previousWithDifferentFamily, spriteData("4", "2026-08-01T00:00:00.000Z"));
    validateSpriteData(merged);
    assert.deepStrictEqual(merged.families.map(family => family.key), ["water"]);
}

async function testArchiveAndBackupHook() {
    const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "creeper-sprite-archive-test-"));
    try {
        const previous = spriteData("3", "2026-07-01T00:00:00.000Z");
        let backupPath = "";
        const result = await archiveSpriteSnapshot({
            archiveRoot,
            previousData: previous,
            previousJson: stableSpriteDataJson(previous),
            nextSeason: seasonContext("4", "42"),
            assetResolver: async () => ({
                buffer: Buffer.from("frozen sprite"),
                contentType: "image/png",
                resolvedUrl: "https://fortnite.gg/img/sprite-water.png"
            }),
            backup: async archivePath => { backupPath = archivePath; }
        });

        assert.strictEqual(result.created, true);
        assert.strictEqual(backupPath, result.archivePath);
        assert.ok(fs.existsSync(path.join(result.archivePath, "manifest.json")));
        assert.strictEqual(result.manifest.missingAssetCount, 0);

        const backupKeys = [
            "FORTNITE_SPRITE_ARCHIVE_BACKUP_DIR",
            "FORTNITE_SPRITE_ARCHIVE_BACKUP_REQUIRED",
            "FORTNITE_SPRITE_ARCHIVE_B2_KEY_ID",
            "FORTNITE_SPRITE_ARCHIVE_B2_APPLICATION_KEY",
            "FORTNITE_SPRITE_ARCHIVE_B2_BUCKET",
            "FORTNITE_SPRITE_ARCHIVE_B2_BUCKET_ID",
            "FORTNITE_SPRITE_ARCHIVE_B2_PREFIX",
            "FORTNITE_SPRITE_ARCHIVE_B2_API_URL"
        ];
        const previousEnvironment = new Map(backupKeys.map(key => [key, process.env[key]]));
        const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "creeper-sprite-backup-test-"));
        try {
            for (const key of backupKeys.slice(2)) delete process.env[key];
            process.env.FORTNITE_SPRITE_ARCHIVE_BACKUP_DIR = backupRoot;
            process.env.FORTNITE_SPRITE_ARCHIVE_BACKUP_REQUIRED = "true";
            process.env.FORTNITE_SPRITE_ARCHIVE_B2_PREFIX = "prefix-only-fixture";
            await backupSpriteArchive(result.archivePath, result.manifest);
            const backedUpArchive = path.join(backupRoot, SPRITE_STORAGE_NAMESPACE, "chapter-7-season-3");
            assert.ok(fs.existsSync(path.join(backedUpArchive, "manifest.json")));
            assert.deepStrictEqual(
                JSON.parse(fs.readFileSync(path.join(backedUpArchive, "manifest.json"), "utf8")).season,
                result.manifest.season
            );

            const destinationManifestPath = path.join(backedUpArchive, "manifest.json");
            const destinationManifest = JSON.parse(fs.readFileSync(destinationManifestPath, "utf8"));
            fs.writeFileSync(destinationManifestPath, JSON.stringify({
                ...destinationManifest,
                totalAssetBytes: 0,
                missingAssetCount: 1,
                assets: []
            }));
            await assert.rejects(
                () => verifySpriteArchive(backedUpArchive),
                /asset coverage|local sprite data|asset byte total|untracked artwork/
            );
            await backupSpriteArchive(result.archivePath, result.manifest);
            await verifySpriteArchive(backedUpArchive);

            // A manifest can be internally consistent while still recording a
            // partial copy. A later complete source must repair that backup.
            const partialLocalDataPath = path.join(backedUpArchive, "spriteData.local.json");
            const partialLocalData = JSON.parse(fs.readFileSync(partialLocalDataPath, "utf8"));
            partialLocalData.families[0].variants[0].imageUrl = result.manifest.assets[0].sourceUrl;
            fs.writeFileSync(partialLocalDataPath, `${JSON.stringify(partialLocalData, null, 2)}\n`);
            const validPartialManifest = {
                ...result.manifest,
                missingAssetCount: 1,
                totalAssetBytes: 0,
                assets: []
            };
            fs.writeFileSync(destinationManifestPath, `${JSON.stringify(validPartialManifest, null, 2)}\n`);
            await verifySpriteArchive(backedUpArchive);
            await backupSpriteArchive(result.archivePath, result.manifest);
            await verifySpriteArchive(backedUpArchive);

            // Reusing the configured backup directory as the archive source is
            // safe during disaster recovery and should not trip the overlap
            // guard when it is already the verified destination.
            process.env.FORTNITE_SPRITE_ARCHIVE_BACKUP_DIR = path.dirname(result.archivePath);
            await backupSpriteArchive(result.archivePath, result.manifest);
            delete process.env.FORTNITE_SPRITE_ARCHIVE_BACKUP_DIR;
            process.env.FORTNITE_SPRITE_ARCHIVE_B2_KEY_ID = "fixture-key-id";
            process.env.FORTNITE_SPRITE_ARCHIVE_B2_APPLICATION_KEY = "fixture-application-key";
            process.env.FORTNITE_SPRITE_ARCHIVE_B2_BUCKET = "fixture-sprite-archives";
            process.env.FORTNITE_SPRITE_ARCHIVE_B2_PREFIX = "creeper-bot/fortnite-sprite-archives";
            const b2ArchiveRoot = [
                process.env.FORTNITE_SPRITE_ARCHIVE_B2_PREFIX,
                SPRITE_STORAGE_NAMESPACE,
                "chapter-7-season-3"
            ].join("/");

            const remoteFiles = new Map<string, { bytes: Buffer; sha1: string }>();
            const uploadedNames: string[] = [];
            const b2Request: B2Request = async options => {
                if (options.url.endsWith("/b2_authorize_account")) {
                    return {
                        status: 200,
                        data: {
                            accountId: "fixture-account",
                            authorizationToken: "fixture-account-token",
                            apiInfo: { storageApi: { apiUrl: "https://fixture-b2-api.example" } }
                        }
                    };
                }
                if (options.url.endsWith("/b2_list_buckets")) {
                    return {
                        status: 200,
                        data: { buckets: [{ bucketId: "fixture-bucket-id", bucketName: "fixture-sprite-archives" }] }
                    };
                }
                if (options.url.endsWith("/b2_list_file_names")) {
                    const prefix = String(options.params?.prefix || "");
                    return {
                        status: 200,
                        data: {
                            files: Array.from(remoteFiles.entries())
                                .filter(([fileName]) => fileName.startsWith(prefix))
                                .sort(([left], [right]) => left.localeCompare(right))
                                .map(([fileName, file]) => ({
                                    fileName,
                                    contentLength: file.bytes.length,
                                    contentSha1: file.sha1,
                                    action: "upload"
                                }))
                        }
                    };
                }
                if (options.url.endsWith("/b2_get_upload_url")) {
                    return {
                        status: 200,
                        data: { uploadUrl: "https://fixture-b2-upload.example", authorizationToken: "fixture-upload-token" }
                    };
                }
                if (options.url === "https://fixture-b2-upload.example") {
                    const fileName = decodeURIComponent(String(options.headers?.["X-Bz-File-Name"] || ""));
                    const bytes = Buffer.from(options.data as Buffer);
                    remoteFiles.set(fileName, {
                        bytes,
                        sha1: String(options.headers?.["X-Bz-Content-Sha1"] || "")
                    });
                    uploadedNames.push(fileName);
                    return { status: 200, data: { fileName } };
                }
                throw new Error(`Unexpected B2 fixture request: ${options.method} ${options.url}`);
            };

            await backupSpriteArchive(result.archivePath, result.manifest, { b2Request });
            assert.strictEqual(uploadedNames[uploadedNames.length - 1].endsWith("/manifest.json"), true);
            const uploadCount = uploadedNames.length;
            assert.ok(uploadCount > 0);
            const missingRemoteAsset = `${b2ArchiveRoot}/${result.manifest.assets[0].file}`;
            remoteFiles.delete(missingRemoteAsset);
            await backupSpriteArchive(result.archivePath, result.manifest, { b2Request });
            assert.ok(uploadedNames.length > uploadCount);
            const repairedUploadCount = uploadedNames.length;
            await backupSpriteArchive(result.archivePath, result.manifest, { b2Request });
            assert.strictEqual(uploadedNames.length, repairedUploadCount);

            // Repair the case where the previous run published a partial
            // manifest before the source catalog was fully frozen.
            const remoteManifestName = `${b2ArchiveRoot}/manifest.json`;
            const partialRemoteManifest = JSON.parse(remoteFiles.get(remoteManifestName)!.bytes.toString("utf8"));
            partialRemoteManifest.archivedAt = "2026-08-26T00:00:00.000Z";
            partialRemoteManifest.missingAssetCount = 1;
            partialRemoteManifest.totalAssetBytes = 0;
            partialRemoteManifest.assets = [];
            const partialRemoteManifestBytes = Buffer.from(`${JSON.stringify(partialRemoteManifest, null, 2)}\n`);
            remoteFiles.set(remoteManifestName, {
                bytes: partialRemoteManifestBytes,
                sha1: createHash("sha1").update(partialRemoteManifestBytes).digest("hex")
            });
            remoteFiles.delete(missingRemoteAsset);
            await backupSpriteArchive(result.archivePath, result.manifest, { b2Request });
            assert.strictEqual(
                JSON.parse(remoteFiles.get(remoteManifestName)!.bytes.toString("utf8")).missingAssetCount,
                0
            );

            await backupSpriteArchive(result.archivePath, result.manifest, {
                b2Request,
                archiveKey: "chapter-7-season-3--fixture-duplicate"
            });
            assert.ok(Array.from(remoteFiles.keys()).some(fileName => fileName.includes(`${SPRITE_STORAGE_NAMESPACE}/chapter-7-season-3--fixture-duplicate/manifest.json`)));

            await backupSpriteHistory({ schemaVersion: 1, records: [] }, { b2Request });
            const historyUploadCount = uploadedNames.length;
            assert.ok(Array.from(remoteFiles.keys()).some(fileName => fileName.endsWith("/spriteHistory.json")));
            await backupSpriteHistory({ schemaVersion: 1, records: [] }, { b2Request });
            assert.strictEqual(uploadedNames.length, historyUploadCount);
        } finally {
            for (const [key, value] of previousEnvironment) {
                if (value == null) delete process.env[key];
                else process.env[key] = value;
            }
            fs.rmSync(backupRoot, { recursive: true, force: true });
        }
    } finally {
        fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
}

async function testCurrentBootstrapArchive() {
    const archiveRoot = fs.mkdtempSync(path.join(os.tmpdir(), "creeper-current-sprite-archive-test-"));
    try {
        const current = spriteData("4", "2026-08-26T00:00:00.000Z");
        const json = stableSpriteDataJson(current);
        let backupCalls = 0;
        const options = {
            archiveRoot,
            data: current,
            json,
            archiveKey: "chapter-7-season-4--bootstrap-fixture",
            assetResolver: async () => ({
                buffer: Buffer.from("frozen current sprite"),
                contentType: "image/png",
                resolvedUrl: "https://fortnite.gg/img/sprite-water.png"
            }),
            backup: async () => { backupCalls++; }
        };

        const first = await archiveCurrentSpriteSnapshot(options);
        assert.strictEqual(first.created, true);
        assert.strictEqual(first.manifest.season.id, "chapter-7-season-4");
        assert.strictEqual(first.manifest.missingAssetCount, 0);
        assert.ok(first.archivePath.endsWith("chapter-7-season-4-bootstrap-fixture"));

        const second = await archiveCurrentSpriteSnapshot(options);
        assert.strictEqual(second.created, false);
        assert.strictEqual(second.archivePath, first.archivePath);
        assert.strictEqual(backupCalls, 2);
    } finally {
        fs.rmSync(archiveRoot, { recursive: true, force: true });
    }
}

async function testTrackedMessageRefreshPayload() {
    const visualResponse = buildTrackedSpriteMessageEditPayload({
        content: "Sprite fetch in progress",
        embeds: [{}],
        files: [{}],
        components: []
    });
    assert.strictEqual(visualResponse.content, "");
    assert.deepStrictEqual(visualResponse.attachments, []);

    const textResponse = buildTrackedSpriteMessageEditPayload({
        content: "Sprite family not found.",
        components: []
    });
    assert.strictEqual(textResponse.content, "Sprite family not found.");
    assert.deepStrictEqual(textResponse.attachments, []);

    const emptyResponse = buildTrackedSpriteMessageEditPayload({ content: "", components: [] });
    assert.ok(typeof emptyResponse.content === "string" && emptyResponse.content.length > 0);
}

async function main() {
    await testSeasonFixtures();
    await testRolloverOrdering();
    await testSameSeasonDoesNotRewriteForTimestamp();
    await testPartialArchiveRepairsOnRetry();
    await testCatalogMergeRejectsCrossFamilyIdCollision();
    await testArchiveAndBackupHook();
    await testCurrentBootstrapArchive();
    await testTrackedMessageRefreshPayload();
    console.log("Sprite fixture tests passed.");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
