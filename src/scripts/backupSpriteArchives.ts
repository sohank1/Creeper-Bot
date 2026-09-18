import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { backupSpriteArchive, backupSpriteHistoryFile, getSpriteArchiveBackupStatus, spriteArchiveContentKey } from "../Fortnite/FortniteSprites/spriteArchiveBackup";
import { spriteArchiveSlug, verifySpriteArchive } from "../Fortnite/FortniteSprites/spriteArchive";
import { SPRITE_STORAGE_NAMESPACE } from "../Fortnite/FortniteSprites/spriteStorage";

const spriteCacheRoot = path.join(process.cwd(), ".cache", "fortnite-sprites", SPRITE_STORAGE_NAMESPACE);
const defaultArchiveRoot = process.env.FORTNITE_SPRITE_ARCHIVE_DIR
    ? path.resolve(process.env.FORTNITE_SPRITE_ARCHIVE_DIR)
    : path.join(spriteCacheRoot, "archives");
const archiveRoot = path.resolve(process.argv[2] || defaultArchiveRoot);

function isImmutableDestinationCollision(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("A different Fortnite sprite archive already exists")
        || message.includes("A different file already exists");
}

async function main() {
    const status = getSpriteArchiveBackupStatus();
    if (!status.linux) {
        console.log("Sprite archive backups are disabled outside Linux.");
        return;
    }
    if (!status.enabled) {
        throw new Error("Sprite archive backup is not configured. Set FORTNITE_SPRITE_ARCHIVE_BACKUP_DIR or the Backblaze B2 variables first.");
    }
    if (!fs.existsSync(archiveRoot)) {
        console.log(`No sprite archive directory exists at ${archiveRoot}.`);
    }

    const entries = fs.existsSync(archiveRoot)
        ? await fs.promises.readdir(archiveRoot, { withFileTypes: true })
        : [];
    const archiveDirectories = entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith("."))
        .sort((left, right) => left.name.localeCompare(right.name));
    if (archiveDirectories.length === 0) {
        console.log(`No sprite archives found at ${archiveRoot}.`);
    } else {
        for (const entry of archiveDirectories) {
            const archivePath = path.join(archiveRoot, entry.name);
            const manifest = await verifySpriteArchive(archivePath);
            try {
                await backupSpriteArchive(archivePath, manifest);
                console.log(`Backed up ${manifest.season.displayName} to the configured archive provider(s).`);
            } catch (error) {
                if (!isImmutableDestinationCollision(error)) throw error;

                // Legacy working trees can contain several frozen snapshots for
                // one season under different local directory names. Preserve all
                // of them instead of allowing one to overwrite another.
                const archiveKey = `${spriteArchiveSlug(manifest.season.id)}--${spriteArchiveContentKey(manifest).slice(0, 12)}`;
                await backupSpriteArchive(archivePath, manifest, { archiveKey });
                console.log(`Backed up duplicate ${manifest.season.displayName} under immutable key ${archiveKey}.`);
            }
        }
    }

    const historyPath = path.resolve(process.env.FORTNITE_SPRITE_HISTORY_PATH || path.join(archiveRoot, "spriteHistory.json"));
    if (fs.existsSync(historyPath)) {
        await backupSpriteHistoryFile(historyPath);
        console.log(`Backed up sprite history from ${historyPath}.`);
    } else {
        console.log(`No sprite history file found at ${historyPath}.`);
    }
}

main().catch(error => {
    console.error(`[SpriteArchiveBackup] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
