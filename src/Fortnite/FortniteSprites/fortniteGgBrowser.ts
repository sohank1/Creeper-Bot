import type { Browser } from "puppeteer";

/** Keep source cookies and page state separate from rendering and other fetches. */
export async function fetchFortniteGgBrowserHtml(browser: Browser, url: string): Promise<string> {
    const context = await browser.createBrowserContext();
    try {
        const page = await context.newPage();
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        });
        await page.setExtraHTTPHeaders({
            Referer: "https://fortnite.gg/",
            "Accept-Language": "en-US,en;q=0.9"
        });
        const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        const pathname = new URL(url).pathname;
        const isCountdown = pathname.startsWith("/season-countdown");
        const selector = pathname.startsWith("/sprites/") && pathname !== "/sprites/"
            ? ".sprite-detail-panel"
            : pathname.startsWith("/sprites") ? ".sprite-card" : "#big-countdown";
        const expected = isCountdown ? "#big-countdown or a Chapter/Season page title" : selector;
        try {
            await page.waitForFunction((expectedSelector: string, countdownPage: boolean) => {
                if (/just a moment|verify you are human|checking your browser/i.test(document.title)) return false;
                if (countdownPage) return !!document.querySelector(expectedSelector)
                    || /chapter\s*\d+\s*season/i.test(document.title);
                return !!document.querySelector(expectedSelector);
            }, { timeout: 30_000 }, selector, isCountdown);
        } catch {
            throw new Error(`Fortnite.GG source unavailable at ${url}: HTTP ${response?.status() ?? "unknown"}, page "${await page.title()}"; expected ${expected}.`);
        }
        return await page.content();
    } finally {
        await context.close();
    }
}
