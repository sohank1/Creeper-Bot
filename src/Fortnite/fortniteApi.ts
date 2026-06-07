const DEFAULT_FORTNITE_API_BASE_URL = "https://fortnite-api.com";

export const FORTNITE_API_BASE_URL = (process.env.FORTNITE_API_BASE_URL ?? DEFAULT_FORTNITE_API_BASE_URL).replace(/\/+$/, "");

/**
 * Builds a Fortnite API URL from a relative path.
 * Leading slashes are stripped, and empty paths resolve to the base URL.
 */
export function fortniteApiUrl(path: string): string {
    const normalizedPath = path.replace(/^\/+/, "");
    if (!normalizedPath) return FORTNITE_API_BASE_URL;
    return `${FORTNITE_API_BASE_URL}/${normalizedPath}`;
}
