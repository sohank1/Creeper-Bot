import {
    AutocompleteInteraction,
    BaseCommandInteraction,
    ButtonInteraction,
    CacheType,
    Client,
    CommandInteraction,
    MessageActionRow,
    MessageAttachment,
    MessageButton,
    MessageEmbed,
    MessageSelectMenu,
    SelectMenuInteraction,
    User
} from "discord.js";
import axios from "axios";
import Fuse from "fuse.js";
import * as fs from "fs";
import * as path from "path";
import puppeteer, { Browser } from "puppeteer";
import https from "https";
import { fetchSpriteData, SpriteDataFile, SpriteFamily, SpriteRarity, SpriteVariant, SpriteVariantName, stableSpriteDataJson, validateSpriteData } from "./spriteDataSource";

type SpriteSearchItem = {
    type: "family" | "variant";
    name: string;
    value: string;
    familyKey: string;
    variantId?: number;
    rarity?: SpriteRarity;
    variant?: SpriteVariantName;
    searchable: string;
    starter: boolean;
    priority: number;
};

type SpriteBrowserState = {
    familyKey?: string;
    variantFilter?: "all" | SpriteVariantName;
    rarityFilter?: "all" | SpriteRarity;
    searchQuery?: string;
    starterOnly?: boolean;
    familyPage?: number;
};

type SpriteSearchIntent =
    | { kind: "overview"; state: SpriteBrowserState }
    | { kind: "family"; familyKey: string }
    | { kind: "variant"; variantId: number };

const DATA_PATH = path.join(process.cwd(), "src", "Fortnite", "FortniteSprites", "spriteData.json");
const TOKENS_PATH = path.join(process.cwd(), "src", "Fortnite", "FortniteSprites", "tokens.css");
const DUST_ICON_PATH = path.join(process.cwd(), "assets", "sprite-dust.png");
const appVersion = `v${require("../../../package.json").version}`;
const IMAGE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false });
const RARITY_ORDER: SpriteRarity[] = ["rare", "epic", "legendary", "mythic", "special"];
const RARITY_HEX_COLORS: Record<SpriteRarity, string> = {
    rare: "#3da5ff",
    epic: "#b15cff",
    legendary: "#f6a433",
    mythic: "#ffd44d",
    special: "#5ee0c2"
};
const RARITY_CSS_COLORS: Record<SpriteRarity, string> = {
    rare: "var(--rarity-rare)",
    epic: "var(--rarity-epic)",
    legendary: "var(--rarity-legendary)",
    mythic: "var(--rarity-mythic)",
    special: "var(--rarity-special)"
};
export class FortniteSprites {
    private _data: SpriteDataFile | null = null;
    private fuse: Fuse<SpriteSearchItem> | null = null;
    private searchItems: SpriteSearchItem[] = [];
    private isSyncingSprites = false;
    private refreshTimer?: NodeJS.Timer;
    private imageCache = new Map<string, Buffer>();
    private lastSuccessfulSyncAt: string | null = null;
    private lastSyncError: string | null = null;
    private browser: Browser | null = null;
    private browserPromise: Promise<Browser> | null = null;
    private dustIconDataUrl = fs.existsSync(DUST_ICON_PATH)
        ? `data:image/png;base64,${fs.readFileSync(DUST_ICON_PATH).toString("base64")}`
        : null;

    constructor(private client: Client) {
        this.loadData();
        if (this.shouldSyncSprites()) {
            this.syncLatestSprites();
        } else {
            console.log("[FortniteSprites] Sprite data cache is fresh; skipping startup sync.");
        }
        this.refreshTimer = setInterval(() => this.syncLatestSprites(), 24 * 60 * 60 * 1000);

        this.client.on("interactionCreate", (i) => {
            if (i.isAutocomplete() && i.commandName === "fortnite" && i.options.getSubcommand(false) === "sprites") {
                return void this.resolveAutocomplete(i);
            }
            if (i.isCommand() && i.commandName === "fortnite" && i.options.getSubcommand(false) === "sprites") {
                return void this.replySprites(i);
            }
            if (i.isSelectMenu() && i.customId.startsWith("fn_sprites_")) {
                return void this.handleSelectMenu(i);
            }
            if (i.isButton() && i.customId.startsWith("fn_sprites_")) {
                return void this.handleButton(i);
            }
        });
    }

    private loadData() {
        try {
            if (!fs.existsSync(DATA_PATH)) {
                console.warn("[FortniteSprites] spriteData.json does not exist yet.");
                return;
            }

            const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf8")) as SpriteDataFile;
            parsed.families.forEach(family => {
                family.variants.sort((a, b) => a.summonCost - b.summonCost);
            });
            validateSpriteData(parsed);
            this._data = parsed;
            this.buildSearchIndex();
            this.imageCache.clear();
            console.log(`[FortniteSprites] Loaded ${this.getAllVariants().length} sprites across ${parsed.families.length} families.`);
        } catch (e) {
            console.error("[FortniteSprites] Failed to load spriteData.json", e);
        }
    }

    private shouldSyncSprites() {
        if (!this._data?.fetchedAt) return true;
        const fetchedAt = new Date(this._data.fetchedAt).getTime();
        if (!Number.isFinite(fetchedAt)) return true;
        return Date.now() - fetchedAt > 24 * 60 * 60 * 1000;
    }

    private async syncLatestSprites() {
        if (this.isSyncingSprites) return;
        this.isSyncingSprites = true;

        try {
            const latest = await fetchSpriteData();
            const latestJson = stableSpriteDataJson(latest);
            const existingJson = fs.existsSync(DATA_PATH) ? fs.readFileSync(DATA_PATH, "utf8") : "";
            const normalizeFetchedAt = (json: string) => json.replace(/"fetchedAt":\s*"[^"]+"/, '"fetchedAt": ""');

            if (normalizeFetchedAt(latestJson) !== normalizeFetchedAt(existingJson)) {
                fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
                fs.writeFileSync(DATA_PATH, latestJson, "utf8");
                this.loadData();
                console.log("[FortniteSprites] Sprite data cache updated.");
            }

            this.lastSuccessfulSyncAt = new Date().toISOString();
            this.lastSyncError = null;
        } catch (e: any) {
            this.lastSyncError = e?.message || String(e);
            console.error("[FortniteSprites] Failed to sync sprite data:", this.lastSyncError);
        } finally {
            this.isSyncingSprites = false;
        }
    }

    private buildSearchIndex() {
        if (!this._data) return;

        const aliases: Record<string, string[]> = {
            water: ["shield", "shields", "river", "beach"],
            earth: ["loot", "chest", "rare"],
            fire: ["burst", "damage", "fight", "combat"],
            duck: ["shield", "shields", "emote", "jam", "jamming"],
            ghost: ["shield", "cloak", "invisible", "reload", "night"],
            dream: ["loot", "chest", "random", "storage"],
            punk: ["secret", "mystery", "rare chest"],
            king: ["pickaxe", "melee", "damage"],
            "zero-point": ["heal", "healing", "shield", "bubble", "shield bubble"],
            demon: ["heal", "healing", "siphon", "health", "shield", "elimination"],
            "burnt-peanut": ["heal", "healing", "loot", "mythic", "elimination", "relic"]
        };

        const items: SpriteSearchItem[] = [];

        for (const family of this._data.families) {
            const familyAliases = aliases[family.key] || [];
            const familyVariants = family.variants.map(v => `${v.name} ${this.variantLabel(v.variant)} ${v.rarity}`).join(" ");

            items.push({
                type: "family",
                name: family.displayName,
                value: `family:${family.key}`,
                familyKey: family.key,
                searchable: [
                    family.displayName,
                    family.key,
                    family.effectSummary,
                    family.levelScaling,
                    family.location,
                    familyVariants,
                    familyAliases.join(" ")
                ].join(" "),
                starter: family.variants.some(v => v.starter),
                priority: family.variants.some(v => v.starter) ? 0 : 1
            });

            for (const variant of family.variants) {
                items.push({
                    type: "variant",
                    name: variant.name,
                    value: `variant:${variant.id}`,
                    familyKey: family.key,
                    variantId: variant.id,
                    rarity: variant.rarity,
                    variant: variant.variant,
                    searchable: [
                        variant.name,
                        family.displayName,
                        family.key,
                        variant.rarity,
                        this.variantLabel(variant.variant),
                        variant.variant,
                        variant.chanceLabel,
                        variant.summonCost.toString(),
                        family.location,
                        family.effectSummary,
                        family.levelScaling,
                        familyAliases.join(" ")
                    ].join(" "),
                    starter: variant.starter,
                    priority: variant.starter ? 0 : variant.variant === "Base" ? 1 : 2
                });
            }
        }

        this.searchItems = items;
        this.fuse = new Fuse(items, {
            keys: [
                { name: "name", weight: 1 },
                { name: "searchable", weight: 0.65 },
                { name: "rarity", weight: 0.3 },
                { name: "variant", weight: 0.35 }
            ],
            threshold: 0.35,
            includeScore: true
        });
    }

    private getAllVariants() {
        return this._data?.families.flatMap(f => f.variants) || [];
    }

    private findFamily(key: string | undefined): SpriteFamily | undefined {
        return this._data?.families.find(f => f.key === key);
    }

    private findVariant(id: number | undefined): { family: SpriteFamily; variant: SpriteVariant } | undefined {
        if (!id || !this._data) return undefined;
        for (const family of this._data.families) {
            const variant = family.variants.find(v => v.id === id);
            if (variant) return { family, variant };
        }
        return undefined;
    }

    private resolveSearchIntent(value: string | undefined): SpriteSearchIntent {
        const rawValue = String(value || "").trim();
        if (!rawValue) return { kind: "overview", state: {} };

        if (rawValue === "browse:all") return { kind: "overview", state: {} };
        if (rawValue === "filter:starter") return { kind: "overview", state: { starterOnly: true } };
        if (rawValue.startsWith("filter:rarity:")) {
            const rarity = rawValue.replace("filter:rarity:", "") as SpriteRarity;
            return { kind: "overview", state: { rarityFilter: rarity } };
        }
        if (rawValue.startsWith("filter:variant:")) {
            const variant = rawValue.replace("filter:variant:", "") as SpriteVariantName;
            return { kind: "overview", state: { variantFilter: variant } };
        }
        if (rawValue.startsWith("search:")) {
            return { kind: "overview", state: { searchQuery: rawValue.replace("search:", "") } };
        }

        if (rawValue.startsWith("family:") || rawValue.startsWith("variant:")) {
            const item = this.searchItems.find(searchItem => searchItem.value === rawValue);
            if (item?.type === "family") return { kind: "family", familyKey: item.familyKey };
            if (item?.type === "variant" && item.variantId) return { kind: "variant", variantId: item.variantId };
        }

        const q = rawValue.toLowerCase();
        if (["starter", "starters", "free"].includes(q)) return { kind: "overview", state: { starterOnly: true } };

        const matchingRarity = RARITY_ORDER.find(rarity => rarity === q || this.titleCase(rarity).toLowerCase() === q);
        if (matchingRarity) return { kind: "overview", state: { rarityFilter: matchingRarity } };

        const matchingVariant = this.getVariantNames().find(variant =>
            variant.toLowerCase() === q || this.variantLabel(variant).toLowerCase() === q
        );
        if (matchingVariant) return { kind: "overview", state: { variantFilter: matchingVariant } };

        const exact = this.searchItems.find(item => item.name.toLowerCase() === q);
        if (exact?.type === "family") return { kind: "family", familyKey: exact.familyKey };
        if (exact?.type === "variant" && exact.variantId) return { kind: "variant", variantId: exact.variantId };

        const best = this.fuse?.search(rawValue)?.[0];
        if (best && (best.score ?? 1) <= 0.08) {
            if (best.item.type === "family") return { kind: "family", familyKey: best.item.familyKey };
            if (best.item.variantId) return { kind: "variant", variantId: best.item.variantId };
        }

        return { kind: "overview", state: { searchQuery: rawValue } };
    }

    private resolveAutocomplete(i: AutocompleteInteraction<CacheType>) {
        const query = String(i.options.getFocused(true).value || "").trim();
        if (!this._data || !this.fuse) return i.respond([]);

        const choices: { name: string; value: string }[] = [];
        if (!query) {
            const starters = this.searchItems.filter(item => item.type === "variant" && item.starter);
            const baseFamilies = this.searchItems.filter(item => item.type === "family");
            choices.push(
                { name: "🧚 Browse all sprites", value: "browse:all" },
                { name: "🌱 Show starter sprites", value: "filter:starter" },
                { name: "🌟 Show mythic sprites", value: "filter:rarity:mythic" },
                { name: "🍬 Show Gummy variants", value: "filter:variant:Candy" }
            );

            for (const item of [...starters, ...baseFamilies]) {
                choices.push(this.formatAutocompleteChoice(item));
                if (choices.length >= 25) break;
            }

            return i.respond(choices.slice(0, 25));
        }

        const q = query.toLowerCase();
        choices.push({ name: this.truncate(`🔎 Search results for "${query}"`, 100), value: `search:${this.truncate(query, 93)}` });

        if (["starter", "starters", "free"].some(term => term.startsWith(q) || q.includes(term))) {
            choices.push({ name: "🌱 Show starter sprites", value: "filter:starter" });
        }

        for (const rarity of RARITY_ORDER) {
            if (rarity.includes(q) || q.includes(rarity)) {
                choices.push({ name: `${this.rarityEmoji(rarity)} Show ${this.titleCase(rarity)} sprites`, value: `filter:rarity:${rarity}` });
            }
        }

        for (const variant of this.getVariantNames()) {
            const label = this.variantLabel(variant);
            if (variant.toLowerCase().includes(q) || label.toLowerCase().includes(q) || q.includes(variant.toLowerCase()) || q.includes(label.toLowerCase())) {
                choices.push({ name: `${this.variantEmoji(variant)} Show ${label} variants`, value: `filter:variant:${variant}` });
            }
        }

        const results = this.fuse.search(query).map(r => r.item);
        const unique = new Map<string, SpriteSearchItem>();
        for (const item of results) {
            if (!unique.has(item.value)) unique.set(item.value, item);
        }

        const ranked = Array.from(unique.values())
            .sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
            .map(item => this.formatAutocompleteChoice(item));

        const deduped = new Map<string, { name: string; value: string }>();
        for (const choice of [...choices, ...ranked]) {
            if (!deduped.has(choice.value)) deduped.set(choice.value, choice);
        }

        return i.respond(Array.from(deduped.values()).slice(0, 25));
    }

    private async replySprites(i: BaseCommandInteraction<CacheType>) {
        const search = i.options.get("search")?.value as string | undefined;
        await i.deferReply();

        if (!this._data) {
            return i.editReply({ content: "Sprite data is not loaded yet. Try again in a minute." });
        }

        const displayName = await this.getDisplayName(i as CommandInteraction<CacheType>);
        const result = this.resolveSearchIntent(search);

        if (result.kind === "variant") {
            const match = this.findVariant(result.variantId);
            if (!match) return i.editReply({ content: "I could not find that sprite variant." });
            const response = await this.generateDetailResponse(match.family, match.variant, i.user.id, i.user as User, displayName);
            return i.editReply(response as any);
        }

        if (result.kind === "family") {
            const family = this.findFamily(result.familyKey);
            if (!family) return i.editReply({ content: "I could not find that sprite family." });
            const response = await this.generateFamilyResponse(family.key, i.user.id, i.user as User, displayName);
            return i.editReply(response as any);
        }

        const response = await this.generateOverviewResponse(result.state, i.user.id, i.user as User, displayName);
        return i.editReply(response as any);
    }

    private getFilteredFamilies(state: SpriteBrowserState): SpriteFamily[] {
        if (!this._data) return [];
        const variantFilter = state.variantFilter || "all";
        const rarityFilter = state.rarityFilter || "all";

        return this._data.families
            .map(family => ({
                ...family,
                variants: family.variants.filter(variant => {
                    const variantMatches = variantFilter === "all" || variant.variant === variantFilter;
                    const rarityMatches = rarityFilter === "all" || variant.rarity === rarityFilter;
                    const starterMatches = !state.starterOnly || variant.starter;
                    const searchMatches = !state.searchQuery || this.spriteMatchesQuery(family, variant, state.searchQuery);
                    return variantMatches && rarityMatches && starterMatches && searchMatches;
                })
            }))
            .filter(family => family.variants.length > 0);
    }

    private buildFooterText() {
        const fetchedAt = this._data?.fetchedAt ? new Date(this._data.fetchedAt).toLocaleString("en-US", { timeZone: "America/New_York" }) : "unknown";
        const syncText = this.lastSyncError ? ` | Last sync error: ${this.lastSyncError}` : "";
        return `${appVersion} | Data fetched ${fetchedAt}${syncText}`;
    }

    private async generateOverviewResponse(state: SpriteBrowserState, ownerId: string, user: User, displayName: string) {
        const families = this.getFilteredFamilies(state);
        const image = await this.renderOverviewImage(families, state);
        const attachment = new MessageAttachment(image, "sprites-overview.png");
        const shownCount = families.reduce((sum, family) => sum + family.variants.length, 0);
        const summary = this.describeOverviewState(state);

        const embed = new MessageEmbed()
            .setColor("#2186DB")
            .setImage("attachment://sprites-overview.png")
            .setAuthor({ name: displayName, iconURL: user.displayAvatarURL({ dynamic: true }) })
            .setFooter({ text: this.buildFooterText() })
            .setTimestamp();

        if (summary) embed.setDescription(summary);

        return {
            embeds: [embed],
            files: [attachment],
            components: this.generateOverviewComponents(state, ownerId)
        };
    }

    private async generateFamilyResponse(familyKey: string, ownerId: string, user: User, displayName: string) {
        const family = this.findFamily(familyKey);
        if (!family) return { content: "Sprite family not found.", components: [] };

        const image = await this.renderFamilyImage(family);
        const attachment = new MessageAttachment(image, `sprites-family-${family.key}.png`);

        const embed = new MessageEmbed()
            .setColor(this.getFamilyColor(family) as any)
            .setImage(`attachment://sprites-family-${family.key}.png`)
            .setAuthor({ name: displayName, iconURL: user.displayAvatarURL({ dynamic: true }) })
            .setFooter({ text: this.buildFooterText() })
            .setTimestamp();

        return {
            embeds: [embed],
            files: [attachment],
            components: this.generateFamilyComponents(family, ownerId)
        };
    }

    private async generateDetailResponse(family: SpriteFamily, variant: SpriteVariant, ownerId: string, user: User, displayName: string) {
        const image = await this.renderVariantImage(family, variant);
        const attachment = new MessageAttachment(image, `sprites-variant-${variant.id}.png`);

        const embed = new MessageEmbed()
            .setColor(RARITY_HEX_COLORS[variant.rarity] as any)
            .setImage(`attachment://sprites-variant-${variant.id}.png`)
            .setAuthor({ name: displayName, iconURL: user.displayAvatarURL({ dynamic: true }) })
            .setFooter({ text: this.buildFooterText() })
            .setTimestamp();

        return {
            embeds: [embed],
            files: [attachment],
            components: this.generateDetailComponents(family, variant, ownerId)
        };
    }
    private generateOverviewComponents(state: SpriteBrowserState, ownerId: string) {
        const ownerSuffix = `|${ownerId}`;
        const families = this._data?.families || [];
        const selectedFamily = state.familyKey && families.some(f => f.key === state.familyKey) ? state.familyKey : undefined;
        const familyPage = state.familyPage || 0;
        const familiesPerPage = 25;
        const totalFamilyPages = Math.max(1, Math.ceil(families.length / familiesPerPage));
        const clampedFamilyPage = Math.max(0, Math.min(familyPage, totalFamilyPages - 1));
        const visibleFamilies = families.slice(clampedFamilyPage * familiesPerPage, (clampedFamilyPage + 1) * familiesPerPage);

        const familyRow = new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`fn_sprites_family_select${ownerSuffix}`)
                .setPlaceholder(totalFamilyPages > 1 ? `🧬 Choose a sprite family (${clampedFamilyPage + 1}/${totalFamilyPages})` : "🧬 Choose a sprite family")
                .addOptions(visibleFamilies.map(family => ({
                    label: `${this.familyEmoji(family.key)} ${family.displayName}`,
                    description: this.truncate(family.effectSummary, 90),
                    value: family.key,
                    default: family.key === selectedFamily
                })))
        );

        const variantFilter = state.variantFilter || "all";
        const rarityFilter = state.rarityFilter || "all";
        const activeQuickFilter = state.starterOnly
            ? "starter"
            : rarityFilter !== "all"
                ? `rarity:${rarityFilter}`
                : variantFilter !== "all"
                    ? `variant:${variantFilter}`
                    : "all";
        const quickFilterRow = new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`fn_sprites_quick_filter${ownerSuffix}`)
                .setPlaceholder("🔎 Choose a view")
                .addOptions([
                    { label: "🧚 All sprites", description: "Reset filters and show the full sprite list", value: "all", default: activeQuickFilter === "all" },
                    { label: "🌱 Starter sprites", description: "Sprites marked as starter pulls", value: "starter", default: activeQuickFilter === "starter" },
                    ...this.getVariantNames().slice(0, 8).map(variant => ({
                        label: `${this.variantEmoji(variant)} ${this.variantLabel(variant)} variants`,
                        description: `Show every ${this.variantLabel(variant)} variant`,
                        value: `variant:${variant}`,
                        default: activeQuickFilter === `variant:${variant}`
                    })),
                    ...RARITY_ORDER.map(rarity => ({
                        label: `${this.rarityEmoji(rarity)} ${this.titleCase(rarity)} sprites`,
                        description: `Show ${this.titleCase(rarity)} rarity sprites`,
                        value: `rarity:${rarity}`,
                        default: activeQuickFilter === `rarity:${rarity}`
                    }))
                ])
        );

        const quickRow = new MessageActionRow().addComponents(
            new MessageButton().setCustomId(`fn_sprites_quick_starters${ownerSuffix}`).setLabel("🌱 Starters").setStyle("PRIMARY"),
            new MessageButton().setCustomId(`fn_sprites_quick_rarest${ownerSuffix}`).setLabel("🌟 Rarest").setStyle("SECONDARY"),
            new MessageButton().setCustomId(`fn_sprites_quick_cost${ownerSuffix}`).setLabel("💎 Highest Cost").setStyle("SECONDARY"),
            new MessageButton().setCustomId(`fn_sprites_quick_random${ownerSuffix}`).setLabel("🎲 Random").setStyle("SUCCESS")
        );

        const rows = [familyRow, quickFilterRow];
        if (totalFamilyPages > 1) {
            rows.push(new MessageActionRow().addComponents(
                new MessageButton().setCustomId(`fn_sprites_family_page_${clampedFamilyPage - 1}${ownerSuffix}`).setLabel("⬅️ Families").setStyle("SECONDARY").setDisabled(clampedFamilyPage === 0),
                new MessageButton().setCustomId(`fn_sprites_family_page_${clampedFamilyPage + 1}${ownerSuffix}`).setLabel("Families ➡️").setStyle("SECONDARY").setDisabled(clampedFamilyPage >= totalFamilyPages - 1)
            ));
        }
        rows.push(quickRow);
        return rows;
    }

    private generateFamilyComponents(family: SpriteFamily, ownerId: string) {
        const ownerSuffix = `|${ownerId}`;
        const currentIndex = this._data?.families.findIndex(f => f.key === family.key) ?? -1;
        const prev = currentIndex > 0 ? this._data!.families[currentIndex - 1] : null;
        const next = this._data && currentIndex < this._data.families.length - 1 ? this._data.families[currentIndex + 1] : null;
        const variantRows = this.generateVariantComponents(family, ownerId);

        const navRow = new MessageActionRow().addComponents(
            new MessageButton().setCustomId(`fn_sprites_family_${prev?.key || family.key}${ownerSuffix}`).setLabel("⬅️ Family").setStyle("SECONDARY").setDisabled(!prev),
            new MessageButton().setCustomId(`fn_sprites_overview${ownerSuffix}`).setLabel("🧚 Overview").setStyle("PRIMARY"),
            new MessageButton().setCustomId(`fn_sprites_family_${next?.key || family.key}${ownerSuffix}`).setLabel("Family ➡️").setStyle("SECONDARY").setDisabled(!next)
        );

        return [...variantRows, navRow];
    }

    private generateDetailComponents(family: SpriteFamily, selectedVariant: SpriteVariant, ownerId: string) {
        const ownerSuffix = `|${ownerId}`;
        const variantRows = this.generateVariantComponents(family, ownerId, selectedVariant.id);

        const navRow = new MessageActionRow().addComponents(
            new MessageButton().setCustomId(`fn_sprites_family_${family.key}${ownerSuffix}`).setLabel("🧬 Family").setStyle("PRIMARY"),
            new MessageButton().setCustomId(`fn_sprites_overview${ownerSuffix}`).setLabel("🧚 Overview").setStyle("SECONDARY")
        );

        return [...variantRows, navRow];
    }

    private generateVariantComponents(family: SpriteFamily, ownerId: string, selectedVariantId?: number) {
        const ownerSuffix = `|${ownerId}`;

        if (family.variants.length > 5) {
            return [
                new MessageActionRow().addComponents(
                    new MessageSelectMenu()
                        .setCustomId(`fn_sprites_variant_select_${family.key}${ownerSuffix}`)
                        .setPlaceholder("🎨 Choose a variant")
                        .addOptions(family.variants.slice(0, 25).map(variant => ({
                            label: `${this.variantEmoji(variant.variant)} ${this.variantLabel(variant.variant)}`,
                            description: this.truncate(`${this.rarityEmoji(variant.rarity)} ${this.titleCase(variant.rarity)} | ${this.formatChance(variant)} | ${variant.summonCost.toLocaleString("en-US")} cost`, 90),
                            value: variant.id.toString(),
                            default: variant.id === selectedVariantId
                        })))
                )
            ];
        }

        const variantRow = new MessageActionRow();
        for (const variant of family.variants) {
            variantRow.addComponents(
                new MessageButton()
                    .setCustomId(`fn_sprites_variant_${variant.id}${ownerSuffix}`)
                    .setLabel(`${this.variantEmoji(variant.variant)} ${this.variantLabel(variant.variant)}`)
                    .setStyle(variant.id === selectedVariantId || variant.variant === "Base" ? "PRIMARY" : "SECONDARY")
                    .setDisabled(variant.id === selectedVariantId)
            );
        }

        return [variantRow];
    }




    private async getBrowser(): Promise<Browser> {
        if (this.browser) return this.browser;
        if (this.browserPromise) return this.browserPromise;

        this.browserPromise = puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        }).then(b => {
            this.browser = b;
            return b;
        });

        return this.browserPromise;
    }

    private async renderHtmlToBuffer(html: string, width: number, height: number): Promise<Buffer> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width, height, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'load', timeout: 15000 });
        await page.evaluate(async () => {
            await (document as any).fonts?.ready;
            const images = Array.from(document.images || []);
            await Promise.all(images.map(async img => {
                if (img.complete) return;
                await new Promise(resolve => {
                    img.addEventListener("load", resolve, { once: true });
                    img.addEventListener("error", resolve, { once: true });
                });
            }));
        });
        const buffer = Buffer.from(await page.screenshot({ type: 'png' }));
        await page.close();
        return buffer;
    }

    private getRenderTokensCss(): string {
        return fs.readFileSync(TOKENS_PATH, "utf8");
    }

    private escapeHtml(value: string | number | null | undefined): string {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    private alphaColor(hex: string, alphaPercent: string | number) {
        return `color-mix(in srgb, ${hex} ${alphaPercent}%, transparent)`;
    }

    private renderMetaChip(value: string | number) {
        return `<span class="meta-chip">${this.escapeHtml(value)}</span>`;
    }

    private renderRarityPill(rarity: SpriteRarity) {
        const color = RARITY_CSS_COLORS[rarity];
        return `<span class="rarity-pill" style="--rarity-color:${color}; --rarity-bg:${this.alphaColor(color, 16)}">${this.escapeHtml(rarity)}</span>`;
    }

    private renderSpriteThumb(imageUrl: string | undefined, className: string, fallback = "No asset") {
        return `
            <div class="sprite-thumb ${className}">
                ${imageUrl ? `<img src="${this.escapeHtml(imageUrl)}" alt="">` : `<span class="metric-label">${this.escapeHtml(fallback)}</span>`}
            </div>
        `;
    }

    private renderDustAmount(amount: number) {
        if (!amount) return `<span class="dust-unknown">Unknown</span>`;
        return `
            <span class="dust-amount">
                ${this.dustIconDataUrl ? `<img src="${this.dustIconDataUrl}" alt="Dust">` : `<em>dust</em>`}
                <strong>${amount.toLocaleString("en-US")}</strong>
            </span>
        `;
    }

    private buildRenderDocument(content: string, extraCss: string) {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&family=Space+Grotesk:wght@600;700&display=swap" rel="stylesheet">
                <style>
                    ${this.getRenderTokensCss()}
                    html, body { overflow: clip; }
                    * { box-sizing: border-box; }
                    body {
                        margin: 0;
                        font-family: var(--font-body);
                        background: var(--color-canvas);
                        color: var(--color-ink);
                        -webkit-font-smoothing: antialiased;
                        text-rendering: optimizeLegibility;
                    }
                    img { display: block; max-width: 100%; }
                    .canvas {
                        width: 100%;
                        height: 100%;
                        padding: 26px;
                        background:
                            linear-gradient(180deg, color-mix(in oklch, var(--color-panel-3) 22%, transparent), transparent 36%),
                            var(--color-canvas);
                    }
                    .shell {
                        width: 100%;
                        height: 100%;
                        border-radius: var(--radius-lg);
                        border: 1px solid var(--color-rule);
                        background:
                            linear-gradient(180deg, color-mix(in oklch, var(--color-panel-2) 58%, transparent), transparent 30%),
                            var(--color-paper);
                        box-shadow: var(--shadow-panel);
                        overflow: hidden;
                        position: relative;
                    }
                    .shell::before {
                        content: "";
                        position: absolute;
                        inset: 0;
                        pointer-events: none;
                        background-image:
                            linear-gradient(var(--color-rule) 1px, transparent 1px),
                            linear-gradient(90deg, var(--color-rule) 1px, transparent 1px);
                        background-size: 44px 44px;
                        opacity: 0.12;
                    }
                    .content {
                        position: relative;
                        z-index: 1;
                        padding: 30px;
                        height: 100%;
                    }
                    .eyebrow {
                        display: inline-flex;
                        align-items: center;
                        width: max-content;
                        margin: 0 0 10px;
                        padding: 0.34rem 0.52rem;
                        border: 1px solid color-mix(in oklch, var(--color-accent) 35%, var(--color-rule));
                        border-radius: var(--radius-sm);
                        background: color-mix(in oklch, var(--color-accent) 10%, transparent);
                        color: var(--color-accent);
                        font: 700 0.68rem/1 var(--font-body);
                        text-transform: uppercase;
                        letter-spacing: 0;
                    }
                    .headline {
                        margin: 0;
                        font-family: var(--font-display);
                        font-size: var(--text-2xl);
                        line-height: 0.98;
                        color: var(--color-ink);
                        font-style: normal;
                        overflow-wrap: anywhere;
                    }
                    .lede {
                        margin: 8px 0 0;
                        max-width: 58ch;
                        color: var(--color-muted);
                        font-size: var(--text-sm);
                        line-height: 1.35;
                    }
                    .panel {
                        background: color-mix(in oklch, var(--color-panel) 92%, black);
                        border: 1px solid var(--color-rule);
                        border-radius: var(--radius-md);
                        overflow: hidden;
                    }
                    .meta-chip {
                        display: inline-flex;
                        align-items: center;
                        min-height: 32px;
                        padding: 0.45rem 0.68rem;
                        border-radius: var(--radius-sm);
                        border: 1px solid var(--color-rule);
                        background: var(--color-panel-2);
                        color: var(--color-ink);
                        font: 700 0.72rem/1 var(--font-body);
                        text-transform: uppercase;
                        white-space: nowrap;
                    }
                    .metric-label {
                        color: var(--color-ink-2);
                        font: 700 0.7rem/1.2 var(--font-body);
                        text-transform: uppercase;
                    }
                    .copy-title {
                        margin: 0;
                        color: var(--color-ink);
                        font: 700 0.78rem/1.1 var(--font-body);
                        text-transform: uppercase;
                    }
                    .dust-amount {
                        display: inline-flex;
                        align-items: center;
                        justify-content: flex-end;
                        gap: 7px;
                        color: var(--color-ink);
                        text-align: right;
                        white-space: nowrap;
                    }
                    .dust-amount strong {
                        font: 700 0.95rem/1 var(--font-mono);
                    }
                    .dust-amount img {
                        width: 22px;
                        height: 22px;
                        object-fit: contain;
                        filter: drop-shadow(0 8px 14px color-mix(in oklch, black 42%, transparent));
                    }
                    .dust-amount em {
                        color: var(--color-muted);
                        font: 600 0.6rem/1 var(--font-body);
                        font-style: normal;
                        text-transform: uppercase;
                    }
                    .dust-unknown {
                        color: var(--color-muted);
                        font: 600 0.72rem/1 var(--font-body);
                        text-align: right;
                        white-space: nowrap;
                    }
                    .sprite-thumb {
                        display: grid;
                        place-items: center;
                        border-radius: var(--radius-md);
                        background:
                            linear-gradient(180deg, var(--color-panel-3), var(--color-panel-2));
                        border: 1px solid var(--color-rule);
                        overflow: hidden;
                    }
                    .sprite-thumb img {
                        object-fit: contain;
                        filter: drop-shadow(0 15px 22px color-mix(in oklch, black 46%, transparent));
                    }
                    .rarity-pill {
                        display: inline-flex;
                        align-items: center;
                        padding: 0.3rem 0.46rem;
                        border-radius: var(--radius-sm);
                        border: 1px solid color-mix(in srgb, var(--rarity-color) 34%, transparent);
                        background: var(--rarity-bg);
                        color: var(--rarity-color);
                        font: 700 0.64rem/1 var(--font-body);
                        text-transform: uppercase;
                        white-space: nowrap;
                    }
                    .kicker {
                        color: var(--color-muted);
                        font: 700 0.68rem/1 var(--font-body);
                        text-transform: uppercase;
                    }
                    .page-head {
                        display: flex;
                        align-items: end;
                        justify-content: space-between;
                        gap: 24px;
                        min-width: 0;
                    }
                    .page-copy { min-width: 0; }
                    .page-meta {
                        display: flex;
                        gap: 8px;
                        flex-wrap: wrap;
                        justify-content: flex-end;
                        align-items: center;
                    }
                    .section-title {
                        margin: 0;
                        font-family: var(--font-display);
                        font-size: 1.35rem;
                        line-height: 1.05;
                        font-style: normal;
                    }
                    .list-reset { list-style: none; padding: 0; margin: 0; }
                    ${extraCss}
                </style>
            </head>
            <body>${content}</body>
            </html>
        `;
    }

    private async renderOverviewImage(families: SpriteFamily[], state: SpriteBrowserState): Promise<Buffer> {
        const cacheKey = `overview:${this._data?.fetchedAt}:${state.variantFilter || "all"}:${state.rarityFilter || "all"}:${state.starterOnly ? "starter" : "all"}:${state.searchQuery || ""}`;
        const cached = this.imageCache.get(cacheKey);
        if (cached) return cached;

        const width = 1700;
        const height = 1300;
        const variants = families.flatMap(family => family.variants.map(variant => ({ family, variant })));
        const filters = [
            state.searchQuery ? `Search: ${state.searchQuery}` : null,
            state.starterOnly ? "Starters" : null,
            state.variantFilter && state.variantFilter !== "all" ? this.variantLabel(state.variantFilter) : null,
            state.rarityFilter && state.rarityFilter !== "all" ? this.titleCase(state.rarityFilter) : null
        ].filter(Boolean).join(" / ") || "All variants";
        const variantColumns = this.getVariantNames();

        const html = this.buildRenderDocument(`
            <div class="canvas">
                <div class="shell">
                    <div class="content overview-layout">
                        <section class="page-head">
                            <div class="page-copy">
                                <p class="eyebrow">Fortnite sprites</p>
                                <h1 class="headline">Sprite overview</h1>
                                <p class="lede">${this.escapeHtml(this.describeOverviewState(state) || "All visible sprites at a glance.")}</p>
                            </div>
                            <div class="page-meta">
                                ${this.renderMetaChip(`${families.length} families`)}
                                ${this.renderMetaChip(`${variants.length} shown`)}
                                ${this.renderMetaChip(filters)}
                            </div>
                        </section>

                        <section class="panel overview-panel">
                            <div class="overview-board">
                                <div class="overview-table" style="--variant-count:${variantColumns.length}">
                                    ${families.length === 0 ? `
                                        <article class="empty-state">
                                            <h3>No sprites found</h3>
                                            <p>Try a broader search, reset to all sprites, or pick a family from the menu.</p>
                                        </article>
                                    ` : `
                                        <div class="overview-table-head">
                                            ${variantColumns.map(variantName => `<span>${this.escapeHtml(this.variantLabel(variantName))}</span>`).join("")}
                                        </div>
                                        <div class="overview-family-list">
                                            ${families.map(family => {
            return `
                                                    <article class="family-row">
                                                        ${variantColumns.map(variantName => {
                const variant = family.variants.find(familyVariant => familyVariant.variant === variantName);
                if (!variant) {
                    return `
                                                                    <div class="variant-cell variant-cell--empty" aria-hidden="true"></div>
                                                                `;
                }
                return `
                                                                <div class="variant-cell">
                                                                    ${this.renderSpriteThumb(variant.imageUrl, "overview-variant-thumb")}
                                                                    <div class="overview-variant-copy">
                                                                        <h4>${this.escapeHtml(variant.name)}</h4>
                                                                        <p>${this.escapeHtml(variant.chanceLabel)}</p>
                                                                    </div>
                                                                    ${this.renderRarityPill(variant.rarity)}
                                                                </div>
                                                            `;
            }).join("")}
                                                    </article>
                                                `;
        }).join("")}
                                        </div>
                                    `}
                                </div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
        `, `
            .overview-layout { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 18px; }
            .overview-panel {
                display: grid;
                grid-template-rows: minmax(0, 1fr);
                padding: 18px;
                min-height: 0;
                background: color-mix(in oklch, var(--color-panel-2) 72%, black);
            }
            .overview-board {
                min-width: 0;
                min-height: 0;
            }
            .overview-table {
                display: grid;
                grid-template-rows: auto minmax(0, 1fr);
                gap: 10px;
                height: 100%;
            }
            .overview-table-head {
                display: grid;
                grid-template-columns: repeat(var(--variant-count), minmax(0, 1fr));
                gap: 10px;
                align-items: center;
                color: var(--color-muted);
                font: 700 0.78rem/1 var(--font-body);
                text-transform: uppercase;
            }
            .overview-table-head span {
                padding: 0 12px;
            }
            .overview-family-list {
                display: grid;
                gap: 10px;
                min-height: 0;
            }
            .family-row {
                display: grid;
                grid-template-columns: repeat(var(--variant-count), minmax(0, 1fr));
                gap: 10px;
                min-height: 74px;
            }
            .variant-cell {
                min-width: 0;
                border-radius: var(--radius-sm);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
            }
            .variant-cell {
                display: grid;
                grid-template-columns: 68px minmax(0, 1fr) auto;
                gap: 14px;
                align-items: center;
                padding: 9px 12px 9px 9px;
            }
            .variant-cell--empty {
                display: block;
                border-style: dashed;
                opacity: 0.42;
                background: color-mix(in oklch, var(--color-panel) 44%, transparent);
            }
            .overview-variant-thumb {
                width: 66px;
                height: 64px;
                overflow: visible;
            }
            .overview-variant-thumb img {
                width: 58px;
                height: 58px;
            }
            .overview-variant-copy {
                min-width: 0;
            }
            .overview-variant-copy h4 {
                margin: 0;
                color: var(--color-ink);
                font: 600 0.96rem/1.08 var(--font-body);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .overview-variant-copy p {
                margin: 6px 0 0;
                color: var(--color-muted);
                font: 500 0.74rem/1 var(--font-mono);
            }
            .variant-cell .rarity-pill {
                padding: 0.26rem 0.44rem;
                font-size: 0.62rem;
            }
            .empty-state {
                display: grid;
                place-items: center;
                min-height: 590px;
                padding: 28px;
                text-align: center;
                border-radius: var(--radius-md);
                border: 1px dashed var(--color-rule-2);
                background: var(--color-panel);
                color: var(--color-muted);
            }
            .empty-state h3 {
                margin: 0;
                color: var(--color-ink);
                font: 700 1.5rem/1 var(--font-display);
            }
            .empty-state p {
                margin: 8px 0 0;
                font-size: 0.88rem;
            }
        `);

        const buffer = await this.renderHtmlToBuffer(html, width, height);
        this.imageCache.set(cacheKey, buffer);
        return buffer;
    }

    private async renderVariantImage(family: SpriteFamily, variant: SpriteVariant): Promise<Buffer> {
        const cacheKey = `variant:${this._data?.fetchedAt}:${variant.id}`;
        const cached = this.imageCache.get(cacheKey);
        if (cached) return cached;

        const width = 1000;
        const height = 700;
        const rarityColor = RARITY_CSS_COLORS[variant.rarity];
        const effect = variant.effectText || family.effectSummary || "No effect description available.";
        const perk = variant.specialEffectText || "";
        const location = family.location || "Unknown location";
        const bannerChance = variant.chancePercent === 0 ? "" : this.formatChance(variant);

        const html = this.buildRenderDocument(`
            <div class="canvas">
                <div class="shell">
                    <div class="content variant-layout">
                        <section class="page-head">
                            <div class="page-copy">
                                <h1 class="headline variant-headline">${this.escapeHtml(variant.name)}</h1>
                                <p class="lede">${this.escapeHtml(family.displayName)}</p>
                            </div>
                        </section>

                        <section class="variant-main">
                            <article class="panel variant-art-card">
                                ${this.renderSpriteThumb(variant.imageUrl, "variant-art")}
                                <div class="variant-stat-strip">
                                    <div class="unique-banner">
                                        ${this.renderRarityPill(variant.rarity)}
                                        <strong>${this.escapeHtml(bannerChance)}</strong>
                                    </div>
                                    <div class="stat-tile stat-tile--cost">
            
                                        ${this.renderDustAmount(variant.summonCost)}
                                    </div>
                                    <div class="stat-tile">
                                        <span>Variant</span>
                                        <strong>${this.escapeHtml(this.variantLabel(variant.variant))}</strong>
                                    </div>
                                </div>
                            </article>

                            <article class="panel variant-info-card">
                                <div class="location-card">
                                    <span class="metric-label">Location</span>
                                    <strong>${this.escapeHtml(location)}</strong>
                                </div>

                                <div class="copy-block">
                                    <h3 class="copy-title">Effect</h3>
                                    <p>${this.escapeHtml(effect)}</p>
                                </div>

                                ${perk ? `
                                    <div class="copy-block copy-block--perk">
                                        <h3 class="copy-title">Variant perk</h3>
                                        <p>${this.escapeHtml(perk)}</p>
                                    </div>
                                ` : ""}

                                <div class="copy-block">
                                    <h3 class="copy-title">Level scaling</h3>
                                    <p>${this.escapeHtml(family.levelScaling || "No level scaling available.")}</p>
                                </div>
                            </article>
                        </section>
                    </div>
                </div>
            </div>
        `, `
            .variant-layout { display: grid; grid-template-rows: auto 1fr; gap: 16px; }
            .variant-headline { font-size: 2.55rem; }
            .variant-main {
                display: grid;
                grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
                gap: 16px;
            }
            .variant-art-card,
            .variant-info-card {
                padding: 12px;
                background: color-mix(in oklch, var(--color-panel-2) 78%, black);
            }
            .variant-art-card {
                display: grid;
                grid-template-rows: 1fr auto;
                gap: 8px;
            }
            .variant-art {
                height: 368px;
                background:
                    linear-gradient(160deg, color-mix(in srgb, ${rarityColor} 18%, transparent), transparent 42%),
                    var(--color-panel);
            }
            .variant-art img {
                width: 330px;
                height: 330px;
            }
            .variant-stat-strip {
                display: grid;
                grid-template-columns: minmax(0, 1.7fr) minmax(0, 0.85fr) minmax(0, 0.75fr);
                gap: 8px;
                min-height: 58px;
                padding: 8px;
                border: 1px solid var(--color-rule);
                border-radius: var(--radius-md);
                background: var(--color-panel);
            }
            .unique-banner {
                min-width: 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                padding: 8px 10px;
                border-radius: calc(var(--radius-md) - 4px);
                border: 1px solid color-mix(in srgb, ${rarityColor} 30%, var(--color-rule));
                background:
                    linear-gradient(90deg, color-mix(in srgb, ${rarityColor} 10%, transparent), transparent 62%),
                    color-mix(in oklch, var(--color-panel-2) 68%, transparent);
            }
            .unique-banner .rarity-pill {
                flex: 0 0 auto;
            }
            .unique-banner strong {
                color: var(--color-ink);
                font: 800 0.86rem/1 var(--font-display);
                white-space: nowrap;
            }
            .stat-tile {
                min-width: 0;
                display: grid;
                align-content: center;
                gap: 5px;
                padding: 8px 10px;
                border-radius: calc(var(--radius-md) - 4px);
                border: 1px solid color-mix(in oklch, var(--color-rule) 78%, transparent);
                background: color-mix(in oklch, var(--color-panel-2) 70%, transparent);
            }
            .stat-tile span {
                color: var(--color-muted);
                font: 700 0.58rem/1 var(--font-body);
                letter-spacing: 0.08em;
                text-transform: uppercase;
            }
            .stat-tile strong,
            .stat-tile .dust-amount,
            .stat-tile .dust-unknown {
                color: var(--color-ink);
                font: 700 0.82rem/1.05 var(--font-display);
                letter-spacing: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .stat-tile--rarity {
                border-color: color-mix(in srgb, ${rarityColor} 35%, var(--color-rule));
            }
            .stat-tile--cost .dust-amount {
                display: inline-flex;
                justify-content: flex-start;
                gap: 6px;
                flex-direction: row;
            }
            .stat-tile--cost .dust-amount img {
                width: 18px;
                height: 18px;
            }
            .variant-info-card {
                display: grid;
                gap: 10px;
                align-content: start;
            }
            .location-card {
                padding: 12px;
                border-radius: var(--radius-md);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
            }
            .location-card strong {
                display: block;
                margin-top: 6px;
                color: var(--color-ink);
                font: 700 1.02rem/1.18 var(--font-display);
                overflow-wrap: anywhere;
            }
            .copy-block {
                padding: 12px;
                border-radius: var(--radius-md);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
            }
            .copy-block p {
                margin: 8px 0 0;
                color: var(--color-ink-2);
                font-weight: 400;
                font-size: 0.9rem;
                line-height: 1.32;
            }
            .copy-block--perk {
                border-color: color-mix(in srgb, ${rarityColor} 45%, var(--color-rule));
                background: linear-gradient(90deg, color-mix(in srgb, ${rarityColor} 9%, transparent), var(--color-panel));
            }
        `);

        const buffer = await this.renderHtmlToBuffer(html, width, height);
        this.imageCache.set(cacheKey, buffer);
        return buffer;
    }

    private async renderFamilyImage(family: SpriteFamily): Promise<Buffer> {
        const cacheKey = `family:${this._data?.fetchedAt}:${family.key}`;
        const cached = this.imageCache.get(cacheKey);
        if (cached) return cached;

        const width = 1200;
        const height = 800;
        const baseVariant = family.variants.find(variant => variant.variant === "Base") || family.variants[0];

        const html = this.buildRenderDocument(`
            <div class="canvas">
                <div class="shell">
                    <div class="content family-layout">
                        <section class="page-head">
                            <div class="page-copy">
                                <p class="eyebrow">Sprite family</p>
                                <h1 class="headline family-headline">${this.escapeHtml(family.displayName)}</h1>
                                <p class="lede">${this.escapeHtml(family.location)}</p>
                            </div>
                            <div class="page-meta">
                                ${this.renderMetaChip(`${family.variants.length} variants`)}
                            </div>
                        </section>

                        <section class="family-main">
                            <article class="panel family-card">
                                ${this.renderSpriteThumb(baseVariant?.imageUrl, "featured-thumb")}
                                <div class="family-summary">
                                    ${baseVariant ? this.renderRarityPill(baseVariant.rarity) : ""}
                                    <span>${family.variants.length} variants</span>
                                </div>
                                <div class="family-copy">
                                    <h3 class="copy-title">Effect</h3>
                                    <p>${this.escapeHtml(family.effectSummary)}</p>
                                    <h3 class="copy-title">Level scaling</h3>
                                    <p>${this.escapeHtml(family.levelScaling)}</p>
                                </div>
                            </article>

                            <article class="panel variant-panel">
                                <div class="panel-head">
                                    <div>
                                        <div class="kicker">Variants</div>
                                        <h2 class="section-title">Collection</h2>
                                    </div>
                                </div>
                                <ul class="list-reset variant-list">
                                    ${family.variants.map(variant => {
            return `
                                            <li class="variant-row">
                                                ${this.renderSpriteThumb(variant.imageUrl, "variant-thumb")}
                                                <div class="variant-copy">
                                                    <h3>${this.escapeHtml(variant.name)}</h3>
                                                    <p>${this.escapeHtml(variant.chanceLabel)} chance${variant.starter ? " - starter" : ""}</p>
                                                </div>
                                                ${this.renderRarityPill(variant.rarity)}
                                                <div class="variant-cost">${this.renderDustAmount(variant.summonCost)}</div>
                                            </li>
                                        `;
        }).join("")}
                                </ul>
                            </article>
                        </section>
                    </div>
                </div>
            </div>
        `, `
            .family-layout { display: grid; grid-template-rows: auto 1fr; gap: 20px; }
            .family-headline { font-size: 2.55rem; }
            .family-main {
                display: grid;
                grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.42fr);
                gap: 16px;
            }
            .family-card,
            .variant-panel {
                padding: 16px;
                background: color-mix(in oklch, var(--color-panel-2) 78%, black);
            }
            .family-card {
                display: grid;
                grid-template-rows: 328px auto 1fr;
                gap: 10px;
            }
            .featured-thumb { height: 328px; background: var(--color-panel); }
            .featured-thumb img { width: 300px; height: 300px; }
            .family-summary {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                min-height: 42px;
                padding: 9px 10px;
                border-radius: var(--radius-md);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
                color: var(--color-muted);
                font: 600 0.74rem/1 var(--font-body);
                text-transform: uppercase;
            }
            .family-copy {
                display: grid;
                gap: 8px;
                color: var(--color-ink);
                align-content: start;
            }
            .family-copy p {
                margin: 0 0 9px;
                color: var(--color-ink-2);
                font-weight: 400;
                font-size: 0.94rem;
                line-height: 1.36;
            }
            .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
            .variant-list { display: grid; gap: 10px; }
            .variant-row {
                display: grid;
                grid-template-columns: 92px minmax(0, 1fr) auto 86px;
                gap: 14px;
                align-items: center;
                padding: 10px;
                border-radius: var(--radius-md);
                border: 1px solid var(--color-rule);
                background: var(--color-panel);
            }
            .variant-thumb { height: 92px; background: var(--color-panel-2); }
            .variant-thumb img { width: 88px; height: 88px; }
            .variant-copy h3 {
                margin: 0;
                font: 700 0.96rem/1.05 var(--font-body);
                color: var(--color-ink);
            }
            .variant-copy p {
                margin: 6px 0 0;
                color: var(--color-ink-2);
                font-weight: 400;
                font-size: 0.82rem;
            }
            .variant-cost {
                display: grid;
                justify-content: end;
                width: 86px;
                color: var(--color-ink);
            }
        `);

        const buffer = await this.renderHtmlToBuffer(html, width, height);
        this.imageCache.set(cacheKey, buffer);
        return buffer;
    }
    private getFamilyColor(family: SpriteFamily): string {
        const base = family.variants.find(v => v.variant === "Base") || family.variants[0];
        return RARITY_HEX_COLORS[base.rarity];
    }

    private formatAutocompleteChoice(item: SpriteSearchItem) {
        const name = item.type === "family"
            ? `${this.familyEmoji(item.familyKey)} ${item.name} family`
            : `${this.variantEmoji(item.variant)} ${item.name} - ${this.formatVariantBrief(this.findVariant(item.variantId)?.variant)}`;

        return {
            name: this.truncate(name, 100),
            value: item.value
        };
    }

    private spriteMatchesQuery(family: SpriteFamily, variant: SpriteVariant, query: string) {
        const q = query.toLowerCase();
        const haystack = [
            family.displayName,
            family.key,
            family.effectSummary,
            family.levelScaling,
            family.location,
            variant.name,
            variant.rarity,
            variant.variant,
            this.variantLabel(variant.variant),
            variant.chanceLabel,
            variant.summonCost.toString(),
            variant.effectText,
            variant.specialEffectText,
            variant.starter ? "starter free" : ""
        ].filter(Boolean).join(" ").toLowerCase();

        return haystack.includes(q) || q.split(/\s+/).filter(Boolean).every(part => haystack.includes(part));
    }

    private describeOverviewState(state: SpriteBrowserState) {
        const parts = [
            state.searchQuery ? `Search results for "${state.searchQuery}"` : null,
            state.starterOnly ? "Starter sprites" : null,
            state.variantFilter && state.variantFilter !== "all" ? `${this.variantEmoji(state.variantFilter)} ${this.variantLabel(state.variantFilter)} variants` : null,
            state.rarityFilter && state.rarityFilter !== "all" ? `${this.rarityEmoji(state.rarityFilter)} ${this.titleCase(state.rarityFilter)} rarity` : null
        ].filter(Boolean);

        return parts.join(" / ");
    }

    private stateFromQuickFilter(value: string): SpriteBrowserState {
        if (value === "all") return {};
        if (value === "starter") return { starterOnly: true };
        if (value.startsWith("variant:")) return { variantFilter: value.replace("variant:", "") as SpriteVariantName };
        if (value.startsWith("rarity:")) return { rarityFilter: value.replace("rarity:", "") as SpriteRarity };
        return {};
    }

    private familyEmoji(familyKey?: string) {
        const emojis: Record<string, string> = {
            water: "💧",
            earth: "🌿",
            fire: "🔥",
            duck: "🦆",
            ghost: "👻",
            dream: "💤",
            punk: "🎸",
            king: "👑",
            "zero-point": "🌀",
            demon: "😈",
            "burnt-peanut": "🥜"
        };
        return familyKey ? emojis[familyKey] || "🧚" : "🧚";
    }

    private rarityEmoji(rarity?: SpriteRarity) {
        const emojis: Record<SpriteRarity, string> = {
            rare: "🔵",
            epic: "🟣",
            legendary: "🟠",
            mythic: "🟡",
            special: "✨"
        };
        return rarity ? emojis[rarity] || "💠" : "💠";
    }

    private variantEmoji(variant?: SpriteVariantName) {
        const emojis: Record<SpriteVariantName, string> = {
            Base: "🌱",
            Candy: "🍬",
            Galaxy: "🌌",
            Gold: "🏆"
        };
        return variant ? emojis[variant] || "🎨" : "🎨";
    }

    private formatVariantBrief(variant?: SpriteVariant) {
        if (!variant) return "Sprite";
        return `${this.rarityEmoji(variant.rarity)} ${this.titleCase(variant.rarity)}, ${this.formatChance(variant)}, ${variant.summonCost.toLocaleString("en-US")} cost`;
    }

    private formatChance(variant: SpriteVariant) {
        if (variant.chancePercent === 0) return "Unavailable";
        return variant.chanceLabel;
    }

    private variantLabel(variant: SpriteVariantName) {
        return variant === "Candy" ? "Gummy" : variant;
    }

    private getVariantNames() {
        const names = Array.from(new Set(this.getAllVariants().map(variant => variant.variant)));
        const preferredOrder = ["Base", "Gold", "Candy", "Galaxy"];
        return names.sort((a, b) => {
            const aIndex = preferredOrder.indexOf(a);
            const bIndex = preferredOrder.indexOf(b);
            if (aIndex !== -1 || bIndex !== -1) {
                if (aIndex === -1) return 1;
                if (bIndex === -1) return -1;
                return aIndex - bIndex;
            }
            return this.variantLabel(a).localeCompare(this.variantLabel(b));
        });
    }

    private titleCase(value: string) {
        return value.split(/[\s_-]+/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
    }

    private truncate(value: string, length: number) {
        if (value.length <= length) return value;
        return value.substring(0, length - 3) + "...";
    }

    private extractOwnerId(customId: string): string | null {
        const pipeIndex = customId.lastIndexOf("|");
        if (pipeIndex === -1) return null;
        return customId.substring(pipeIndex + 1);
    }

    private stripOwnerId(customId: string): string {
        const pipeIndex = customId.lastIndexOf("|");
        if (pipeIndex === -1) return customId;
        return customId.substring(0, pipeIndex);
    }

    private async getDisplayName(i: SelectMenuInteraction<CacheType> | ButtonInteraction<CacheType> | CommandInteraction<CacheType>): Promise<string> {
        let member = i.member as any;

        if (i.guild && (!member || (!member.nickname && !member.nick))) {
            try {
                member = await i.guild.members.fetch(i.user.id);
            } catch (e) { }
        }

        const user = i.user as any;
        const nickname = member?.nickname || member?.nick;
        let globalName = user?.globalName || user?.global_name;

        if (!nickname && !globalName) {
            try {
                const res = await axios.get(`https://discord.com/api/v10/users/${i.user.id}`, {
                    headers: { Authorization: `Bot ${i.client.token}` }
                });
                globalName = res.data.global_name;
            } catch (e) {
                console.error("[FortniteSprites] Failed to fetch raw user for global_name", e);
            }
        }

        return nickname || globalName || user?.username || "User";
    }

    private async handleSelectMenu(i: SelectMenuInteraction<CacheType>) {
        if (!this._data) return i.reply({ content: "Sprite data is not loaded yet.", ephemeral: true });

        const rawId = this.stripOwnerId(i.customId);
        const ownerId = this.extractOwnerId(i.customId) || i.user.id;
        const isOriginalUser = i.user.id === ownerId;
        const spawnsNewPage = rawId === "fn_sprites_family_select" || rawId.startsWith("fn_sprites_variant_select_");

        if (spawnsNewPage || !isOriginalUser) {
            await i.deferReply({ ephemeral: !isOriginalUser && !spawnsNewPage });
        } else {
            await i.deferUpdate();
        }

        const displayName = await this.getDisplayName(i);
        const responseOwnerId = isOriginalUser ? ownerId : i.user.id;

        let response: any;
        if (rawId === "fn_sprites_family_select") {
            response = await this.generateFamilyResponse(i.values[0], responseOwnerId, i.user, displayName);
        } else if (rawId.startsWith("fn_sprites_variant_select_")) {
            const id = parseInt(i.values[0], 10);
            const match = this.findVariant(id);
            if (!match) return i.reply({ content: "Sprite variant not found.", ephemeral: true });
            response = await this.generateDetailResponse(match.family, match.variant, responseOwnerId, i.user, displayName);
        } else if (rawId === "fn_sprites_quick_filter") {
            response = await this.generateOverviewResponse(this.stateFromQuickFilter(i.values[0]), responseOwnerId, i.user, displayName);
        } else if (rawId === "fn_sprites_variant_filter") {
            response = await this.generateOverviewResponse({ variantFilter: i.values[0] as any }, responseOwnerId, i.user, displayName);
        } else if (rawId === "fn_sprites_rarity_filter") {
            response = await this.generateOverviewResponse({ rarityFilter: i.values[0] as any }, responseOwnerId, i.user, displayName);
        }

        if (!response) {
            if (spawnsNewPage || !isOriginalUser) return i.editReply({ content: "That sprite control is no longer available.", components: [] });
            return i.followUp({ content: "That sprite control is no longer available.", ephemeral: true });
        }

        if (spawnsNewPage || !isOriginalUser) {
            return i.editReply(response);
        }

        return i.editReply({ ...response, attachments: [] } as any);
    }

    private async handleButton(i: ButtonInteraction<CacheType>) {
        if (!this._data) return i.reply({ content: "Sprite data is not loaded yet.", ephemeral: true });

        const rawId = this.stripOwnerId(i.customId);
        const ownerId = this.extractOwnerId(i.customId) || i.user.id;
        const isOriginalUser = i.user.id === ownerId;
        if (isOriginalUser) {
            await i.deferUpdate();
        } else {
            await i.deferReply();
        }

        const displayName = await this.getDisplayName(i);
        const responseOwnerId = isOriginalUser ? ownerId : i.user.id;
        let response: any;

        if (rawId === "fn_sprites_overview") {
            response = await this.generateOverviewResponse({}, responseOwnerId, i.user, displayName);
        } else if (rawId.startsWith("fn_sprites_family_page_")) {
            const page = parseInt(rawId.replace("fn_sprites_family_page_", ""), 10);
            response = await this.generateOverviewResponse({ familyPage: Number.isFinite(page) ? page : 0 }, responseOwnerId, i.user, displayName);
        } else if (rawId.startsWith("fn_sprites_family_")) {
            const familyKey = rawId.replace("fn_sprites_family_", "");
            response = await this.generateFamilyResponse(familyKey, responseOwnerId, i.user, displayName);
        } else if (rawId.startsWith("fn_sprites_variant_")) {
            const id = parseInt(rawId.replace("fn_sprites_variant_", ""), 10);
            const match = this.findVariant(id);
            if (!match) {
                if (isOriginalUser) return i.followUp({ content: "Sprite variant not found.", ephemeral: true });
                return i.editReply({ content: "Sprite variant not found.", components: [] });
            }
            response = await this.generateDetailResponse(match.family, match.variant, responseOwnerId, i.user, displayName);
        } else if (rawId === "fn_sprites_quick_starters") {
            response = await this.generateOverviewResponse({ starterOnly: true }, responseOwnerId, i.user, displayName);
        } else if (rawId === "fn_sprites_quick_rarest") {
            response = await this.generateOverviewResponse({ rarityFilter: "mythic" }, responseOwnerId, i.user, displayName);
        } else if (rawId === "fn_sprites_quick_cost") {
            const variant = this.getAllVariants().sort((a, b) => b.summonCost - a.summonCost)[0];
            const match = this.findVariant(variant?.id);
            if (match) response = await this.generateDetailResponse(match.family, match.variant, responseOwnerId, i.user, displayName);
        } else if (rawId === "fn_sprites_quick_random") {
            const variants = this.getAllVariants();
            const variant = variants[Math.floor(Math.random() * variants.length)];
            const match = this.findVariant(variant?.id);
            if (match) response = await this.generateDetailResponse(match.family, match.variant, responseOwnerId, i.user, displayName);
        }

        if (!response) {
            if (isOriginalUser) return i.followUp({ content: "That sprite control is no longer available.", ephemeral: true });
            return i.editReply({ content: "That sprite control is no longer available.", components: [] });
        }

        if (!isOriginalUser) {
            return i.editReply(response);
        }

        return i.editReply({ ...response, attachments: [] } as any);
    }
}
