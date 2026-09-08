import type { MissingCosmeticImageItem } from "./MissingCosmeticsImage";
import axios from "axios";
import { createCanvas, loadImage } from "@napi-rs/canvas";

type PreparedImage = { url: string; framing?: NonNullable<MissingCosmeticImageItem["imageFraming"]> };
const trimmed = new Map<string, Promise<PreparedImage>>();
async function trimTransparentMargin(url: string, alphaThreshold = 128): Promise<PreparedImage> {
    if (!/^https:\/\//.test(url)) return { url };
    const cacheKey = `${alphaThreshold}:${url}`;
    if (!trimmed.has(cacheKey)) {
        if (trimmed.size >= 64) trimmed.delete(trimmed.keys().next().value);
        trimmed.set(cacheKey, (async () => {
            try {
                const response = await axios.get(url, { responseType: "arraybuffer", timeout: 6000, maxContentLength: 8 * 1024 * 1024 });
                const source = await loadImage(Buffer.from(response.data));
                const scale = Math.min(1, 1024 / Math.max(source.width, source.height));
                const canvas = createCanvas(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
                const ctx = canvas.getContext("2d");
                ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
                for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
                    // Ground shadows and near-transparent effects can extend to
                    // the canvas edge (e.g. Jar Jar), shifting/scaling the body.
                    if (pixels[(y * canvas.width + x) * 4 + 3] >= alphaThreshold) {
                        left = Math.min(left, x); right = Math.max(right, x);
                        top = Math.min(top, y); bottom = Math.max(bottom, y);
                    }
                }
                if (right < left) return { url };
                const framing = {
                    aspect: (right - left + 1) / (bottom - top + 1),
                    touchesBottom: bottom >= canvas.height - 2,
                    emptyFraction: 1 - ((right - left + 1) * (bottom - top + 1)) / (canvas.width * canvas.height),
                };
                if (left === 0 && top === 0 && right === canvas.width - 1 && bottom === canvas.height - 1) return { url, framing };
                const padding = Math.ceil(Math.max(right - left + 1, bottom - top + 1) * .025);
                // Keep the artwork's bottom flush: cropped source portraits must
                // meet the tile baseline rather than expose a floating cut edge.
                const output = createCanvas(right - left + 1 + padding * 2, bottom - top + 1 + padding);
                output.getContext("2d").drawImage(canvas, left, top, right - left + 1, bottom - top + 1, padding, padding, right - left + 1, bottom - top + 1);
                return { url: output.toDataURL("image/png"), framing };
            } catch { return { url }; }
        })());
    }
    return trimmed.get(cacheKey)!;
}

export async function prepareMissingPreviews(items: MissingCosmeticImageItem[]): Promise<MissingCosmeticImageItem[]> {
    const result = items.map(item => ({ ...item }));
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(4, result.length) }, async () => {
        while (cursor < result.length) {
            const item = result[cursor++];
            const outfit = /outfit|character|skin/i.test(item.type);
            const equipment = /pickaxe|harvesting|glider|wrap|back bling|backpack|kicks|shoe|instrument/i.test(item.type);
            if (!outfit && !equipment) continue;
            // Preserve translucent equipment effects; only outfits need shadow
            // rejection. Album covers and multi-item compositions stay intact.
            const threshold = outfit ? 128 : 8;
            if (item.imageUrl) {
                const image = await trimTransparentMargin(item.imageUrl, threshold);
                item.imageUrl = image.url; item.imageFraming = image.framing;
            }
            if (item.featuredImageUrl) {
                const image = await trimTransparentMargin(item.featuredImageUrl, threshold);
                item.featuredImageUrl = image.url; item.featuredFraming = image.framing;
            }
        }
    }));
    return result;
}

export type PreviewKind = "portrait" | "composition" | "equipment" | "silhouette" | "album";

export function missingArtworkShape(item: MissingCosmeticImageItem, tall: boolean): "tall" | "wide" | "square" {
    const preview = selectMissingPreview(item, tall);
    const framing = preview.url === item.featuredImageUrl ? item.featuredFraming : item.imageFraming;
    if (!framing) return "square";
    return framing.aspect < .65 ? "tall" : framing.aspect > 1.55 ? "wide" : "square";
}

// Diagnostic hints only: touching an edge may be intentional shop framing.
export function missingArtworkWarnings(items: MissingCosmeticImageItem[]): string[] {
    return items.flatMap(item => {
        const framing = item.featuredFraming || item.imageFraming;
        return [
            ...(!item.imageUrl && !item.featuredImageUrl ? [`${item.id}: missing artwork`] : []),
            ...(framing?.touchesBottom ? [`${item.id}: source touches bottom edge; may be pre-cropped`] : []),
            ...(framing && framing.emptyFraction > .7 ? [`${item.id}: source has over 70% empty bounding-box space`] : []),
        ];
    });
}

// Never substitute a LEGO render for a Battle Royale cosmetic, even when it
// happens to be the first image in the API response.
export function selectBRShopArtwork(images?: Array<{ productTag?: string; image?: string; isDefault?: boolean }>): string | undefined {
    const br = (images || []).filter(image => image.productTag === "Product.BR" && image.image);
    return (br.find(image => image.isDefault) || br[0])?.image;
}

export function selectMissingPreview(item: MissingCosmeticImageItem, tall: boolean): { url: string | null; kind: PreviewKind } {
    const type = item.type.toLowerCase();
    if (/jam track|music|loading screen/.test(type)) return { url: item.imageUrl || item.featuredImageUrl || null, kind: "album" };
    // A full-height shop pose is not a square portrait. Use the cosmetic's
    // purpose-made portrait in compact outfit cards, without zooming into it.
    if (!tall && /outfit|character|skin/.test(type) && item.imageUrl) return { url: item.imageUrl, kind: "portrait" };
    if (/emoticon|emoji|spray|banner/.test(type)) return { url: item.imageUrl || item.featuredImageUrl || null, kind: "silhouette" };
    // Shop display artwork may include extra styles or included items. Never
    // zoom/crop it as though it were a single character render.
    if (item.featuredImageIsShopArtwork && item.featuredImageUrl) return { url: item.featuredImageUrl, kind: "composition" };
    if (/emote/.test(type)) return { url: item.imageUrl || item.featuredImageUrl || null, kind: "silhouette" };
    if (/outfit|character|skin/.test(type)) return {
        url: tall ? item.featuredImageUrl || item.imageUrl : item.imageUrl || item.featuredImageUrl,
        kind: "portrait",
    };
    if (/bundle|pack/.test(type) && !/backpack|back bling/.test(type)) return { url: item.featuredImageUrl || item.imageUrl || null, kind: "composition" };
    return { url: item.imageUrl || item.featuredImageUrl || null, kind: "equipment" };
}
