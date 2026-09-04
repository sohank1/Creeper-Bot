import axios from "axios";
import { createHash } from "crypto";
import * as fs from "fs";
import * as path from "path";
import type { SpriteArchiveManifest } from "./spriteArchive";
import { spriteArchiveSlug, verifySpriteArchive } from "./spriteArchive";
import type { SpriteHistoryFile } from "./spriteDataSource";
import { SPRITE_STORAGE_NAMESPACE } from "./spriteStorage";

export type B2RequestOptions = {
    method: "get" | "post";
    url: string;
    auth?: {
        username: string;
        password: string;
    };
    headers?: Record<string, string>;
    params?: Record<string, string | number>;
    data?: unknown;
    responseType?: "arraybuffer" | "json";
    maxContentLength?: number;
    maxBodyLength?: number;
};

export type B2Response = {
    data: any;
    status: number;
};

export type B2Request = (options: B2RequestOptions) => Promise<B2Response>;

type BackupStatus = {
    enabled: boolean;
    required: boolean;
    linux: boolean;
    target: string | null;
    backblazeB2: {
        enabled: boolean;
        target: string | null;
        missing: string[];
    };
};

type B2Config = {
    keyId: string;
    applicationKey: string;
    bucketName: string;
    bucketId: string;
    prefix: string;
    apiUrl: string;
};

type B2ConfigInspection = {
    config: B2Config | null;
    missing: string[];
};

type B2Authorization = {
    accountId: string;
    authorizationToken: string;
    apiInfo?: {
        storageApi?: {
            apiUrl?: string;
        };
    };
};

type B2Bucket = {
    bucketId: string;
    bucketName: string;
};

type B2UploadSession = {
    uploadUrl: string;
    authorizationToken: string;
};

type B2RemoteFile = {
    fileName: string;
    contentLength: number;
    contentSha1: string;
    fileId?: string;
    action?: string;
};

type LocalArchiveFile = {
    relativePath: string;
    buffer: Buffer;
    sha1: string;
};

export type SpriteArchiveBackupOptions = {
    /** Replaces the HTTP client in fixture tests; production uses axios. */
    b2Request?: B2Request;
    /** Optional migration-only destination key for duplicate legacy snapshots. */
    archiveKey?: string;
};

const BACKUP_DIR_ENV = "FORTNITE_SPRITE_ARCHIVE_BACKUP_DIR";
const BACKUP_REQUIRED_ENV = "FORTNITE_SPRITE_ARCHIVE_BACKUP_REQUIRED";
const B2_KEY_ID_ENV = "FORTNITE_SPRITE_ARCHIVE_B2_KEY_ID";
const B2_APPLICATION_KEY_ENV = "FORTNITE_SPRITE_ARCHIVE_B2_APPLICATION_KEY";
const B2_BUCKET_ENV = "FORTNITE_SPRITE_ARCHIVE_B2_BUCKET";
const B2_BUCKET_ID_ENV = "FORTNITE_SPRITE_ARCHIVE_B2_BUCKET_ID";
const B2_PREFIX_ENV = "FORTNITE_SPRITE_ARCHIVE_B2_PREFIX";
const B2_API_URL_ENV = "FORTNITE_SPRITE_ARCHIVE_B2_API_URL";
const DEFAULT_B2_API_URL = "https://api.backblazeb2.com";
const B2_API_VERSION = "v4";
const B2_LIST_FILE_LIMIT = 1000;
const B2_MAX_FILE_BYTES = 32 * 1024 * 1024;

let warnedAboutIncompleteB2Configuration = false;

function isTruthy(value: string | undefined): boolean {
    return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function readEnv(name: string): string {
    return process.env[name]?.trim() || "";
}

function configuredBackupDir(): string | null {
    const value = readEnv(BACKUP_DIR_ENV);
    return value ? path.join(path.resolve(value), SPRITE_STORAGE_NAMESPACE) : null;
}

function normalizeB2Prefix(value: string): string {
    const prefix = value.trim().replace(/^\/+|\/+$/g, "");
    if (!prefix) return "";
    if (prefix.split("/").some(part => !part || part === "." || part === "..")) {
        throw new Error(`${B2_PREFIX_ENV} must be a relative object prefix.`);
    }
    return prefix;
}

function normalizeArchiveKey(value: string): string {
    const key = value.trim();
    if (!key || key === "." || key === ".." || key.includes("/") || key.includes("\\")) {
        throw new Error("Sprite archive backup key must be a single relative path segment.");
    }
    return key;
}

export function spriteArchiveContentKey(manifest: SpriteArchiveManifest): string {
    const identity = JSON.stringify({
        sourceDataSha256: manifest.source.dataSha256,
        missingAssetCount: manifest.missingAssetCount,
        assets: (manifest.assets || []).map(asset => ({
            file: asset.file,
            bytes: asset.bytes,
            sha256: asset.sha256
        }))
    });
    return createHash("sha256").update(identity).digest("hex");
}

function inspectB2Configuration(): B2ConfigInspection {
    const keyId = readEnv(B2_KEY_ID_ENV);
    const applicationKey = readEnv(B2_APPLICATION_KEY_ENV);
    const bucketName = readEnv(B2_BUCKET_ENV);
    const bucketId = readEnv(B2_BUCKET_ID_ENV);
    const prefix = readEnv(B2_PREFIX_ENV);
    const apiUrl = readEnv(B2_API_URL_ENV) || DEFAULT_B2_API_URL;
    // A default object prefix or endpoint is harmless configuration. Only
    // credentials/bucket settings opt into B2; otherwise a filesystem-only
    // deployment must not fail because the example prefix is present.
    const anyConfigured = !!(keyId || applicationKey || bucketName || bucketId);
    if (!anyConfigured) return { config: null, missing: [] };

    const missing: string[] = [];
    if (!keyId) missing.push(B2_KEY_ID_ENV);
    if (!applicationKey) missing.push(B2_APPLICATION_KEY_ENV);
    if (!bucketName) missing.push(B2_BUCKET_ENV);
    if (missing.length > 0) return { config: null, missing };

    return {
        config: {
            keyId,
            applicationKey,
            bucketName,
            bucketId,
            prefix: normalizeB2Prefix(prefix),
            apiUrl: apiUrl.replace(/\/+$/, "")
        },
        missing: []
    };
}

export function getSpriteArchiveBackupStatus(): BackupStatus {
    const target = configuredBackupDir();
    const b2 = inspectB2Configuration();
    const linux = process.platform === "linux";
    const b2Target = b2.config
        ? `b2://${b2.config.bucketName}/${[b2.config.prefix, SPRITE_STORAGE_NAMESPACE].filter(Boolean).join("/")}/`
        : null;
    return {
        enabled: linux && (!!target || !!b2.config),
        required: isTruthy(process.env[BACKUP_REQUIRED_ENV]),
        linux,
        target,
        backblazeB2: {
            enabled: linux && !!b2.config,
            target: b2Target,
            missing: b2.missing
        }
    };
}

type BackupProviders = {
    filesystemRoot: string | null;
    b2: B2Config | null;
};

function getBackupProviders(): BackupProviders {
    const filesystemRoot = configuredBackupDir();
    const b2 = inspectB2Configuration();
    const required = isTruthy(process.env[BACKUP_REQUIRED_ENV]);

    if (b2.missing.length > 0) {
        if (required) {
            throw new Error(`Backblaze B2 sprite backup configuration is incomplete. Set: ${b2.missing.join(", ")}.`);
        }
        if (!warnedAboutIncompleteB2Configuration) {
            warnedAboutIncompleteB2Configuration = true;
            console.warn(`[SpriteArchive] Ignoring incomplete Backblaze B2 configuration; missing ${b2.missing.join(", ")}.`);
        }
    }

    if (!filesystemRoot && !b2.config && required) {
        throw new Error(`Sprite archive backup is required but no backup provider is configured. Set ${BACKUP_DIR_ENV} or the Backblaze B2 variables.`);
    }

    return {
        filesystemRoot,
        b2: b2.config
    };
}

export function getSpriteArchiveBackupDirectory(): string | null {
    return configuredBackupDir();
}

async function copyTree(source: string, destination: string): Promise<void> {
    await fs.promises.mkdir(destination, { recursive: true });
    const entries = await fs.promises.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path.join(source, entry.name);
        const destinationPath = path.join(destination, entry.name);
        if (entry.isDirectory()) {
            await copyTree(sourcePath, destinationPath);
        } else if (entry.isFile()) {
            await fs.promises.copyFile(sourcePath, destinationPath);
        } else {
            throw new Error(`Unsupported file in Fortnite sprite archive: ${sourcePath}`);
        }
    }
}

/**
 * Copies a verified immutable season archive to a Linux filesystem path.
 * The destination is expected to be a bind-mounted VPS directory when the
 * bot runs in Docker. Existing valid archives are left untouched.
 */
async function backupSpriteArchiveToFilesystem(
    archivePath: string,
    manifest: SpriteArchiveManifest,
    backupRoot: string,
    archiveKey?: string
): Promise<void> {
    const sourcePath = path.resolve(archivePath);
    const verifiedSource = await verifySpriteArchive(sourcePath);
    if (verifiedSource.season.id !== manifest.season.id) {
        throw new Error("Fortnite sprite archive manifest does not match the archive being backed up.");
    }

    const seasonId = spriteArchiveSlug(verifiedSource.season.id);
    const destinationKey = archiveKey ? normalizeArchiveKey(archiveKey) : seasonId;
    const destinationPath = path.resolve(backupRoot, destinationKey);
    if (
        sourcePath === destinationPath
        || sourcePath.startsWith(`${destinationPath}${path.sep}`)
        || destinationPath.startsWith(`${sourcePath}${path.sep}`)
    ) {
        if (sourcePath === destinationPath) return;
        throw new Error(`Fortnite sprite archive backup path must be separate from the source archive: ${destinationPath}`);
    }

    let replaceExisting = false;
    if (fs.existsSync(destinationPath)) {
        try {
            const existing = await verifySpriteArchive(destinationPath);
            if (existing.season.id !== verifiedSource.season.id || existing.source.dataSha256 !== verifiedSource.source.dataSha256) {
                throw new Error(`A different Fortnite sprite archive already exists at ${destinationPath}; refusing to overwrite it.`);
            }
            if (existing.missingAssetCount === 0) {
                if (spriteArchiveContentKey(existing) !== spriteArchiveContentKey(verifiedSource)) {
                    throw new Error(`A different Fortnite sprite archive already exists at ${destinationPath}; refusing to overwrite it.`);
                }
                return;
            }
            replaceExisting = true;
            console.warn(`[SpriteArchive] Repairing incomplete filesystem backup at ${destinationPath}.`);
        } catch (error) {
            // A crashed copy can leave a same-identity destination without all
            // files. It is safe to repair that destination from the verified
            // source, but an unreadable/different manifest remains a collision.
            try {
                const existingManifest = JSON.parse(await fs.promises.readFile(path.join(destinationPath, "manifest.json"), "utf8")) as Partial<SpriteArchiveManifest>;
                if (existingManifest.season?.id !== verifiedSource.season.id || existingManifest.source?.dataSha256 !== verifiedSource.source.dataSha256) {
                    throw new Error(`A different Fortnite sprite archive already exists at ${destinationPath}; refusing to overwrite it.`);
                }
                replaceExisting = true;
                console.warn(`[SpriteArchive] Repairing incomplete filesystem backup at ${destinationPath}.`);
            } catch (identityError) {
                if (identityError instanceof Error && identityError.message.includes("A different Fortnite sprite archive already exists")) throw identityError;
                throw error;
            }
        }
    }

    const stagingPath = path.join(backupRoot, `.${destinationKey}.staging-${process.pid}-${Date.now()}`);
    try {
        await fs.promises.mkdir(backupRoot, { recursive: true });
        await copyTree(sourcePath, stagingPath);
        await verifySpriteArchive(stagingPath);
        if (replaceExisting) {
            const displacedPath = `${destinationPath}.replaced-${process.pid}-${Date.now()}`;
            await fs.promises.rename(destinationPath, displacedPath);
            try {
                await fs.promises.rename(stagingPath, destinationPath);
            } catch (error) {
                await fs.promises.rename(displacedPath, destinationPath).catch(() => undefined);
                throw error;
            }
            await fs.promises.rm(displacedPath, { recursive: true, force: true }).catch((error) => {
                console.warn(`[SpriteArchive] Could not remove the replaced filesystem backup at ${displacedPath}:`, error?.message || error);
            });
        } else {
            await fs.promises.rename(stagingPath, destinationPath);
        }
        console.log(`[SpriteArchive] Filesystem backup created for ${verifiedSource.season.displayName} at ${destinationPath}.`);
    } catch (error) {
        await fs.promises.rm(stagingPath, { recursive: true, force: true }).catch(() => undefined);
        throw error;
    }
}

const defaultB2Request: B2Request = async options => {
    const response = await axios.request({
        ...options,
        validateStatus: () => true
    } as any);
    return {
        data: response.data,
        status: response.status
    };
};

class B2RequestError extends Error {
    public readonly status: number;
    public readonly code: string;

    constructor(message: string, status = 0, code = "") {
        super(message);
        this.name = "B2RequestError";
        this.status = status;
        this.code = code;
    }
}

function responseErrorDetails(response: any): { status: number; code: string; message: string } {
    const status = Number(response?.status || 0);
    const data = response?.data;
    const code = typeof data?.code === "string" ? data.code : "";
    const message = typeof data?.message === "string"
        ? data.message
        : typeof data === "string"
            ? data
            : "request was rejected";
    return { status, code, message };
}

async function callB2<T>(request: B2Request, options: B2RequestOptions, operation: string): Promise<T> {
    let response: B2Response;
    try {
        response = await request(options);
    } catch (error) {
        if (error instanceof B2RequestError) throw error;
        const details = responseErrorDetails((error as any)?.response);
        const message = details.status || details.message !== "request was rejected"
            ? details.message
            : error instanceof Error ? error.message : String(error);
        throw new B2RequestError(`Backblaze B2 ${operation} failed: ${message}`, details.status, details.code);
    }

    if (response.status >= 400) {
        const details = responseErrorDetails(response);
        throw new B2RequestError(`Backblaze B2 ${operation} failed: ${details.message}`, details.status, details.code);
    }
    return response.data as T;
}

function b2Endpoint(apiUrl: string, operation: string): string {
    return `${apiUrl}/b2api/${B2_API_VERSION}/${operation}`;
}

async function authorizeB2(config: B2Config, request: B2Request): Promise<{ authorization: B2Authorization; apiUrl: string }> {
    const authorization = await callB2<B2Authorization>(request, {
        method: "get",
        url: b2Endpoint(config.apiUrl, "b2_authorize_account"),
        auth: {
            username: config.keyId,
            password: config.applicationKey
        }
    }, "authorization");
    const apiUrl = String(authorization?.apiInfo?.storageApi?.apiUrl || config.apiUrl).replace(/\/+$/, "");
    if (!authorization?.accountId || !authorization.authorizationToken) {
        throw new Error("Backblaze B2 authorization returned no account or authorization token.");
    }
    return { authorization, apiUrl };
}

async function resolveB2Bucket(
    config: B2Config,
    authorization: B2Authorization,
    apiUrl: string,
    request: B2Request
): Promise<B2Bucket> {
    if (config.bucketId) {
        return { bucketId: config.bucketId, bucketName: config.bucketName };
    }

    const result = await callB2<{ buckets?: B2Bucket[] }>(request, {
        method: "post",
        url: b2Endpoint(apiUrl, "b2_list_buckets"),
        headers: { Authorization: authorization.authorizationToken },
        data: {
            accountId: authorization.accountId,
            bucketName: config.bucketName
        }
    }, "bucket lookup");
    const bucket = (result.buckets || []).find(candidate => candidate.bucketName === config.bucketName);
    if (!bucket?.bucketId) {
        throw new Error(`Backblaze B2 bucket ${config.bucketName} was not found or is not visible to this key.`);
    }
    return bucket;
}

async function listB2Files(
    authorization: B2Authorization,
    apiUrl: string,
    bucketId: string,
    prefix: string,
    request: B2Request
): Promise<Map<string, B2RemoteFile>> {
    const files = new Map<string, B2RemoteFile>();
    let startFileName = "";
    while (true) {
        const params: Record<string, string | number> = {
            bucketId,
            prefix,
            maxFileCount: B2_LIST_FILE_LIMIT
        };
        if (startFileName) params.startFileName = startFileName;
        const result = await callB2<{ files?: B2RemoteFile[]; nextFileName?: string }>(request, {
            method: "get",
            url: b2Endpoint(apiUrl, "b2_list_file_names"),
            headers: { Authorization: authorization.authorizationToken },
            params
        }, "archive listing");

        for (const file of result.files || []) {
            if (file?.fileName && (file.action === "upload" || !file.action)) files.set(file.fileName, file);
        }
        const next = String(result.nextFileName || "");
        if (!next || next === startFileName) break;
        startFileName = next;
    }
    return files;
}

async function collectLocalArchiveFiles(root: string, current = root, output = new Map<string, LocalArchiveFile>()): Promise<Map<string, LocalArchiveFile>> {
    const entries = await fs.promises.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
        const absolutePath = path.join(current, entry.name);
        if (entry.isDirectory()) {
            await collectLocalArchiveFiles(root, absolutePath, output);
            continue;
        }
        if (!entry.isFile()) throw new Error(`Unsupported file in Fortnite sprite archive: ${absolutePath}`);
        const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
        const buffer = await fs.promises.readFile(absolutePath);
        output.set(relativePath, {
            relativePath,
            buffer,
            sha1: createHash("sha1").update(buffer).digest("hex")
        });
    }
    return output;
}

function localFilesMatchRemote(local: LocalArchiveFile, remote: B2RemoteFile): boolean {
    return Number(remote.contentLength) === local.buffer.length
        && String(remote.contentSha1 || "").toLowerCase() === local.sha1;
}

function remoteRelativePath(objectPrefix: string, fileName: string): string | null {
    const prefix = `${objectPrefix}/`;
    return fileName.startsWith(prefix) ? fileName.slice(prefix.length) : null;
}

function contentTypeForArchiveFile(relativePath: string): string {
    const extension = path.extname(relativePath).toLowerCase();
    if (extension === ".json") return "application/json";
    if (extension === ".png") return "image/png";
    if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
    if (extension === ".webp") return "image/webp";
    return "application/octet-stream";
}

async function getB2UploadSession(
    authorization: B2Authorization,
    apiUrl: string,
    bucketId: string,
    request: B2Request
): Promise<B2UploadSession> {
    const session = await callB2<B2UploadSession>(request, {
        method: "post",
        url: b2Endpoint(apiUrl, "b2_get_upload_url"),
        headers: { Authorization: authorization.authorizationToken },
        data: { bucketId }
    }, "upload authorization");
    if (!session?.uploadUrl || !session.authorizationToken) {
        throw new Error("Backblaze B2 returned an incomplete upload authorization.");
    }
    return session;
}

async function uploadB2File(
    session: B2UploadSession,
    fileName: string,
    file: LocalArchiveFile,
    request: B2Request
): Promise<void> {
    await callB2(request, {
        method: "post",
        url: session.uploadUrl,
        headers: {
            Authorization: session.authorizationToken,
            "X-Bz-File-Name": encodeURIComponent(fileName),
            "Content-Type": contentTypeForArchiveFile(file.relativePath),
            "Content-Length": String(file.buffer.length),
            "X-Bz-Content-Sha1": file.sha1
        },
        data: file.buffer,
        maxContentLength: B2_MAX_FILE_BYTES,
        maxBodyLength: B2_MAX_FILE_BYTES
    }, `upload of ${file.relativePath}`);
}

function shouldRefreshUploadSession(error: unknown): boolean {
    if (!(error instanceof B2RequestError)) return false;
    return error.status === 401 || error.status >= 500 || error.code === "bad_auth_token" || error.code === "expired_auth_token";
}

async function uploadWithRetry(
    session: B2UploadSession,
    authorization: B2Authorization,
    apiUrl: string,
    bucketId: string,
    fileName: string,
    file: LocalArchiveFile,
    request: B2Request
): Promise<B2UploadSession> {
    try {
        await uploadB2File(session, fileName, file, request);
        return session;
    } catch (error) {
        if (!shouldRefreshUploadSession(error)) throw error;
        const refreshed = await getB2UploadSession(authorization, apiUrl, bucketId, request);
        await uploadB2File(refreshed, fileName, file, request);
        return refreshed;
    }
}

async function backupSpriteArchiveToB2(
    archivePath: string,
    manifest: SpriteArchiveManifest,
    config: B2Config,
    request: B2Request,
    archiveKey?: string
): Promise<void> {
    const sourcePath = path.resolve(archivePath);
    const verifiedSource = await verifySpriteArchive(sourcePath);
    if (
        verifiedSource.season.id !== manifest.season.id
        || verifiedSource.source.dataSha256 !== manifest.source.dataSha256
    ) {
        throw new Error("Fortnite sprite archive manifest does not match the archive being backed up to B2.");
    }

    const localFiles = await collectLocalArchiveFiles(sourcePath);
    const seasonId = spriteArchiveSlug(verifiedSource.season.id);
    const destinationKey = archiveKey ? normalizeArchiveKey(archiveKey) : seasonId;
    // Keep every branch/deployment in its own immutable namespace. A branch
    // with a different scrape day must never collide with another branch's
    // same-season archive in the shared bucket.
    const objectPrefix = [config.prefix, SPRITE_STORAGE_NAMESPACE, destinationKey].filter(Boolean).join("/");
    const { authorization, apiUrl } = await authorizeB2(config, request);
    const bucket = await resolveB2Bucket(config, authorization, apiUrl, request);
    const remoteFiles = await listB2Files(authorization, apiUrl, bucket.bucketId, `${objectPrefix}/`, request);
    const remoteManifestName = `${objectPrefix}/manifest.json`;
    const remoteManifest = remoteFiles.get(remoteManifestName);
    let repairRemoteMetadata = false;

    if (remoteManifest) {
        const localManifest = localFiles.get("manifest.json");
        if (!localManifest || !localFilesMatchRemote(localManifest, remoteManifest)) {
            // A prior run can upload the source/assets and then publish a
            // manifest that still records missing artwork. Once the local
            // archive is repaired, its manifest and local catalog legitimately
            // differ even though the immutable source catalog is identical.
            // Use the source catalog as the identity anchor, then repair only
            // the two derived metadata files after shared assets are checked.
            const localSource = localFiles.get("spriteData.json");
            const remoteSource = remoteFiles.get(`${objectPrefix}/spriteData.json`);
            if (!localSource || !remoteSource || !localFilesMatchRemote(localSource, remoteSource)) {
                throw new Error(`A different Fortnite sprite archive already exists in b2://${bucket.bucketName}/${objectPrefix}; refusing to overwrite it.`);
            }
            repairRemoteMetadata = true;
        }
        if (!repairRemoteMetadata) {
            for (const [remoteName, remote] of remoteFiles) {
                const relativePath = remoteRelativePath(objectPrefix, remoteName);
                const local = relativePath ? localFiles.get(relativePath) : undefined;
                if (!local || !localFilesMatchRemote(local, remote)) {
                    throw new Error(`A different Fortnite sprite archive already exists in b2://${bucket.bucketName}/${objectPrefix}; refusing to overwrite it.`);
                }
            }
        }
        if (!repairRemoteMetadata && remoteFiles.size === localFiles.size) {
            console.log(`[SpriteArchive] Backblaze B2 already contains ${verifiedSource.season.displayName}; verified existing archive.`);
            return;
        }
        console.warn(`[SpriteArchive] Repairing incomplete Backblaze B2 archive at b2://${bucket.bucketName}/${objectPrefix}.`);
    }

    for (const [remoteName] of remoteFiles) {
        const relativePath = remoteRelativePath(objectPrefix, remoteName);
        if (!relativePath || !localFiles.has(relativePath)) {
            throw new Error(`The partial Fortnite sprite archive in b2://${bucket.bucketName}/${objectPrefix} contains an unexpected file; refusing to overwrite it.`);
        }
    }

    let session = await getB2UploadSession(authorization, apiUrl, bucket.bucketId, request);
    const files = Array.from(localFiles.values()).sort((a, b) => {
        if (a.relativePath === "manifest.json") return 1;
        if (b.relativePath === "manifest.json") return -1;
        return a.relativePath.localeCompare(b.relativePath);
    });
    for (const file of files) {
        const objectName = `${objectPrefix}/${file.relativePath}`;
        const existing = remoteFiles.get(objectName);
        if (existing) {
            if (!localFilesMatchRemote(file, existing)) {
                const canRepairMetadata = repairRemoteMetadata
                    && (file.relativePath === "manifest.json" || file.relativePath === "spriteData.local.json");
                if (canRepairMetadata) {
                    session = await uploadWithRetry(session, authorization, apiUrl, bucket.bucketId, objectName, file, request);
                    continue;
                }
                throw new Error(`A different file already exists at b2://${bucket.bucketName}/${objectName}; refusing to overwrite it.`);
            }
            continue;
        }
        session = await uploadWithRetry(session, authorization, apiUrl, bucket.bucketId, objectName, file, request);
    }

    const verifiedRemoteFiles = await listB2Files(authorization, apiUrl, bucket.bucketId, `${objectPrefix}/`, request);
    if (verifiedRemoteFiles.size !== localFiles.size || !Array.from(localFiles.values()).every(file => {
        const remote = verifiedRemoteFiles.get(`${objectPrefix}/${file.relativePath}`);
        return !!remote && localFilesMatchRemote(file, remote);
    })) {
        throw new Error(`Backblaze B2 archive verification failed for b2://${bucket.bucketName}/${objectPrefix}.`);
    }
    console.log(`[SpriteArchive] Backblaze B2 backup created for ${verifiedSource.season.displayName} at b2://${bucket.bucketName}/${objectPrefix}.`);
}

function makeLocalFile(relativePath: string, buffer: Buffer): LocalArchiveFile {
    return {
        relativePath,
        buffer,
        sha1: createHash("sha1").update(buffer).digest("hex")
    };
}

async function backupFileToFilesystem(file: LocalArchiveFile, backupRoot: string): Promise<void> {
    const resolvedRoot = path.resolve(backupRoot);
    const destinationPath = path.resolve(resolvedRoot, file.relativePath);
    if (!destinationPath.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new Error(`Fortnite sprite backup path escapes the configured backup directory: ${file.relativePath}`);
    }

    if (fs.existsSync(destinationPath)) {
        const existing = await fs.promises.readFile(destinationPath);
        if (existing.length === file.buffer.length && createHash("sha1").update(existing).digest("hex") === file.sha1) return;
    }

    const temporaryPath = `${destinationPath}.tmp-${process.pid}-${Date.now()}`;
    await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
    try {
        await fs.promises.writeFile(temporaryPath, file.buffer, { flag: "wx" });
        await fs.promises.rename(temporaryPath, destinationPath);
    } catch (error) {
        await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
    }
}

async function backupSpriteHistoryToB2(
    historyBuffer: Buffer,
    config: B2Config,
    request: B2Request
): Promise<void> {
    const historyFile = makeLocalFile("spriteHistory.json", historyBuffer);
    const objectName = [config.prefix, SPRITE_STORAGE_NAMESPACE, historyFile.relativePath].filter(Boolean).join("/");
    const { authorization, apiUrl } = await authorizeB2(config, request);
    const bucket = await resolveB2Bucket(config, authorization, apiUrl, request);
    const remoteFiles = await listB2Files(authorization, apiUrl, bucket.bucketId, objectName, request);
    const existing = remoteFiles.get(objectName);
    if (existing && localFilesMatchRemote(historyFile, existing)) {
        console.log(`[SpriteArchive] Backblaze B2 already contains the current sprite history at b2://${bucket.bucketName}/${objectName}.`);
        return;
    }

    let session = await getB2UploadSession(authorization, apiUrl, bucket.bucketId, request);
    await uploadWithRetry(session, authorization, apiUrl, bucket.bucketId, objectName, historyFile, request);
    const verified = await listB2Files(authorization, apiUrl, bucket.bucketId, objectName, request);
    const uploaded = verified.get(objectName);
    if (!uploaded || !localFilesMatchRemote(historyFile, uploaded)) {
        throw new Error(`Backblaze B2 sprite history verification failed for b2://${bucket.bucketName}/${objectName}.`);
    }
    console.log(`[SpriteArchive] Backblaze B2 sprite history updated at b2://${bucket.bucketName}/${objectName}.`);
}

/** Backs up the mutable history index after a season rollover. */
export async function backupSpriteHistory(
    history: SpriteHistoryFile,
    options: SpriteArchiveBackupOptions = {}
): Promise<void> {
    if (process.platform !== "linux") return;
    if (history.schemaVersion !== 1 || !Array.isArray(history.records)) {
        throw new Error("Cannot back up an invalid Fortnite sprite history file.");
    }

    const providers = getBackupProviders();
    if (!providers.filesystemRoot && !providers.b2) return;
    const historyBuffer = Buffer.from(`${JSON.stringify(history, null, 2)}\n`, "utf8");
    const historyFile = makeLocalFile("spriteHistory.json", historyBuffer);

    if (providers.filesystemRoot) {
        await backupFileToFilesystem(historyFile, providers.filesystemRoot);
    }
    if (providers.b2) {
        await backupSpriteHistoryToB2(historyBuffer, providers.b2, options.b2Request || defaultB2Request);
    }
}

/** Reads and backs up a history file for the migration command. */
export async function backupSpriteHistoryFile(
    historyPath: string,
    options: SpriteArchiveBackupOptions = {}
): Promise<void> {
    const parsed = JSON.parse(await fs.promises.readFile(path.resolve(historyPath), "utf8")) as SpriteHistoryFile;
    await backupSpriteHistory(parsed, options);
}

/**
 * Backs up a verified immutable season archive to every configured Linux
 * provider. Filesystem and B2 can be enabled together; this makes the VPS
 * copy useful for quick recovery while B2 remains the off-site copy.
 */
export async function backupSpriteArchive(
    archivePath: string,
    manifest: SpriteArchiveManifest,
    options: SpriteArchiveBackupOptions = {}
): Promise<void> {
    if (process.platform !== "linux") return;

    const providers = getBackupProviders();
    if (!providers.filesystemRoot && !providers.b2) return;

    const sourcePath = path.resolve(archivePath);
    const verifiedSource = await verifySpriteArchive(sourcePath);
    if (verifiedSource.season.id !== manifest.season.id) {
        throw new Error("Fortnite sprite archive manifest does not match the archive being backed up.");
    }
    if (verifiedSource.missingAssetCount > 0 && isTruthy(process.env[BACKUP_REQUIRED_ENV])) {
        throw new Error(`Fortnite sprite archive is missing ${verifiedSource.missingAssetCount} artwork assets; required backup will not accept a partial snapshot.`);
    }

    if (providers.filesystemRoot) {
        await backupSpriteArchiveToFilesystem(sourcePath, verifiedSource, providers.filesystemRoot, options.archiveKey);
    }
    if (providers.b2) {
        await backupSpriteArchiveToB2(
            sourcePath,
            verifiedSource,
            providers.b2,
            options.b2Request || defaultB2Request,
            options.archiveKey
        );
    }
}
