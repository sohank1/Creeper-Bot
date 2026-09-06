import axios from "axios";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { MissingCosmeticImageItem } from "./MissingCosmeticsImage";

const cache = new Map<string, Promise<number | undefined>>();
const validColor = (value: string) => /^#?(?:[\da-f]{6}|[\da-f]{8})$/i.test(value || "");
export const hasShopPalette = (item: MissingCosmeticImageItem) => Boolean(item.backgroundColors?.some(validColor));

export function dominantHue(pixels: Uint8ClampedArray | Uint8Array): number | undefined {
    const buckets = Array.from({ length: 24 }, () => ({ weight: 0, x: 0, y: 0 }));
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 180) continue; // Transparent margins must not choose the palette.
        const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
        if (delta < .12 || max < .18 || min > .88) continue; // Ignore black/white silhouettes.
        let hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
        hue = (hue * 60 + 360) % 360;
        const saturation = delta / max;
        // Avoid letting faces/beige materials outweigh a costume's saturated accents.
        const skinWeight = hue > 12 && hue < 48 && saturation < .55 ? .12 : 1;
        const weight = saturation * saturation * skinWeight;
        const bucket = buckets[Math.floor(hue / 15)];
        bucket.weight += weight;
        bucket.x += Math.cos(hue * Math.PI / 180) * weight;
        bucket.y += Math.sin(hue * Math.PI / 180) * weight;
    }
    const winner = buckets.reduce((a, b) => a.weight > b.weight ? a : b);
    return winner.weight > .5 ? (Math.atan2(winner.y, winner.x) * 180 / Math.PI + 360) % 360 : undefined;
}

function hex(h: number, s: number, l: number) {
    const a = s * Math.min(l, 1 - l);
    const channel = (n: number) => {
        const k = (n + h / 30) % 12;
        return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0");
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export function fallbackPalette(key: string, hue?: number): string[] {
    let hash = 2166136261;
    for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    const selectedHue = hue ?? [195, 215, 260, 285, 335, 15, 35, 155][(hash >>> 0) % 8];
    // Broad pale spotlight, saturated midtone, darker outer edge: the shop's treatment.
    return [hex(selectedHue, .68, .78), hex(selectedHue, .62, .48), hex((selectedHue + 8) % 360, .64, .29)];
}

async function sample(url: string): Promise<number | undefined> {
    if (!/^https:\/\//i.test(url)) return undefined;
    if (!cache.has(url)) {
        if (cache.size >= 512) cache.delete(cache.keys().next().value);
        cache.set(url, (async () => {
            try {
                const response = await axios.get(url, { responseType: "arraybuffer", timeout: 6000, maxContentLength: 8 * 1024 * 1024 });
                const image = await loadImage(Buffer.from(response.data));
                const canvas = createCanvas(48, 48);
                const context = canvas.getContext("2d");
                context.drawImage(image, 0, 0, 48, 48);
                return dominantHue(context.getImageData(0, 0, 48, 48).data);
            } catch { return undefined; }
        })());
    }
    return cache.get(url);
}

export async function applyMissingPalettes(items: MissingCosmeticImageItem[]): Promise<MissingCosmeticImageItem[]> {
    const groups = new Map<string, MissingCosmeticImageItem[]>();
    for (const item of items) {
        const key = item.setKey || item.id;
        groups.set(key, [...(groups.get(key) || []), item]);
    }
    const palettes = new Map<string, string[]>();
    const tasks = [...groups];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(6, tasks.length) }, async () => {
        while (next < tasks.length) {
            const [key, group] = tasks[next++];
            const api = group.find(hasShopPalette);
            if (api) { palettes.set(key, api.backgroundColors); continue; }
            const representative = group.find(item => /outfit|character|skin/i.test(item.type)) || group[0];
            const url = representative.imageUrl || representative.featuredImageUrl;
            palettes.set(key, fallbackPalette(key, url ? await sample(url) : undefined));
        }
    }));
    return items.map(item => hasShopPalette(item) ? item : { ...item, backgroundColors: palettes.get(item.setKey || item.id) });
}
