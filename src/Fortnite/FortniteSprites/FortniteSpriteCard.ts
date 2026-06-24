import axios from "axios";
import { createCanvas, loadImage } from "@napi-rs/canvas/node-canvas";
import { Client, Message, MessageAttachment } from "discord.js";
import Fuse from "fuse.js";
import fs from "fs";
import path from "path";
import { SpriteDataFile, SpriteFamily, SpriteVariant } from "./spriteDataSource";
import { registerComponent } from "../../runtimeDiagnostics";

const COMMAND = "c!spritecard";
const DATA_PATH = path.join(process.cwd(), "src", "Fortnite", "FortniteSprites", "spriteData.json");

const RARITY_COLORS: Record<string, { primary: string; secondary: string }> = {
    rare: { primary: "#2f86ff", secondary: "#123d8f" },
    epic: { primary: "#c45cff", secondary: "#5b2085" },
    legendary: { primary: "#ff9f32", secondary: "#8c4212" },
    mythic: { primary: "#ffd84a", secondary: "#8d6710" },
    special: { primary: "#45efc1", secondary: "#126b68" }
};

type SpriteMatch = { family: SpriteFamily; variant: SpriteVariant };

export class FortniteSpriteCard {
    private data: SpriteDataFile | null = null;
    private dataModifiedAt = 0;
    private cardsRendered = 0;
    private lastRenderAt: string | null = null;
    private lastRenderError: string | null = null;

    constructor(private client: Client) {
        registerComponent("fortniteSpriteCard", this);
        this.client.on("messageCreate", message => void this.handleMessage(message));
    }

    public getDiagnostics() {
        return {
            cardsRendered: this.cardsRendered,
            lastRenderAt: this.lastRenderAt,
            lastRenderError: this.lastRenderError,
            dataLoaded: !!this.data,
            dataModifiedAt: this.dataModifiedAt ? new Date(this.dataModifiedAt).toISOString() : null,
        };
    }

    private async handleMessage(message: Message): Promise<void> {
        if (message.author.bot) return;

        const match = message.content.trim().match(/^c!spritecard(?:\s+(.*))?$/i);
        if (!match) return;

        const query = match[1]?.trim();
        if (!query) {
            await message.channel.send(`Usage: \`${COMMAND} <sprite name or ID>\`\nExample: \`${COMMAND} Gummy Water Sprite\``);
            return;
        }

        try {
            const sprites = this.getSprites();
            const sprite = this.findSprite(query, sprites);
            if (!sprite) {
                const suggestions = this.suggestSprites(query, sprites);
                const hint = suggestions.length ? `\nDid you mean: ${suggestions.map(name => `\`${name}\``).join(", ")}?` : "";
                await message.channel.send(`I couldn't find a sprite matching \`${query}\`.${hint}`);
                return;
            }

            await message.channel.sendTyping();
            const image = await this.renderCard(sprite);
            const filename = `sprite-card-${this.slug(sprite.variant.name)}.png`;
            await message.channel.send({ files: [new MessageAttachment(image, filename)] });
            this.cardsRendered++;
            this.lastRenderAt = new Date().toISOString();
            this.lastRenderError = null;
        } catch (error) {
            console.error("[FortniteSpriteCard] Failed to create card:", error);
            this.lastRenderError = error?.message || String(error);
            await message.channel.send("I couldn't create that sprite card right now. Please try again in a moment.");
        }
    }

    private getSprites(): SpriteMatch[] {
        const modifiedAt = fs.statSync(DATA_PATH).mtimeMs;
        if (!this.data || modifiedAt !== this.dataModifiedAt) {
            this.data = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as SpriteDataFile;
            this.dataModifiedAt = modifiedAt;
        }
        return this.data.families.flatMap(family => family.variants.map(variant => ({ family, variant })));
    }

    private findSprite(query: string, sprites: SpriteMatch[]): SpriteMatch | null {
        const normalized = query.toLowerCase().replace(/^#/, "").trim();
        const exact = sprites.find(({ variant }) => variant.name.toLowerCase() === normalized || String(variant.id) === normalized);
        if (exact) return exact;

        const prefix = sprites.filter(({ variant }) => variant.name.toLowerCase().startsWith(normalized));
        if (prefix.length === 1) return prefix[0];

        const contains = sprites.filter(({ variant }) => variant.name.toLowerCase().includes(normalized));
        return contains.length === 1 ? contains[0] : null;
    }

    private suggestSprites(query: string, sprites: SpriteMatch[]): string[] {
        const fuse = new Fuse(sprites, {
            keys: ["variant.name", "family.displayName", "variant.variant"],
            threshold: 0.45
        });
        return fuse.search(query, { limit: 3 }).map(result => result.item.variant.name);
    }

    private async renderCard({ family, variant }: SpriteMatch): Promise<Buffer> {
        const canvas = createCanvas(1200, 675);
        const ctx = canvas.getContext("2d");
        const colors = RARITY_COLORS[variant.rarity] || RARITY_COLORS.rare;

        const background = ctx.createLinearGradient(0, 0, 1200, 675);
        background.addColorStop(0, "#07111f");
        background.addColorStop(0.58, "#101927");
        background.addColorStop(1, colors.secondary);
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, 1200, 675);

        ctx.globalAlpha = 0.14;
        ctx.fillStyle = colors.primary;
        ctx.beginPath();
        ctx.arc(1030, 75, 330, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        const artX = 715;
        const artY = 90;
        const artSize = 390;
        this.roundRect(ctx, artX, artY, artSize, artSize, 42);
        const artPanel = ctx.createLinearGradient(artX, artY, artX, artY + artSize);
        artPanel.addColorStop(0, `${colors.primary}55`);
        artPanel.addColorStop(1, "#07111fcc");
        ctx.fillStyle = artPanel;
        ctx.fill();
        ctx.strokeStyle = `${colors.primary}aa`;
        ctx.lineWidth = 3;
        ctx.stroke();

        try {
            const response = await axios.get<ArrayBuffer>(variant.imageUrl, { responseType: "arraybuffer", timeout: 10000 });
            const image = await loadImage(Buffer.from(response.data));
            const scale = Math.min((artSize - 42) / image.width, (artSize - 42) / image.height);
            const imageWidth = image.width * scale;
            const imageHeight = image.height * scale;
            ctx.drawImage(image, artX + (artSize - imageWidth) / 2, artY + (artSize - imageHeight) / 2, imageWidth, imageHeight);
        } catch {
            ctx.fillStyle = "#ffffff44";
            ctx.font = "700 30px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("SPRITE", artX + artSize / 2, artY + artSize / 2);
        }

        ctx.textAlign = "left";
        ctx.fillStyle = colors.primary;
        ctx.font = "800 20px sans-serif";
        ctx.fillText(`${variant.rarity.toUpperCase()}  /  ${variant.variant.toUpperCase()}`, 70, 78);

        ctx.fillStyle = "#ffffff";
        ctx.font = "900 54px sans-serif";
        const titleLines = this.drawWrappedText(ctx, variant.name, 70, 145, 585, 60, 2);
        const statsY = titleLines > 1 ? 265 : 220;
        this.drawStat(ctx, "SUMMON COST", variant.summonCost > 0 ? variant.summonCost.toLocaleString() : "Unknown", 70, statsY, colors.primary);
        this.drawStat(ctx, "SPAWN CHANCE", variant.chanceLabel || "Unknown", 285, statsY, colors.primary);
        this.drawStat(ctx, "SPRITE ID", `#${variant.id}`, 505, statsY, colors.primary);

        ctx.fillStyle = "#aebbd0";
        ctx.font = "700 16px sans-serif";
        ctx.fillText("EFFECT", 70, statsY + 105);
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 25px sans-serif";
        this.drawWrappedText(ctx, variant.effectText || family.effectSummary || "No effect information available.", 70, statsY + 142, 580, 34, 3);

        if (variant.specialEffectText) {
            ctx.fillStyle = colors.primary;
            ctx.font = "700 18px sans-serif";
            this.drawWrappedText(ctx, `SPECIAL: ${variant.specialEffectText}`, 70, statsY + 255, 580, 27, 2);
        }

        ctx.fillStyle = "#aebbd0";
        ctx.font = "600 18px sans-serif";
        this.drawWrappedText(ctx, family.location, 735, 535, 390, 25, 2);

        ctx.fillStyle = "#ffffff99";
        ctx.font = "700 15px sans-serif";
        ctx.fillText("FORTNITE SPRITE CARD", 70, 630);
        ctx.textAlign = "right";
        ctx.fillText(family.displayName.toUpperCase(), 1130, 630);
        return canvas.toBuffer("image/png");
    }

    private drawStat(ctx: any, label: string, value: string, x: number, y: number, accent: string): void {
        ctx.fillStyle = "#aebbd0";
        ctx.font = "700 15px sans-serif";
        ctx.fillText(label, x, y);
        ctx.fillStyle = accent;
        ctx.font = "900 28px sans-serif";
        ctx.fillText(value, x, y + 38);
    }

    private drawWrappedText(ctx: any, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number): number {
        const lines = this.measureLines(ctx, text, maxWidth);
        const visible = lines.slice(0, maxLines);
        if (lines.length > maxLines) {
            let last = visible[maxLines - 1];
            while (last.length > 1 && ctx.measureText(`${last}...`).width > maxWidth) last = last.slice(0, -1);
            visible[maxLines - 1] = `${last.trim()}...`;
        }
        visible.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
        return visible.length;
    }

    private measureLines(ctx: any, text: string, maxWidth: number): string[] {
        const words = text.trim().split(/\s+/);
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
            const candidate = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(candidate).width > maxWidth) {
                lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }
        if (line) lines.push(line);
        return lines;
    }

    private roundRect(ctx: any, x: number, y: number, width: number, height: number, radius: number): void {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
    }

    private slug(value: string): string {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }
}
