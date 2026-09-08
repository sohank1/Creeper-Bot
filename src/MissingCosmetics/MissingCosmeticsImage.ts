import fs from "fs";
import type { Browser } from "puppeteer";
import { applyMissingPalettes, fallbackPalette } from "./MissingPalette";
import { selectMissingPreview, prepareMissingPreviews, missingArtworkShape, missingArtworkWarnings } from "./MissingPreview";
import { getFortniteSeasonEmojiAssetUrl } from "../Fortnite/fortniteSeasonEmoji";
import { getCosmeticSeasonEmoji } from "../Fortnite/FortniteCosmetics/CosmeticIntroduction";

export interface MissingCosmeticImageItem {
    cosmetic?: import("../Fortnite/FortniteCosmetics/CosmeticEmbed").CatalogCosmetic;
    id: string;
    name: string;
    type: string;
    imageUrl: string | null;
    featuredImageUrl?: string | null;
    featuredImageIsShopArtwork?: boolean;
    fnbrUrl?: string;
    badgeLabel?: string;
    daysMissing: number;
    lastSeenLabel: string;
    rarity?: string;
    price?: number;
    priceIsCurrent?: boolean;
    priceObservedAt?: string;
    previousAppearances?: number;
    introduced?: string;
    backgroundColors?: string[];
    textBackgroundColor?: string;
    previousRotations?: number;
    recordReturn?: boolean;
    tileSize?: string;
    shopSection?: string;
    setKey?: string;
    imageFraming?: { aspect: number; touchesBottom: boolean; emptyFraction: number };
    featuredFraming?: { aspect: number; touchesBottom: boolean; emptyFraction: number };
}

export interface MissingCosmeticsRender {
    image: Buffer;
    close: () => Promise<void>;
    artworkWarnings?: string[];
}

export type MissingCosmeticsImageVariant = "vault-grid" | "locker-files" | "storm-scan" | "return-pass" | "bus-arrivals" | "supply-drop" | "island-broadcast" | "item-shop";

const escapeHtml = (value: string) => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const loadEmbeddedFont = (candidates: Array<{ path: string; mime: string; format: string }>) => {
    const font = candidates.find(candidate => fs.existsSync(candidate.path));
    if (!font) return null;
    return `url("data:${font.mime};base64,${fs.readFileSync(font.path).toString("base64")}") format("${font.format}")`;
};

const fortniteDisplayFont = loadEmbeddedFont([
    { path: `${process.cwd()}/assets/BurbankBigRegular-Black.woff2`, mime: "font/woff2", format: "woff2" },
    { path: `${process.cwd()}/assets/BurbankBigRegular-Black.woff`, mime: "font/woff", format: "woff" },
    { path: `${process.cwd()}/assets/BurbankBigRegular-Black.otf`, mime: "font/otf", format: "opentype" },
    { path: `${process.cwd()}/assets/BurbankBigRegular-Black.ttf`, mime: "font/ttf", format: "truetype" },
    { path: `${process.cwd()}/assets/BurbankBigCondensed-Black.woff2`, mime: "font/woff2", format: "woff2" },
    { path: `${process.cwd()}/assets/BurbankBigCondensed-Black.woff`, mime: "font/woff", format: "woff" },
    { path: `${process.cwd()}/assets/BurbankBigCondensed-Black.otf`, mime: "font/otf", format: "opentype" },
    { path: `${process.cwd()}/assets/BurbankBigCondensed-Black.ttf`, mime: "font/ttf", format: "truetype" },
]);

const fortniteSmallFont = loadEmbeddedFont([
    { path: `${process.cwd()}/assets/BurbankSmall-Black.woff2`, mime: "font/woff2", format: "woff2" },
    { path: `${process.cwd()}/assets/BurbankSmall-Black.woff`, mime: "font/woff", format: "woff" },
    { path: `${process.cwd()}/assets/BurbankSmall-Black.otf`, mime: "font/otf", format: "opentype" },
    { path: `${process.cwd()}/assets/BurbankSmall-Black.ttf`, mime: "font/ttf", format: "truetype" },
]);

const vBuckImage = (() => {
    const imagePath = `${process.cwd()}/assets/vbuck.png`;
    return fs.existsSync(imagePath)
        ? `data:image/png;base64,${fs.readFileSync(imagePath).toString("base64")}`
        : null;
})();

const apiColor = (value: string | undefined, fallback: string): string => {
    const hex = value?.replace(/^#/, "");
    if (hex && /^[0-9a-fA-F]{8}$/.test(hex)) return `#${hex}`;
    if (hex && /^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`;
    return fallback;
};

const introductionBadge = (value: string | undefined): string | null => {
    if (!value) return null;
    const chapterSeason = value.match(/chapter\s+([^,]+),?\s+season\s+([^.!]+)/i);
    if (chapterSeason) {
        return `CHAPTER ${chapterSeason[1].trim()} · SEASON ${chapterSeason[2].trim()}`;
    }
    const season = value.match(/season\s+([^.!]+)/i);
    return season ? `SEASON ${season[1].trim()}` : null;
};

export function introductionBadgeHtml(value: string | undefined): string {
    const label = introductionBadge(value);
    if (!label) return "";
    const chapter = label.match(/CHAPTER\s+(\d+)/)?.[1];
    const season = label.match(/SEASON\s+(.+)$/i)?.[1];
    const seasonName = season === "GALACTIC BATTLE" ? "Galactic Battle" : season === "THE SIMPSONS" ? "The Simpsons" : season;
    const emoji = seasonName ? getCosmeticSeasonEmoji(Number(chapter || 1), seasonName) : undefined;
    // Twemoji omits variation selectors for standalone glyphs. The shared map
    // also has legacy gender sequences without a joiner; use the base glyph
    // as a fallback when that exact shared asset is unavailable.
    const fallbackEmoji = emoji?.replace(/[\ufe0f\u200d♂♀]/g, "");
    return `<span class="fs-season-label fs-fit" data-min-size="4">${escapeHtml(label)}</span>${emoji ? ` <img class="fs-season-emoji" src="${escapeHtml(getFortniteSeasonEmojiAssetUrl(emoji))}" data-fallback="${escapeHtml(getFortniteSeasonEmojiAssetUrl(fallbackEmoji!))}" alt="" onerror="if(this.dataset.fallback){const url=this.dataset.fallback;delete this.dataset.fallback;this.src=url}else{this.style.display='none'}" />` : ""}`;
}

function getChromiumExecutablePath(): string | undefined {
    const configuredPath = process.env.GOOGLE_CHROME_BIN || process.env.PUPPETEER_EXECUTABLE_PATH;
    if (configuredPath) return configuredPath;
    if (process.platform !== "linux") return undefined;

    return ["/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium"]
        .find(candidate => fs.existsSync(candidate));
}

function buildHtml(items: MissingCosmeticImageItem[], shopDateLabel: string, minimumDays = 300): string {
    const columnCount = Math.min(items.length, 4);
    const cards = items.map(item => `
        <article class="card">
            <div class="art">
                ${item.imageUrl
                    ? `<img src="${escapeHtml(item.imageUrl)}" alt="" />`
                    : `<div class="placeholder">?</div>`}
                <span class="type">${escapeHtml(item.type)}</span>
            </div>
            <div class="details">
                <h2>${escapeHtml(item.name)}</h2>
                <div class="return-row">
                    <strong>${item.daysMissing.toLocaleString("en-US")}</strong>
                    <span>DAYS AWAY</span>
                </div>
                <p>Last seen ${escapeHtml(item.lastSeenLabel)}</p>
            </div>
        </article>`).join("");

    return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;background:#071b38;color:#fff;font-family:Arial,Helvetica,sans-serif}body{width:1440px;min-height:900px;padding:62px 66px 72px;background:radial-gradient(circle at 82% 2%,#176dcb 0,transparent 34%),radial-gradient(circle at 4% 94%,#5437ab 0,transparent 28%),linear-gradient(145deg,#06152e,#0b376a 58%,#071a35)}
.top{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:34px}.eyebrow{color:#71d8ff;font-size:20px;font-weight:900;letter-spacing:5px}.title{margin:5px 0 0;font-size:64px;line-height:.92;font-weight:1000;letter-spacing:-3px;font-style:italic;text-transform:uppercase;text-shadow:0 6px 0 rgba(0,0,0,.18)}.summary{text-align:right;border-right:7px solid #ffe600;padding-right:18px}.summary strong{display:block;font-size:42px;line-height:1;color:#ffe600}.summary span{display:block;margin-top:7px;color:#b8ddff;font-size:18px;font-weight:800;letter-spacing:2px;text-transform:uppercase}
.rule{height:3px;background:linear-gradient(90deg,#ffe600 0 24%,rgba(255,255,255,.16) 24%);margin-bottom:28px}.grid{display:grid;grid-template-columns:repeat(${columnCount},312px);justify-content:center;gap:20px}.card{overflow:hidden;min-width:0;background:linear-gradient(160deg,rgba(31,105,183,.94),rgba(9,43,85,.98));border:2px solid rgba(137,211,255,.5);box-shadow:0 12px 25px rgba(0,0,0,.28);clip-path:polygon(0 0,100% 0,100% 95%,94% 100%,0 100%)}.art{position:relative;height:255px;overflow:hidden;background:radial-gradient(circle at 50% 45%,#3ac5ff,#1178c5 57%,#0b477f)}.art:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 56%,rgba(5,27,56,.75))}.art img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 12px 9px rgba(0,0,0,.35));position:relative;z-index:1}.placeholder{height:100%;display:grid;place-items:center;font-size:100px;font-weight:1000;color:rgba(255,255,255,.35)}.type{position:absolute;z-index:2;left:13px;bottom:12px;padding:7px 11px;background:#071b38;color:#8ee1ff;font-size:13px;font-weight:900;letter-spacing:1.4px;text-transform:uppercase}.details{padding:18px 18px 22px}.details h2{height:70px;margin:0 0 12px;display:flex;align-items:flex-start;font-size:20px;line-height:1.05;font-weight:1000;font-style:italic;text-transform:uppercase;overflow:hidden}.return-row{display:flex;align-items:baseline;gap:9px;color:#ffe600}.return-row strong{font-size:35px;line-height:1}.return-row span{font-size:13px;font-weight:900;letter-spacing:1.5px}.details p{margin:8px 0 0;color:#b8d7f5;font-size:14px;font-weight:700}.footer{display:flex;justify-content:space-between;margin-top:30px;color:#85afd6;font-size:15px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase}.footer b{color:#fff}
</style></head><body>
<header class="top"><div><div class="eyebrow">ITEM SHOP INTEL</div><h1 class="title">Back From<br>The Vault</h1></div><div class="summary"><strong>${items.length}</strong><span>Returning cosmetic${items.length === 1 ? "" : "s"}</span></div></header>
<div class="rule"></div><main class="grid">${cards}</main>
<footer class="footer"><span>Previously gone for <b>${minimumDays}+ days</b></span><span>Shop rotation · ${escapeHtml(shopDateLabel)}</span></footer>
</body></html>`;
}

function buildLockerFilesHtml(items: MissingCosmeticImageItem[], shopDateLabel: string, minimumDays = 300): string {
    const bodyClass = items.length > 2 ? "many" : "";
    const cards = items.map((item, index) => `
        <article class="file">
            <div class="number">0${index + 1}</div>
            <div class="portrait">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" />` : `<div class="missing">?</div>`}</div>
            <div class="copy"><span class="kind">${escapeHtml(item.type)}</span><h2>${escapeHtml(item.name)}</h2><p>LAST SEEN · ${escapeHtml(item.lastSeenLabel)}</p></div>
            <div class="counter"><strong>${item.daysMissing.toLocaleString("en-US")}</strong><span>DAYS<br>OFF GRID</span></div>
        </article>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;background:#eceff3;color:#07152d;font-family:Arial,Helvetica,sans-serif}body{width:1440px;min-height:900px;padding:54px 64px 64px;background:linear-gradient(118deg,#f8fafc 0 72%,#dfe5ed 72%)}
header{display:grid;grid-template-columns:170px 1fr auto;align-items:end;gap:24px;border-bottom:8px solid #07152d;padding-bottom:23px}.stamp{height:92px;display:grid;place-items:center;background:#ffe600;font-size:46px;font-weight:1000;font-style:italic;transform:skew(-6deg)}.small{font-size:15px;font-weight:900;letter-spacing:4px;color:#1d66ad}.small b{display:block;margin-top:7px;color:#07152d;font-size:38px;letter-spacing:-1px;font-style:italic}.date{text-align:right;font-size:15px;font-weight:900;letter-spacing:2px}.date b{display:block;margin-top:7px;font-size:25px;letter-spacing:0}
main{display:grid;gap:18px;margin-top:35px}.file{position:relative;display:grid;grid-template-columns:58px 240px 1fr 215px;min-height:230px;align-items:center;background:#fff;border:2px solid #a9b6c5;box-shadow:10px 10px 0 #cbd3dc;overflow:hidden}.file:after{content:"";position:absolute;left:0;bottom:0;width:100%;height:7px;background:linear-gradient(90deg,#177bd1 0 66%,#ffe600 66%)}.number{align-self:stretch;display:grid;place-items:center;background:#07152d;color:#fff;font-size:18px;font-weight:900;writing-mode:vertical-rl;letter-spacing:3px}.portrait{height:226px;background:radial-gradient(circle,#41c9ff,#1269b1 65%,#0a3b70);overflow:hidden}.portrait img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 12px 8px #07315a88)}.missing{height:100%;display:grid;place-items:center;font-size:90px;color:#ffffff66}.copy{padding:25px 34px}.kind{display:inline-block;padding:7px 10px;background:#177bd1;color:#fff;font-size:13px;font-weight:900;letter-spacing:2px;text-transform:uppercase}.copy h2{margin:13px 0 22px;font-size:42px;line-height:.95;font-weight:1000;font-style:italic;text-transform:uppercase}.copy p{margin:0;color:#657488;font-size:15px;font-weight:900;letter-spacing:1px}.counter{height:145px;border-left:2px solid #d4dbe3;display:flex;align-items:center;justify-content:center;gap:14px}.counter strong{font-size:60px;letter-spacing:-3px}.counter span{font-size:13px;line-height:1.2;font-weight:1000;letter-spacing:1.5px;color:#177bd1}
footer{display:flex;justify-content:space-between;margin-top:38px;font-size:14px;font-weight:900;letter-spacing:2px;color:#68768a;text-transform:uppercase}footer b{color:#07152d}.many main{grid-template-columns:1fr 1fr}.many .file{grid-template-columns:42px 164px 1fr;min-height:170px}.many .portrait{height:168px}.many .copy{padding:20px}.many .copy h2{margin:10px 0 16px;font-size:25px}.many .copy p{font-size:11px}.many .counter{position:absolute;right:18px;bottom:16px;height:auto;border:0}.many .counter strong{font-size:31px}.many .counter span{display:none}
</style></head><body class="${bodyClass}"><header><div class="stamp">RETURN</div><div class="small">DAILY ITEM SHOP ARCHIVE<b>LOCKER FILES</b></div><div class="date">ROTATION DATE<b>${escapeHtml(shopDateLabel)}</b></div></header><main>${cards}</main><footer><span>File status · <b>reissued</b></span><span>${items.length} cosmetic${items.length === 1 ? "" : "s"} absent ${minimumDays}+ days</span></footer></body></html>`;
}

function buildStormScanHtml(items: MissingCosmeticImageItem[], shopDateLabel: string, minimumDays = 300): string {
    const bodyClass = items.length > 1 ? "many" : "";
    const cards = items.map(item => `
        <article class="scan">
            <div class="art">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" />` : `<div class="missing">?</div>`}<span>${escapeHtml(item.type)}</span></div>
            <div class="data"><div class="signal">RETURN SIGNAL ACQUIRED</div><h2>${escapeHtml(item.name)}</h2><div class="line"></div><div class="metrics"><div><small>TIME IN THE STORM</small><strong>${item.daysMissing.toLocaleString("en-US")}</strong><em>DAYS</em></div><div><small>PREVIOUS SIGHTING</small><b>${escapeHtml(item.lastSeenLabel)}</b></div></div></div>
        </article>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;background:#16082f;color:#fff;font-family:Arial,Helvetica,sans-serif}body{width:1440px;min-height:900px;padding:58px 66px;background:radial-gradient(circle at 18% 108%,#7852ff 0,transparent 41%),radial-gradient(circle at 100% 0,#e331ad 0,transparent 34%),#16082f;position:relative;overflow:hidden}body:before{content:"";position:absolute;inset:0;opacity:.16;background:repeating-linear-gradient(120deg,transparent 0 58px,#9cecff 59px 60px)}
header,main,footer{position:relative;z-index:1}header{display:flex;justify-content:space-between;align-items:center}.brand{font-size:18px;font-weight:1000;letter-spacing:5px;color:#76efff}.brand b{display:block;margin-top:7px;color:#fff;font-size:57px;letter-spacing:-3px;font-style:italic}.status{padding:13px 18px;border:2px solid #76efff;color:#76efff;font-size:14px;font-weight:900;letter-spacing:2px;transform:skew(-6deg)}
main{display:grid;gap:22px;margin-top:39px}.scan{display:grid;grid-template-columns:430px 1fr;min-height:465px;border:2px solid #b76dff;background:#24104acc;box-shadow:0 0 42px #8d40ff55;clip-path:polygon(0 0,97% 0,100% 8%,100% 100%,3% 100%,0 92%)}.art{position:relative;background:radial-gradient(circle,#47d4f2,#5746cf 57%,#21104b);overflow:hidden;border-right:2px solid #b76dff}.art:after{content:"";position:absolute;inset:0;background:linear-gradient(transparent 70%,#120729cc)}.art img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 15px 13px #0a031d)}.art span{position:absolute;z-index:2;left:22px;bottom:22px;padding:9px 13px;background:#76efff;color:#16082f;font-size:13px;font-weight:1000;letter-spacing:2px;text-transform:uppercase}.missing{height:100%;display:grid;place-items:center;font-size:110px;color:#ffffff55}.data{padding:50px 54px}.signal{color:#76efff;font-size:14px;font-weight:1000;letter-spacing:4px}.data h2{margin:18px 0 28px;font-size:57px;line-height:.92;font-weight:1000;font-style:italic;text-transform:uppercase;text-shadow:5px 5px 0 #dc2ea4}.line{height:3px;background:linear-gradient(90deg,#76efff 0 32%,#ffffff26 32%)}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:38px}.metrics small{display:block;color:#bd9ddb;font-size:13px;font-weight:900;letter-spacing:2px}.metrics strong{display:inline-block;margin-top:8px;font-size:76px;line-height:1;color:#ffe600;letter-spacing:-4px}.metrics em{margin-left:11px;color:#ffe600;font-size:16px;font-style:normal;font-weight:1000}.metrics b{display:block;margin-top:20px;font-size:28px}
footer{display:flex;justify-content:space-between;margin-top:35px;color:#bd9ddb;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase}footer b{color:#76efff}.many main{grid-template-columns:1fr 1fr}.many .scan{grid-template-columns:215px 1fr;min-height:290px}.many .data{padding:28px 26px}.many .data h2{font-size:31px;margin:14px 0 20px;text-shadow:3px 3px 0 #dc2ea4}.many .signal{font-size:10px;letter-spacing:2px}.many .metrics{display:block;margin-top:24px}.many .metrics>div+div{margin-top:18px}.many .metrics strong{font-size:48px}.many .metrics b{margin-top:8px;font-size:19px}.many .art span{left:12px;bottom:12px}
</style></head><body class="${bodyClass}"><header><div class="brand">LOOP MONITOR // ITEM SHOP<b>STORM SCAN</b></div><div class="status">${items.length} SIGNAL${items.length === 1 ? "" : "S"} FOUND</div></header><main>${cards}</main><footer><span>Scan threshold <b>${minimumDays}+ days</b></span><span>Rotation ${escapeHtml(shopDateLabel)}</span></footer></body></html>`;
}

function buildReturnPassHtml(items: MissingCosmeticImageItem[], shopDateLabel: string, minimumDays = 300): string {
    const cards = items.map((item, index) => `
        <article class="ticket">
            <div class="serial">RETURN PASS // ${String(index + 1).padStart(2, "0")}</div>
            <div class="ticket-art">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" />` : `<div class="ticket-missing">?</div>`}<span>${escapeHtml(item.rarity || item.type)}</span></div>
            <div class="ticket-copy"><div class="ticket-type">${escapeHtml(item.type)}</div><h2>${escapeHtml(item.name)}</h2><div class="absence"><strong>${item.daysMissing.toLocaleString("en-US")}</strong><span>DAYS<br>UNSEEN</span></div><div class="facts"><span>LAST SEEN<b>${escapeHtml(item.lastSeenLabel)}</b></span><span>PRICE<b>${item.price !== undefined ? `${item.price.toLocaleString("en-US")} V-BUCKS` : "—"}</b></span></div><div class="history">${item.previousAppearances ?? "—"} PRIOR SHOP DAYS <i></i> ${escapeHtml(item.introduced || "INTRODUCTION UNKNOWN")}</div></div>
        </article>`).join("");
    const longest = Math.max(...items.map(item => item.daysMissing));
    return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;background:#fff1c7;color:#071c3c;font-family:Arial,Helvetica,sans-serif}body{width:1440px;min-height:900px;padding:0 64px 60px;background:linear-gradient(135deg,#fff6d9,#f3dfad)}
header{height:225px;margin:0 -64px 42px;padding:43px 64px 35px;display:grid;grid-template-columns:1fr auto;align-items:end;background:#ffe500;position:relative;overflow:hidden;border-bottom:13px solid #071c3c}header:after{content:"RETURN RETURN RETURN";position:absolute;right:-80px;top:6px;color:#071c3c12;font-size:102px;font-weight:1000;font-style:italic;white-space:nowrap;transform:rotate(-4deg)}.pass-kicker{position:relative;z-index:1;font-size:14px;font-weight:1000;letter-spacing:5px}.pass-title{position:relative;z-index:1;margin-top:4px;font-size:70px;line-height:.85;font-weight:1000;font-style:italic;letter-spacing:-4px}.pass-summary{position:relative;z-index:1;display:flex;gap:38px;text-align:right}.pass-summary span{font-size:12px;font-weight:1000;letter-spacing:2px}.pass-summary b{display:block;margin-top:7px;font-size:31px;letter-spacing:-1px}
main{display:grid;grid-template-columns:repeat(${Math.min(items.length, 4)},300px);justify-content:center;gap:24px}.ticket{position:relative;background:#fffdf4;border:3px solid #071c3c;box-shadow:9px 9px 0 #1d69b3;overflow:hidden}.serial{height:35px;padding:10px 12px;background:#071c3c;color:#fff;font-size:11px;font-weight:1000;letter-spacing:2px}.ticket-art{height:245px;position:relative;overflow:hidden;background:radial-gradient(circle,#54d8ff,#1982cd 62%,#0c4b87)}.ticket-art img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 12px 9px #07396c99)}.ticket-art span{position:absolute;left:12px;bottom:10px;padding:7px 10px;background:#ffe500;color:#071c3c;font-size:11px;font-weight:1000;letter-spacing:1.5px;text-transform:uppercase}.ticket-missing{height:100%;display:grid;place-items:center;font-size:90px;color:#ffffff66}.ticket-copy{padding:18px}.ticket-type{font-size:11px;font-weight:1000;letter-spacing:2px;color:#1d69b3;text-transform:uppercase}.ticket h2{height:68px;margin:7px 0 13px;font-size:22px;line-height:1.02;font-weight:1000;font-style:italic;text-transform:uppercase;overflow:hidden}.absence{display:flex;align-items:center;gap:10px;border-top:2px solid #071c3c;border-bottom:2px solid #071c3c;padding:10px 0}.absence strong{font-size:43px;line-height:1}.absence span{font-size:10px;line-height:1.15;font-weight:1000;letter-spacing:1px}.facts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.facts span{font-size:9px;font-weight:1000;letter-spacing:1px;color:#687587}.facts b{display:block;margin-top:4px;color:#071c3c;font-size:12px;letter-spacing:0}.history{margin-top:13px;padding-top:11px;border-top:1px dashed #929ba7;color:#596678;font-size:9px;font-weight:1000;letter-spacing:.6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.history i{display:inline-block;width:4px;height:4px;margin:0 5px;background:#1d69b3;border-radius:50%}
footer{display:flex;justify-content:space-between;margin-top:38px;font-size:13px;font-weight:1000;letter-spacing:2px;text-transform:uppercase;color:#607087}footer b{color:#071c3c}
</style></head><body><header><div><div class="pass-kicker">DAILY SHOP RE-ENTRY</div><div class="pass-title">THE RETURN PASS</div></div><div class="pass-summary"><span>PASSES ISSUED<b>${items.length}</b></span><span>LONGEST WAIT<b>${longest.toLocaleString("en-US")} DAYS</b></span></div></header><main>${cards}</main><footer><span>Admit to item shop · <b>${escapeHtml(shopDateLabel)}</b></span><span>Verified absence · <b>${minimumDays}+ days</b></span></footer></body></html>`;
}

function buildBusArrivalsHtml(items: MissingCosmeticImageItem[], shopDateLabel: string, minimumDays = 300): string {
    const columns = items.length <= 10 ? 1 : items.length <= 24 ? 2 : 3;
    const categories = Array.from(new Set(items.map(item => item.type))).slice(0, 4).join(" · ");
    const longest = Math.max(...items.map(item => item.daysMissing));
    const rows = items.map((item, index) => {
        const details = [
            item.rarity || "Cosmetic",
            item.price !== undefined ? `${item.price.toLocaleString("en-US")} V-Bucks` : null,
            item.previousAppearances !== undefined ? `${item.previousAppearances} prior shop days` : null,
            item.introduced,
        ].filter(Boolean).join(" · ");
        return `<article><div class="route">B${String(index + 1).padStart(2, "0")}</div><div class="thumb">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" />` : "?"}</div><div class="arrival-name"><small>${escapeHtml(item.type)} · ${escapeHtml(details)}</small><h2>${escapeHtml(item.name)}</h2><p>LAST SEEN ${escapeHtml(item.lastSeenLabel)}</p></div><div class="previous"><small>PREVIOUS STOP</small><b>${escapeHtml(item.lastSeenLabel)}</b></div><div class="wait"><strong>${item.daysMissing.toLocaleString("en-US")}</strong><span>DAYS</span></div><div class="state">NOW BOARDING</div></article>`;
    }).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:#a9dcff;color:#092346;font-family:Arial,sans-serif}body{width:1440px;min-height:900px;padding:52px 64px 62px;background:linear-gradient(#84cbff 0 32%,#d9efff 32%)}header{display:grid;grid-template-columns:1fr auto;align-items:end;padding:0 0 26px;border-bottom:9px solid #092346}.label{font-size:15px;font-weight:1000;letter-spacing:5px}.title{font-size:64px;font-weight:1000;font-style:italic;line-height:.9;margin-top:7px}.summary{display:flex;gap:32px;text-align:right}.summary span{font-size:10px;font-weight:1000;letter-spacing:2px}.summary b{display:block;font-size:28px;margin-top:7px}.board{margin-top:28px;background:#092346;padding:13px;box-shadow:14px 14px 0 #ffdd00}.rows{display:grid;grid-template-columns:repeat(${columns},1fr);gap:0 ${columns > 1 ? 16 : 0}px}.head,article{display:grid;grid-template-columns:80px 120px 1fr 190px 120px 170px;align-items:center}.head{height:34px;color:#77b2ed;font-size:11px;font-weight:1000;letter-spacing:2px;padding:0 14px}.head span:nth-child(n+4){text-align:center}article{min-height:112px;padding:8px 14px;border-top:2px solid #29476b;color:#fff}.route{font-size:23px;font-weight:1000;color:#ffdd00}.thumb{width:92px;height:92px;display:grid;place-items:center;overflow:hidden;background:#1678c5}.thumb img{width:100%;height:100%;object-fit:contain}.arrival-name{min-width:0}.arrival-name small,.previous small{display:block;color:#72a9df;font-size:9px;font-weight:1000;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.arrival-name h2{margin:6px 0 0;font-size:24px;line-height:1;font-style:italic;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.arrival-name p{display:none}.previous{text-align:center}.previous b{display:block;margin-top:8px;font-size:16px}.wait{text-align:center;color:#ffdd00}.wait strong{font-size:38px}.wait span{font-size:10px;font-weight:1000;margin-left:4px}.state{padding:12px 8px;text-align:center;background:#ffdd00;color:#092346;font-size:11px;font-weight:1000;letter-spacing:1px}.compact .head{display:none}.compact article{grid-template-columns:42px 76px 1fr 88px;min-width:0;min-height:94px;padding:7px 9px}.compact .thumb{width:70px;height:78px}.compact .previous,.compact .state{display:none}.compact .arrival-name h2{font-size:${columns === 3 ? 15 : 18}px}.compact .arrival-name p{display:block;margin:6px 0 0;color:#87b4df;font-size:9px;font-weight:900}.compact .route{font-size:17px}.compact .wait strong{font-size:27px}.compact .wait span{display:block;margin:2px 0 0}footer{display:flex;justify-content:space-between;margin-top:35px;font-size:12px;font-weight:1000;letter-spacing:2px;text-transform:uppercase}</style></head><body><header><div><div class="label">BATTLE BUS TERMINAL</div><div class="title">RETURN ARRIVALS</div></div><div class="summary"><span>ARRIVALS<b>${items.length}</b></span><span>LONGEST DELAY<b>${longest.toLocaleString("en-US")} DAYS</b></span><span>SHOP DATE<b>${escapeHtml(shopDateLabel)}</b></span></div></header><main class="board ${columns > 1 ? "compact" : ""}"><div class="head"><span>ROUTE</span><span>PASSENGER</span><span>COSMETIC</span><span>LAST STOP</span><span>DELAY</span><span>STATUS</span></div><div class="rows">${rows}</div></main><footer><span>${escapeHtml(categories)}</span><span>Absence threshold · 300 days</span></footer></body></html>`;
}

export interface ShopImageLabels { title: string; subtitle: string; footer: string; profileName?: string; profileAvatar?: string }

export function buildFortniteItemShopReplicaHtml(items: MissingCosmeticImageItem[], shopDateLabel: string, minimumDays = 300, logoUrl?: string, labels?: ShopImageLabels): string {
    const useFeaturedMosaic = !labels && items.length <= 10;
    const isFlatMedia = (item: MissingCosmeticImageItem) =>
        /jam track|music|loading screen|emoticon|emoji|spray|banner|backpack|back bling/i.test(item.type);
    const featuredScore = (item: MissingCosmeticImageItem) => {
        if (!item.imageUrl && !item.featuredImageUrl) return -1;
        if (isFlatMedia(item)) return -1;
        if (missingArtworkShape(item, true) === "wide") return -1;
        return (/outfit|character|skin/i.test(item.type) ? 200 : 0)
            + (item.featuredImageUrl ? 40 : 0)
            + (missingArtworkShape(item, true) === "tall" ? 80 : 0)
            + (/2_x_2|1_x_2/i.test(item.tileSize || "") ? 100 : 0);
    };
    const preferredFeatured = items
        .map((item, index) => ({ item, index, score: featuredScore(item) }))
        .filter(candidate => candidate.score >= 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(candidate => candidate.item);
    const featuredTarget = items.length <= 6
        ? Math.max(1, Math.min(2, Math.floor(items.length / 2)))
        : 3;
    const featuredCount = useFeaturedMosaic ? Math.min(featuredTarget, preferredFeatured.length) : 0;
    const featuredItems = [
        ...preferredFeatured.slice(0, featuredCount),
        ...items.filter(item => !preferredFeatured.slice(0, featuredCount).some(featured => featured.id === item.id)),
    ].slice(0, featuredCount);
    const featuredIds = new Set(featuredItems.map(item => item.id));
    const displayItems = useFeaturedMosaic
        ? [...featuredItems, ...items.filter(item => !featuredIds.has(item.id))]
        : items;
    const compactColumns = useFeaturedMosaic ? Math.ceil(Math.max(0, items.length - featuredCount) / 2) : 6;
    const columns = useFeaturedMosaic ? Math.max(1, featuredCount + compactColumns) : labels ? Math.max(1, Math.min(6, items.length)) : 6;
    // Account for the grid's 22px inset inside the 64px page margins.
    const availableWidth = 1290;
    const horizontalGap = useFeaturedMosaic ? 20 : 14;
    const tileWidth = useFeaturedMosaic
        ? Math.min(280, Math.floor((availableWidth - horizontalGap * Math.max(0, columns - 1)) / columns))
        : labels ? Math.min(320, Math.floor((availableWidth - horizontalGap * (columns - 1)) / columns)) : 201;
    const rowHeight = Math.max(156, Math.round(tileWidth * (useFeaturedMosaic ? .826 : 1)));
    const smallText = tileWidth <= 205;
    const coin = vBuckImage
        ? `<i class="fs-vbuck" aria-label="V-Bucks"></i>`
        : `<i class="fs-vbuck-fallback">V</i>`;
    const rarityAccent = (rarity: string | undefined, fallback: string): string => {
        const normalized = rarity?.toLowerCase() || "";
        if (normalized.includes("legendary")) return "#f29a2eff";
        if (normalized.includes("epic")) return "#e52a9aff";
        if (normalized.includes("rare")) return "#24d9f4ff";
        if (normalized.includes("uncommon")) return "#8ee521ff";
        if (normalized.includes("common")) return "#d6d8dcff";
        if (normalized.includes("icon")) return "#40e6d0ff";
        if (normalized.includes("marvel")) return "#f12b36ff";
        if (normalized.includes("star wars")) return "#f0f0f0ff";
        if (normalized.includes("gaming legends")) return "#7058edff";
        return fallback;
    };

    const tiles = displayItems.map((item, index) => {
        const featured = useFeaturedMosaic && index < featuredCount;
        const fallback = fallbackPalette(item.setKey || item.id);
        const primary = apiColor(item.backgroundColors?.[0], fallback[0]);
        const secondary = apiColor(item.backgroundColors?.[1], fallback[1]);
        const tertiary = apiColor(item.backgroundColors?.[2], item.backgroundColors?.length ? secondary : fallback[2]);
        const textBackground = apiColor(item.textBackgroundColor, "#161616ff");
        const accent = rarityAccent(item.rarity, tertiary);
        const character = /outfit|character|skin/i.test(item.type);
        // The API icon is framed for square portrait cards; display artwork
        // is reserved for the tall offers.
        const preview = selectMissingPreview(item, featured);
        const imageUrl = preview.url;
        const introduced = introductionBadge(item.introduced);
        const shape = missingArtworkShape(item, featured);
        const artworkClass = ` fs-preview-${preview.kind} fs-shape-${shape}`;
        const trackSeparator = /jam track|music/i.test(item.type) ? item.name.indexOf(" - ") : -1;
        const rawDisplayName = trackSeparator >= 0 ? item.name.slice(trackSeparator + 3) : item.name;
        const displayName = trackSeparator >= 0
            ? rawDisplayName.replace(/\s*\([^)]*(?:\.{3}|…)[^)]*\)\s*$/, "").trim()
            : rawDisplayName;
        return `<article class="fs-offer${featured ? " fs-featured" : " fs-compact"}${!useFeaturedMosaic && shape === "wide" && !character ? " fs-wide" : ""}" style="--fs-c1:${primary};--fs-c2:${secondary};--fs-c3:${tertiary};--fs-text-bg:${textBackground};background:radial-gradient(ellipse at 50% 42%,var(--fs-c1) 0%,var(--fs-c2) 62%,var(--fs-c3) 100%)"><div class="fs-days${item.badgeLabel ? item.badgeLabel === "PAUSED" ? " fs-paused" : item.badgeLabel === "EVERY RETURN" ? " fs-recurring" : " fs-once" : ""}">${escapeHtml(item.badgeLabel || `${item.daysMissing.toLocaleString("en-US")} DAYS`)}</div><div class="fs-art${character ? " fs-character" : " fs-object"}${artworkClass}">${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" />` : `<div class="fs-placeholder">?</div>`}<div class="fs-meta">${introduced ? `<div class="fs-intro" data-min-size="${smallText ? 5 : 6}">${introductionBadgeHtml(item.introduced)}</div>` : ""}${item.previousAppearances !== undefined ? `<div class="fs-appearances" title="Shop appearances including today"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5v6h6M3 11a9 9 0 1 1 2 7M12 7v5l3 2"/></svg>${(item.previousAppearances + 1).toLocaleString("en-US")}×</div>` : ""}</div></div><div class="fs-accent" style="background:${accent}"></div><div class="fs-label"><h2 class="fs-fit" data-min-size="${smallText ? 7 : 10}">${escapeHtml(displayName)}</h2><div class="fs-price"><b>${Number.isSafeInteger(item.price) && item.price >= 0 ? `${item.price.toLocaleString("en-US")}${item.priceIsCurrent !== undefined ? "*" : ""} ${coin}` : ""}</b></div></div></article>`;
    }).join("");

    const nextTiles = displayItems.slice(0, 4).map(item => {
        const primary = apiColor(item.backgroundColors?.[0], "#164bb0ff");
        const secondary = apiColor(item.backgroundColors?.[1], "#092a7aff");
        return `<article style="background:radial-gradient(ellipse at 50% 35%,${primary},${secondary})">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" />` : ""}</article>`;
    }).join("");

    return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Fortnite Display";src:${fortniteDisplayFont || "local(\"Impact\")"};font-style:normal;font-weight:400;font-display:block}
@font-face{font-family:"Fortnite UI";src:${fortniteSmallFont || "local(\"Arial Black\")"};font-style:normal;font-weight:400;font-display:block}
*{box-sizing:border-box}html,body{margin:0;background:#1a3ba0ff;color:#fff;font-family:"Fortnite UI","Arial Black",Arial,sans-serif;text-rendering:geometricPrecision}html{overflow-x:hidden}body{width:1440px;${useFeaturedMosaic ? "height:780px;" : "min-height:780px;"}padding:0 64px ${useFeaturedMosaic ? 0 : 88}px;background:radial-gradient(ellipse 66% 105% at 49% 49%,#3474d5ff 0%,#2c63c4ff 33%,#224ab5ff 68%,#1a3ba0ff 100%);position:relative;overflow:hidden}.fs-nav{height:35px;margin:0 -64px;display:flex;align-items:center;justify-content:center;gap:34px;background:#173f9ac7;position:relative;z-index:4;font-size:13px}.fs-nav>span{position:relative;left:-48px;white-space:nowrap}.fs-nav>b{position:relative;padding:6px 13px 7px;background:#fff;color:#073e94;box-shadow:0 3px 0 #c9e9ff;transform:translateX(-48px) skew(-2deg);font-weight:400}.fs-nav>b:before{content:"!";position:absolute;left:-6px;top:-9px;padding:0 3px;background:#ffe500;color:#083a8c;font-family:"Fortnite Display",sans-serif;font-size:15px;line-height:18px;transform:skew(2deg)}.fs-friends{position:absolute;left:7px;top:1px;width:58px;height:33px;display:flex;align-items:center;justify-content:center;gap:8px;border:3px solid #086ad5;background:#123895;color:#58eaff;font-size:18px}.fs-party-icon{position:relative;width:23px;height:20px}.fs-party-icon:before{content:"";position:absolute;left:8px;top:0;width:7px;height:7px;border-radius:50%;background:#55edff;box-shadow:-7px 3px 0 -1px #55edff,7px 3px 0 -1px #55edff}.fs-party-icon:after{content:"";position:absolute;left:5px;bottom:0;width:13px;height:10px;border-radius:7px 7px 2px 2px;background:#55edff;box-shadow:-7px 2px 0 -2px #55edff,7px 2px 0 -2px #55edff}.fs-wallet{position:absolute;right:62px;top:1px;height:33px;display:flex;align-items:center;gap:7px;padding:0 12px;border:3px solid #0867d2;background:#123895;color:#5de8ff;font-size:19px}.fs-wallet .fs-vbuck{width:25px;height:25px}.fs-menu{position:absolute;right:8px;top:1px;width:42px;height:33px;display:grid;align-content:center;gap:4px;padding:0 9px;border:3px solid #0867d2;background:#123895}.fs-menu i{height:3px;background:#55eaff;transform:skew(-6deg)}.fs-section{display:flex;align-items:baseline;margin:81px 0 5px 22px;gap:8px}.fs-section h1{margin:0;font-family:"Fortnite Display",sans-serif;font-size:36px;line-height:.82;font-style:italic;font-weight:400;text-shadow:2px 2px 0 #173f9a;-webkit-text-stroke:.25px #fff}.fs-section span{color:#abe9ff;font-size:19px;font-style:italic}.fs-grid{display:grid;grid-template-columns:repeat(${columns},${tileWidth}px);${useFeaturedMosaic ? `grid-template-rows:repeat(2,${rowHeight}px);grid-auto-flow:column dense;` : `grid-auto-rows:${rowHeight}px;grid-auto-flow:row dense;`}justify-content:start;gap:${horizontalGap}px;margin-left:22px}.fs-offer{min-width:0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 4px 0 #173f9a}.fs-featured{grid-row:span 2}.fs-art{position:relative;min-height:0;flex:1;overflow:hidden}.fs-art:after{content:"";position:absolute;z-index:1;inset:0;background:linear-gradient(180deg,transparent 78%,var(--fs-text-bg) 100%);opacity:.1;pointer-events:none}.fs-art img{width:100%;height:100%;filter:drop-shadow(0 9px 7px #5d164844)}.fs-featured .fs-character img{object-fit:cover;transform:scale(1.025);transform-origin:center 38%}.fs-featured .fs-object img{object-fit:contain;padding:3%}.fs-compact .fs-art img{object-fit:contain;padding:1.5%}.fs-placeholder{height:100%;display:grid;place-items:center;color:#ffffff66;font-family:"Fortnite Display",sans-serif;font-size:70px}.fs-days{position:absolute;z-index:3;left:-5px;top:-5px;min-width:${smallText ? 108 : 137}px;padding:${smallText ? "7px 13px 6px" : "8px 18px 6px"};background:#ed208d;color:#fff;clip-path:polygon(0 8%,100% 0,94% 100%,2% 92%);filter:drop-shadow(5px 4px 0 #ad0c65);font-family:"Fortnite Display",sans-serif;font-size:${smallText ? 15 : 20}px;line-height:.92;font-style:italic;text-align:center;white-space:nowrap;transform:rotate(-1deg);-webkit-text-stroke:.2px #fff}.fs-plus{position:absolute;z-index:2;right:9px;bottom:8px;color:#fff;font-family:Arial,sans-serif;font-size:${smallText ? 24 : 30}px;font-weight:1000;line-height:.7;text-shadow:2px 2px #0003}.fs-accent{height:${smallText ? 10 : 13}px;flex:none;margin-top:${smallText ? -5 : -6}px;position:relative;z-index:3;clip-path:polygon(0 54%,100% 0,100% 46%,0 100%)}.fs-label{height:${smallText ? 54 : 64}px;flex:none;margin-top:${smallText ? -6 : -7}px;padding:${smallText ? "10px 9px 4px" : "12px 9px 4px"};background:#1c1b1b;clip-path:polygon(0 ${smallText ? 6 : 7}px,100% 0,100% 100%,0 100%)}.fs-label h2{width:89.3%;height:${smallText ? 20 : 24}px;margin:0 auto;text-align:center;font-family:"Fortnite Display",sans-serif;font-size:${smallText ? 16 : 20}px;line-height:1;font-weight:400;font-style:italic;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;-webkit-text-stroke:.22px currentColor;transform:scaleX(1.12)}.fs-price{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:0;color:#bdc6cf}.fs-price span{font-size:${smallText ? 6 : 8}px;white-space:nowrap}.fs-price b{display:flex;align-items:center;gap:4px;font-family:"Fortnite Display",sans-serif;font-size:${smallText ? 14 : 17}px;font-style:italic;font-weight:400;white-space:nowrap;-webkit-text-stroke:.12px currentColor;transform:scaleX(1.12);transform-origin:right center}.fs-vbuck{width:${smallText ? 17 : 20}px;height:${smallText ? 17 : 20}px;display:inline-block;flex:none;background:url("${vBuckImage || ""}") center/contain no-repeat;filter:drop-shadow(1px 1px 0 #1c4d72);font-style:normal}.fs-vbuck-fallback{width:18px;height:18px;display:grid;place-items:center;border:2px solid #bde9ff;border-radius:50%;font-size:8px}.fs-edge{position:absolute;left:0;top:143px;width:6px;height:317px;background:#d6f6ff;clip-path:polygon(0 0,100% 3%,100% 97%,0 100%);opacity:.92}.fs-scroll{height:6px;margin:22px 0 0 161px;width:1008px;background:#173e9b}.fs-scroll i{display:block;width:51%;height:100%;background:#20c8ff}.fs-next{height:116px;margin:42px 22px 0;position:relative;overflow:hidden}.fs-next-grid{height:116px;display:grid;grid-template-columns:repeat(4,${tileWidth}px);gap:${horizontalGap}px;opacity:.25}.fs-next-grid article{overflow:hidden}.fs-next-grid img{width:100%;height:100%;object-fit:cover}.fs-next>b{position:absolute;left:50%;top:13px;transform:translateX(-50%);padding:9px 17px;border-radius:24px;background:#0c8be2;color:#71dfff;font-size:17px;font-style:italic}.fs-footer{position:absolute;right:20px;bottom:8px;text-align:right;color:#a7d6ff;font-size:8px}.fs-footer b{display:block;margin-top:5px;padding:7px 11px;background:#173f9a;border:2px solid #2b68bd;color:#6feaff;font-size:10px}.fs-dense{height:auto;min-height:780px;overflow:hidden}.fs-dense .fs-scroll{margin-top:24px}.fs-dense .fs-footer{bottom:12px}
.fs-offer{position:relative;overflow:visible}.fs-label{overflow:hidden}
.fs-section{margin:75px 0 24px 22px}
.fs-section h1{font-style:normal;-webkit-text-stroke:0;transform:none}
.fs-days{font-style:normal;-webkit-text-stroke:0;transform:rotate(-1deg);left:-5px;top:-4px;min-width:0;padding:${smallText ? "6px 12px 5px" : "7px 14px 6px"};font-size:${smallText ? 14 : 18}px;line-height:1;background:#f22683;clip-path:polygon(0 0,100% 0,96% 100%,2% 100%);filter:none;isolation:isolate}
.fs-days:before{content:"";position:absolute;inset:3px 4px 4px 5px;background:#d60a67;clip-path:polygon(0 0,100% 0,97% 100%,0 100%);z-index:-1}
.fs-days.fs-paused{background:#a6b7cf}.fs-days.fs-paused:before{background:#425574}.fs-days.fs-recurring{background:#3ee8c0}.fs-days.fs-recurring:before{background:#087c73}.fs-days.fs-once{background:#54ccff}.fs-days.fs-once:before{background:#1262b0}
.fs-label h2{position:relative;top:5px;width:100%;margin-left:auto;margin-right:auto;overflow:visible;text-overflow:clip;font-family:"Fortnite Display",sans-serif;font-size:${smallText ? 16 : 20}px;font-style:normal;font-weight:400;letter-spacing:0;-webkit-text-stroke:0;transform:none}
.fs-price{position:relative;top:5px;justify-content:flex-end}.fs-price span{display:none}.fs-price b{font-family:"Fortnite Display",sans-serif;font-style:normal;font-weight:400;-webkit-text-stroke:0;transform:none}
.fs-intro{position:absolute;z-index:2;left:7px;bottom:9px;max-width:calc(100% - 47px);padding:${smallText ? "3px 8px 2px 6px" : "4px 10px 3px 7px"};overflow:visible;background:#10245dd9;border-left:3px solid #62ddff;clip-path:polygon(0 0,100% 0,94% 100%,0 100%);color:#dff8ff;font-family:"Fortnite UI",sans-serif;font-size:${smallText ? 7 : 8}px;font-style:normal;line-height:1;letter-spacing:.15px;text-shadow:1px 1px 0 #07163f;text-transform:uppercase;white-space:nowrap;transform:none}
.fs-featured .fs-art.fs-prepared-art img{object-fit:contain;padding:4px;transform:none}
.fs-featured .fs-art.fs-fallback-art img{object-fit:contain;padding:4px;transform:none}
.fs-compact .fs-art img{object-fit:contain;padding:3px;transform:none}
.fs-featured .fs-art.fs-character img{object-fit:cover;object-position:center 18%;padding:0;transform:none}
.fs-compact .fs-art.fs-character img{display:block;object-fit:contain;object-position:center bottom;padding:6px 5px 0;transform:none}
.fs-featured .fs-art.fs-preview-composition img,.fs-compact .fs-art.fs-preview-composition img{object-fit:contain;object-position:center center;padding:0;transform:none;filter:none}
.fs-featured .fs-art.fs-preview-portrait img{object-fit:contain;object-position:center bottom;padding:3% 2% 0;transform:none}
.fs-compact .fs-art.fs-preview-portrait img{object-fit:contain;object-position:center bottom;padding:4px 3px 0;transform:none}
.fs-art.fs-preview-equipment img{object-fit:contain;object-position:center center;padding:4% 4% 7%;transform:none}
.fs-art.fs-preview-silhouette img{object-fit:contain;object-position:center center;padding:7% 9% 12%;transform:none;filter:none}
.fs-art.fs-preview-album img{object-fit:contain;object-position:center center;padding:5% 5% 12%;transform:none;filter:none}
.fs-label{position:relative;padding-left:8px;padding-right:8px;box-shadow:none}
.fs-label h2{top:2px}
.fs-price{position:absolute;top:auto;bottom:0;left:0;right:0;height:${smallText ? 20 : 24}px;margin:0;padding:0 7px;background:#0b0b0b}
.fs-appearances{position:absolute;right:7px;bottom:10px;z-index:4;display:flex;align-items:center;gap:4px;padding:4px 6px;background:#10245de6;color:#ecfaff;font-family:"Fortnite Display",sans-serif;font-size:${smallText ? 12 : 15}px;line-height:1;white-space:nowrap;clip-path:polygon(4px 0,100% 0,100% 100%,0 100%)}
.fs-appearances svg{width:12px;height:12px;stroke:#8de6ff;fill:none;stroke-width:2;flex:none}
.fs-intro{max-width:calc(100% - 75px)}
.fs-meta{position:absolute;z-index:4;left:7px;right:7px;bottom:9px;display:flex;align-items:center;justify-content:space-between;gap:6px;background:transparent}
.fs-art:after{display:none}
.fs-wide{grid-column:span 2}
.fs-offer .fs-art.fs-object.fs-preview-equipment>img{display:block;object-fit:contain;object-position:center;padding:4% 4% 7%;transform:none}
.fs-offer .fs-art.fs-object.fs-preview-equipment.fs-shape-wide>img{padding:4% 3% 7%}
.fs-offer .fs-art.fs-object.fs-preview-equipment.fs-shape-tall>img{padding:3% 3% 6%}
.fs-meta .fs-intro{position:relative;isolation:isolate;left:auto;bottom:auto;max-width:calc(100% - 55px);display:inline-flex;align-items:center;gap:3px;line-height:1.2;padding:3px 13px 3px 6px;clip-path:none;background:transparent;overflow:visible}
.fs-meta .fs-intro:before{content:"";position:absolute;inset:0;z-index:-1;background:#10245dd9;clip-path:polygon(0 0,100% 0,calc(100% - 7px) 100%,0 100%);pointer-events:none}
.fs-meta .fs-appearances{position:relative;right:auto;bottom:auto;margin-left:auto;flex:none}
.fs-offer .fs-art .fs-meta img.fs-season-emoji{display:block;width:1.3em;height:1.3em;flex:none;margin:0;object-fit:contain;object-position:center;padding:0;filter:none;transform:none}
.fs-season-label{display:block;min-width:0;flex:1 1 auto;white-space:nowrap}
.fs-offer{box-shadow:none}
.fs-next{margin-top:32px;height:80px}.fs-next-grid{height:80px}
.fs-next-grid img{object-fit:contain;transform:none}
.fs-next>b{display:flex;align-items:center;gap:7px;padding:5px 14px 5px 7px;font-family:"Fortnite Display",sans-serif;font-style:normal}
.fs-down{position:relative;width:29px;height:29px;display:inline-block;flex:none;border-radius:50%;background:#086ac8}
.fs-down:before{content:"";position:absolute;left:8px;top:7px;width:10px;height:10px;border-left:4px solid #40c9ff;border-bottom:4px solid #40c9ff;transform:rotate(-45deg)}
body{background:radial-gradient(ellipse 70% 100% at 49% 48%,#078ee9 0%,#086ace 42%,#0c49b5 76%,#123b9f 100%)}
.fs-nav{background:transparent}
body.fs-mosaic,body.fs-dense{height:auto;min-height:0;padding:42px 64px 26px}
.fs-section{margin:0 22px 30px;display:flex;align-items:center;justify-content:space-between;gap:24px}
.fs-report-date{flex:none;text-align:right;font-family:"Fortnite Display",sans-serif;font-size:25px;font-style:normal;line-height:1;color:#eaf8ff;letter-spacing:.4px}
.fs-report-date small{display:block;margin-bottom:5px;font-family:"Fortnite UI",sans-serif;font-size:10px;letter-spacing:1.4px;color:#a9dcff}
.fs-report-footer{margin:24px 0 0 22px;color:#a9dcff;font-size:10px;letter-spacing:.5px;min-height:48px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.fs-bot-logo{display:block;width:48px;height:48px;object-fit:contain;flex:none;border-radius:8px}
${labels ? `body.fs-dense{width:${Math.max(720, Math.min(1440, columns * (tileWidth + horizontalGap) - horizontalGap + 150))}px}.fs-grid{justify-content:center}.fs-wide{grid-column:span 1}.fs-price{display:none}.fs-label{height:42px!important;display:flex;align-items:center;justify-content:center}.fs-label h2{position:static;margin:0;max-width:100%}.fs-section{flex-wrap:wrap;gap:16px}.fs-section h1{font-size:32px}.fs-profile{margin-left:auto;display:flex;align-items:center;gap:10px;padding:10px 16px 10px 10px;background:#082c6899;border:1px solid #55c9ff66;border-radius:12px;max-width:330px;min-width:0}.fs-profile img,.fs-avatar-placeholder{width:48px;height:48px;border-radius:9px;object-fit:cover;flex:none}.fs-profile>div{min-width:0}.fs-profile small{display:block;color:#9bddff;font-size:8px;letter-spacing:1px;margin-bottom:4px}.fs-profile strong{display:block;font-family:"Fortnite Display",sans-serif;font-size:23px;white-space:nowrap}.fs-report-date{font-size:18px}.fs-report-date small{font-size:8px}.fs-report-footer{margin-top:18px}` : ""}
</style></head><body class="${useFeaturedMosaic ? "fs-mosaic" : "fs-dense"}"><header class="fs-section"><h1>${escapeHtml(labels?.title || "BACK FROM THE VAULT")}</h1>${labels?.profileName ? `<div class="fs-profile">${labels.profileAvatar ? `<img src="${escapeHtml(labels.profileAvatar)}" alt="" onerror="this.style.visibility=\'hidden\'" />` : `<span class="fs-avatar-placeholder">?</span>`}<div><small>WATCHLIST OWNER</small><strong class="fs-fit" data-min-size="14">${escapeHtml(labels.profileName.slice(0, 64))}</strong></div></div>` : ""}<div class="fs-report-date"><small>${escapeHtml(labels?.subtitle || "SHOP DATE · UTC")}</small>${escapeHtml(shopDateLabel)}</div></header><main class="fs-grid">${tiles}</main><footer class="fs-report-footer">${escapeHtml(labels?.footer || `${items.length} RETURNING ITEMS · ${minimumDays}+ DAYS AWAY`)}${items.some(item => item.price !== undefined && item.priceIsCurrent !== undefined) ? " · * LATEST KNOWN PRICE · NOT HISTORICAL" : ""}${logoUrl ? `<img class="fs-bot-logo" src="${escapeHtml(logoUrl)}" alt="Creeper Bot" onerror="this.style.display=\'none\'" />` : ""}</footer><script>window.fitFortniteText=()=>{document.querySelectorAll(".fs-fit").forEach(node=>{const element=node;const minimum=Number(element.dataset.minSize||7);let size=parseFloat(getComputedStyle(element).fontSize);while(element.scrollWidth>element.clientWidth&&size>minimum){size=Math.max(minimum,size-.5);element.style.fontSize=size+"px"}})};document.fonts.ready.then(window.fitFortniteText);</script></body></html>`;
}

function buildSupplyDropHtml(items: MissingCosmeticImageItem[], shopDateLabel: string, minimumDays = 300): string {
    const crates = items.map((item, index) => `<article><div class="crate-top"><span>CRATE ${String(index + 1).padStart(2, "0")}</span><b>RECOVERED</b></div><div class="crate-art">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" />` : "?"}<i>${escapeHtml(item.rarity || item.type)}</i></div><div class="crate-copy"><small>${escapeHtml(item.type)}</small><h2>${escapeHtml(item.name)}</h2><div><strong>${item.daysMissing.toLocaleString("en-US")}</strong><span>DAYS LOST</span></div><p>LAST SIGNAL · ${escapeHtml(item.lastSeenLabel)}</p></div></article>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:#171916;color:#f5f0dc;font-family:Arial,sans-serif}body{width:1440px;min-height:900px;padding:54px 62px 65px;background:repeating-linear-gradient(135deg,#171916 0 40px,#1d201c 40px 80px)}header{display:grid;grid-template-columns:1fr auto;align-items:end;padding-bottom:27px;border-bottom:5px solid #f06a24}.kicker{color:#f06a24;font-size:14px;font-weight:1000;letter-spacing:5px}.title{margin-top:6px;font-size:65px;line-height:.9;font-style:italic;font-weight:1000}.manifest{text-align:right;color:#9ca591;font-size:13px;font-weight:1000;letter-spacing:2px}.manifest b{display:block;color:#f5f0dc;font-size:29px;margin-top:9px}main{display:grid;grid-template-columns:repeat(${Math.min(items.length, 4)},300px);justify-content:center;gap:24px;margin-top:34px}article{background:#292d27;border:2px solid #697064;box-shadow:8px 8px 0 #090a09;clip-path:polygon(0 0,94% 0,100% 4%,100% 100%,6% 100%,0 96%)}.crate-top{height:40px;padding:12px 14px;display:flex;justify-content:space-between;background:repeating-linear-gradient(-45deg,#f06a24 0 10px,#21241f 10px 20px);font-size:10px;font-weight:1000;letter-spacing:1.5px}.crate-top span,.crate-top b{padding:2px 6px;background:#171916}.crate-art{height:245px;position:relative;overflow:hidden;background:radial-gradient(circle,#8b977d,#3d463a 65%,#242a22)}.crate-art img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 10px 8px #000)}.crate-art i{position:absolute;left:13px;bottom:12px;padding:7px 10px;background:#f06a24;color:#171916;font-size:10px;font-weight:1000;font-style:normal;text-transform:uppercase}.crate-copy{padding:18px}.crate-copy small{color:#f06a24;font-weight:1000;letter-spacing:2px;text-transform:uppercase}.crate-copy h2{height:60px;margin:8px 0 15px;font-size:22px;line-height:1.03;font-style:italic;text-transform:uppercase;overflow:hidden}.crate-copy div{display:flex;align-items:baseline;gap:8px;border-top:2px solid #697064;padding-top:12px}.crate-copy strong{font-size:39px;color:#f6c744}.crate-copy span{font-size:10px;font-weight:1000;letter-spacing:1px}.crate-copy p{margin:9px 0 0;color:#aeb6a7;font-size:11px;font-weight:900}footer{margin-top:36px;display:flex;justify-content:space-between;color:#91998d;font-size:12px;font-weight:1000;letter-spacing:2px;text-transform:uppercase}footer b{color:#f06a24}</style></head><body><header><div><div class="kicker">LOOT RECOVERY UNIT</div><div class="title">SUPPLY DROP MANIFEST</div></div><div class="manifest">ROTATION // ${escapeHtml(shopDateLabel)}<b>${items.length} CRATES RECOVERED</b></div></header><main>${crates}</main><footer><span>Recovery condition · <b>returned</b></span><span>Missing ${minimumDays}+ days</span></footer></body></html>`;
}

function buildIslandBroadcastHtml(items: MissingCosmeticImageItem[], shopDateLabel: string, minimumDays = 300): string {
    const stories = items.map((item, index) => `<article class="${index === 0 && items.length > 1 ? "lead" : ""}"><div class="broadcast-art">${item.imageUrl ? `<img src="${escapeHtml(item.imageUrl)}" alt="" />` : "?"}<span>LIVE RETURN</span></div><div class="broadcast-copy"><small>${escapeHtml(item.type)} · ${escapeHtml(item.rarity || "COSMETIC")}</small><h2>${escapeHtml(item.name)}</h2><div><strong>${item.daysMissing.toLocaleString("en-US")}</strong><span>DAYS SINCE LAST SEEN<br>${escapeHtml(item.lastSeenLabel)}</span></div></div></article>`).join("");
    return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;background:#071e2e;color:#fff;font-family:Arial,sans-serif}body{width:1440px;min-height:900px;padding:46px 58px 66px;background:radial-gradient(circle at 85% 10%,#1aa78b55,transparent 35%),linear-gradient(150deg,#041722,#0a3343)}header{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #4de3bd;padding-bottom:22px}.network{font-size:15px;font-weight:1000;letter-spacing:4px}.network b{display:block;margin-top:5px;font-size:54px;letter-spacing:-2px;font-style:italic}.live{padding:13px 17px;background:#ff365c;font-size:12px;font-weight:1000;letter-spacing:2px}main{display:grid;grid-template-columns:repeat(${items.length === 1 ? 1 : 4},1fr);gap:18px;margin-top:30px}article{min-width:0;background:#0d3b4b;border-bottom:5px solid #4de3bd}.lead{grid-column:span 2;grid-row:span 2}.broadcast-art{height:220px;position:relative;overflow:hidden;background:radial-gradient(circle,#45d9c1,#107f85 60%,#07505d)}.lead .broadcast-art{height:500px}.broadcast-art img{width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 12px 10px #031519)}.broadcast-art span{position:absolute;left:0;bottom:0;padding:8px 12px;background:#ff365c;font-size:10px;font-weight:1000;letter-spacing:1.5px}.broadcast-copy{padding:17px}.broadcast-copy small{color:#70e8cf;font-size:10px;font-weight:1000;letter-spacing:1.5px;text-transform:uppercase}.broadcast-copy h2{height:48px;margin:8px 0 12px;font-size:21px;line-height:1.02;font-style:italic;text-transform:uppercase;overflow:hidden}.lead .broadcast-copy h2{font-size:35px;height:auto}.broadcast-copy div{display:flex;align-items:center;gap:11px;border-top:1px solid #39707c;padding-top:10px}.broadcast-copy strong{font-size:34px;color:#ffe34c}.broadcast-copy span{font-size:9px;line-height:1.35;font-weight:900;color:#b4d8da}.lead .broadcast-copy strong{font-size:52px}.ticker{margin-top:30px;display:flex;background:#ff365c;overflow:hidden}.ticker b{padding:13px 18px;background:#fff;color:#071e2e;font-size:12px;letter-spacing:2px}.ticker span{padding:13px 18px;font-size:12px;font-weight:1000;letter-spacing:2px;white-space:nowrap}footer{display:flex;justify-content:space-between;margin-top:24px;color:#7db1b8;font-size:12px;font-weight:1000;letter-spacing:2px;text-transform:uppercase}</style></head><body><header><div class="network">ISLAND NEWS NETWORK<b>THE RETURN REPORT</b></div><div class="live">● LIVE · ITEM SHOP</div></header><main>${stories}</main><div class="ticker"><b>BREAKING</b><span>${items.length} COSMETIC${items.length === 1 ? "" : "S"} BACK AFTER ${minimumDays}+ DAYS AWAY</span></div><footer><span>Broadcast ${escapeHtml(shopDateLabel)}</span><span>Verified shop history</span></footer></body></html>`;
}

export async function renderMissingCosmeticsImage(
    items: MissingCosmeticImageItem[],
    shopDateLabel: string,
    variant: MissingCosmeticsImageVariant = "vault-grid",
    minimumDays = 300,
    logoUrl?: string,
    labels?: ShopImageLabels,
): Promise<MissingCosmeticsRender> {
    if (variant === "item-shop") items = await prepareMissingPreviews(await applyMissingPalettes(items));
    const { default: puppeteer } = await Function('return import("puppeteer")')();
    const browser: Browser = await puppeteer.launch({
        headless: true,
        executablePath: getChromiumExecutablePath(),
        protocolTimeout: 30_000,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    try {
        const page = await browser.newPage();
        // Double pixel density for sharp Discord attachments; bound large reports.
        await page.setViewport({ width: 1440, height: variant === "item-shop" ? 780 : 810, deviceScaleFactor: items.length > 100 ? 1 : 2 });
        const html = variant === "locker-files"
            ? buildLockerFilesHtml(items, shopDateLabel, minimumDays)
            : variant === "storm-scan"
                ? buildStormScanHtml(items, shopDateLabel, minimumDays)
                : variant === "return-pass"
                    ? buildReturnPassHtml(items, shopDateLabel, minimumDays)
                    : variant === "bus-arrivals"
                        ? buildBusArrivalsHtml(items, shopDateLabel, minimumDays)
                        : variant === "item-shop"
                            ? buildFortniteItemShopReplicaHtml(items, shopDateLabel, minimumDays, logoUrl, labels)
                        : variant === "supply-drop"
                            ? buildSupplyDropHtml(items, shopDateLabel, minimumDays)
                            : variant === "island-broadcast"
                                ? buildIslandBroadcastHtml(items, shopDateLabel, minimumDays)
                : buildHtml(items, shopDateLabel, minimumDays);
        await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all(Array.from(document.images).map(image => {
                if (image.complete) return Promise.resolve();
                return new Promise<void>(resolve => {
                    image.addEventListener("load", () => resolve(), { once: true });
                    image.addEventListener("error", () => resolve(), { once: true });
                });
            }));
        });
        const image = Buffer.from(await page.screenshot({
            type: "png",
            fullPage: variant !== "item-shop",
            captureBeyondViewport: true,
            ...(variant === "item-shop" ? { clip: await page.evaluate(() => ({ x: 0, y: 0, width: Math.ceil(document.body.getBoundingClientRect().width), height: Math.ceil(document.body.getBoundingClientRect().height) })) } : {}),
        }));
        return { image, close: () => browser.close(), artworkWarnings: variant === "item-shop" ? missingArtworkWarnings(items) : [] };
    } catch (error) {
        await browser.close().catch(() => { });
        throw error;
    }
}
