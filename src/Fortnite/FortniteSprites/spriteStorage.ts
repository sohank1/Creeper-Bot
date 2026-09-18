import { execFileSync } from "child_process";

const STORAGE_NAMESPACE_ENV = "FORTNITE_SPRITE_STORAGE_NAMESPACE";

function normalizeNamespace(value: string): string {
    const normalized = value
        .trim()
        .replace(/^refs\/heads\//i, "")
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase()
        .slice(0, 48);
    return normalized || "default";
}

function readGitBranch(): string | null {
    try {
        const executable = process.platform === "win32" ? "git.exe" : "git";
        const branch = execFileSync(executable, ["rev-parse", "--abbrev-ref", "HEAD"], {
            cwd: process.cwd(),
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"]
        }).trim();
        return branch && branch !== "HEAD" ? branch : null;
    } catch {
        return null;
    }
}

function discoverStorageIdentity(): string {
    const explicit = process.env[STORAGE_NAMESPACE_ENV]?.trim();
    if (explicit) return explicit;

    const deploymentBranch = [
        process.env.COOLIFY_BRANCH,
        process.env.GITHUB_REF_NAME,
        process.env.GIT_BRANCH,
        process.env.BRANCH_NAME
    ].find(value => value?.trim());
    if (deploymentBranch) return deploymentBranch;

    // A local checkout normally has Git available, which keeps ignored cache
    // and history files isolated when developers switch branches. Production
    // images intentionally do not contain .git, so they use the stable
    // production fallback below unless the deployment supplies a branch.
    if (process.env.NODE_ENV !== "production") {
        const localBranch = readGitBranch();
        if (localBranch) return localBranch;
    }

    return process.env.NODE_ENV === "production" ? "production" : "development";
}

/** Stable filesystem/object-storage namespace for one branch or deployment. */
export const SPRITE_STORAGE_NAMESPACE = normalizeNamespace(discoverStorageIdentity());
