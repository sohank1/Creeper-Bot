const DEFAULT_FORTNITE_API_BASE_URL = "https://fortnite-api.com";

export const FORTNITE_API_BASE_URL = (process.env.FORTNITE_API_BASE_URL ?? DEFAULT_FORTNITE_API_BASE_URL).replace(/\/+$/, "");

export function fortniteApiUrl(path: string): string {
    const normalizedPath = path.replace(/^\/+/, "");
    return normalizedPath ? `${FORTNITE_API_BASE_URL}/${normalizedPath}` : FORTNITE_API_BASE_URL;
}
