const DEFAULT_FORTNITE_API_BASE_URL = "https://fortnite-api.com";

export const FORTNITE_API_BASE_URL = (process.env.FORTNITE_API_BASE_URL ?? DEFAULT_FORTNITE_API_BASE_URL).replace(/\/+$/, "");

export function fortniteApiUrl(path: string): string {
    return `${FORTNITE_API_BASE_URL}/${path.replace(/^\/+/, "")}`;
}
