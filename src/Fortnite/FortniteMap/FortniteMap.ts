import { AutocompleteInteraction, BaseCommandInteraction, CommandInteraction, CacheType, Client, MessageActionRow, MessageButton, MessageEmbed, MessageSelectMenu, SelectMenuInteraction, ButtonInteraction, User } from "discord.js";
import axios from "axios";
import { version as appVersion } from "../../index";
import Fuse from "fuse.js";
import * as fs from "fs";
import * as path from "path";
import https from "https";
import { ensureMapImageHosted, loadMapImageManifest, normalizeMapVersion, MapImageManifestEntry } from "./mapImageArchive";
import { registerComponent } from "../../runtimeDiagnostics";

type Poi = {
    name: string;
    x: number | null;
    y: number | null;
    type: string;
};

type MapHistoryItem = {
    version: string;
    chapter: number;
    season: number;
    patch: string;
    releaseDate: string | null;
    hasImage: boolean;
    imageUrl: string;
    hasPois: boolean;
    pois?: Poi[];
    parsedVersion?: { formatted: string, major: string, minor?: string, codename: string | null, isMajor: boolean };
};

export class FortniteMap {
    private _data: MapHistoryItem[] = [];
    private fuse: Fuse<any>;
    private _allSeasons: { chapter: number, season: number }[] = [];
    private _allChapters: number[] = [];
    private _seasonStarts: Map<string, MapHistoryItem> = new Map();
    private _chapterStarts: Map<number, MapHistoryItem> = new Map();
    private imageManifest: Record<string, MapImageManifestEntry> = {};

    constructor(private client: Client) {
        registerComponent("fortniteMap", this);
        this.loadData().then(() => this.syncLatestMap());

        this.client.on("interactionCreate", (i) => {
            if (i.isAutocomplete() && i.commandName === "fortnite" && i.options.getSubcommandGroup(false) === "map") {
                this.resolveAutocomplete(i);
            }
            if (i.isCommand() && i.commandName === "fortnite" && i.options.getSubcommandGroup(false) === "map") {
                if (i.options.getSubcommand(false) === "view") {
                    this.replyView(i);
                } else if (i.options.getSubcommand(false) === "options") {
                    this.replyOptions(i);
                }
            }
            if (i.isSelectMenu() && i.customId.startsWith("fn_map_")) {
                this.handleSelectMenu(i);
            }
            if (i.isButton() && i.customId.startsWith("fn_map_")) {
                this.handleButton(i);
            }
        });
    }

    public getDiagnostics() {
        return {
            versionsLoaded: this._data.length,
            seasonsLoaded: this._allSeasons.length,
            chaptersLoaded: this._allChapters.length,
            hostedImages: Object.keys(this.imageManifest).length,
        };
    }

    private getSeasonName(chapter: number, season: number) {
        let name = `Season ${season}`;

        if (chapter === 6) {
            if (season === 3) name = "- Galactic Battle (MS1)";
            if (season === 4) name = "Season 3";
            if (season === 5) name = "Season 4";
            if (season === 6) name = "- The Simpsons (MS2)";
        } else if (chapter === 4 && season === 5) {
            name = "Season OG";
        } else if (chapter === 5 && season === 5) {
            name = "- Chapter 2 Remix";
        }

        const emojis: Record<number, Record<number, string>> = {
            1: { 1: "🪂", 2: "🛡️", 3: "☄️", 4: "🎥", 5: "🏜️", 6: "🦇", 7: "❄️", 8: "🏴☠️", 9: "🏙️", 10: "⏳" },
            2: { 1: "🗺️", 2: "🕵️♂️", 3: "🌊", 4: "🌌", 5: "🎯", 6: "🦴", 7: "👽", 8: "🟪" },
            3: { 1: "🙃", 2: "🪖", 3: "🍄", 4: "⚫" },
            4: { 1: "🏰", 2: "🏣", 3: "🌴", 4: "🧛", 5: "⏪" },
            5: { 1: "🚇", 2: "🏛️", 3: "🎸", 4: "🟢", 5: "🎤" },
            6: { 1: "🎎", 2: "🥒", 3: "⭐", 4: "🦸♂️", 5: "🪲", 6: "📺" },
            7: { 1: "🏝️", 2: "⚔️", 3: "🏃" }
        };

        const emoji = emojis[chapter]?.[season];
        if (emoji) {
            return `${name} ${emoji}`;
        }
        return name;
    }

    private applyDataOverrides(data: MapHistoryItem[]): MapHistoryItem[] {
        // OVERRIDES: Add custom mappings for seasons that the API doesn't structure perfectly.
        // This runs dynamically after the JSON is loaded, so it persists even when the JSON is updated.
        const mapped = data.map(d => {
            if (d.chapter === 6) {
                const majorStr = d.version.split('_')[0];
                if (majorStr === '35') d.season = 3;
                if (majorStr === '36') d.season = 4;
                if (majorStr === '37') d.season = 5;
                if (majorStr === '38') d.season = 6; // The Simpsons
            }
            return d;
        });

        // Ensure data is properly sorted chronologically (Newest to Oldest)
        // Since the API sometimes returns items out of order (like 32-week-4 at the end)
        mapped.sort((a, b) => {
            if (a.chapter !== b.chapter) return b.chapter - a.chapter;
            if (a.season !== b.season) return b.season - a.season;

            const parseV = (v: string) => {
                const match = v.match(/^([0-9]+)_([0-9]+)/);
                if (match) return [parseInt(match[1]), parseInt(match[2])];
                const dotMatch = v.match(/^([0-9]+)\.([0-9]+)/);
                if (dotMatch) return [parseInt(dotMatch[1]), parseInt(dotMatch[2])];
                const hypenMatch = v.match(/^([0-9]+)-/);
                if (hypenMatch) return [parseInt(hypenMatch[1]), 0];
                return [0, 0];
            };

            const [aMajor, aMinor] = parseV(a.version);
            const [bMajor, bMinor] = parseV(b.version);

            if (aMajor !== bMajor) return bMajor - aMajor;
            if (aMinor !== bMinor) return bMinor - aMinor;

            if (a.version > b.version) return -1;
            if (a.version < b.version) return 1;
            return 0;
        });

        return mapped;
    }

    private normalizeVersion(version: string): string {
        return normalizeMapVersion(version);
    }

    private async loadData() {
        try {
            const dataPath = path.join(process.cwd(), "src", "Fortnite", "FortniteMap", "mapData.json");
            const fileContent = await fs.promises.readFile(dataPath, "utf8");
            const parsed = JSON.parse(fileContent);
            let rawData: MapHistoryItem[] = Array.isArray(parsed) ? parsed : (parsed.data || []);

            await this.loadImageManifest();

            // Deduplicate: normalize versions (dot vs underscore) and keep the underscore variant
            const seenNormalized = new Set<string>();
            rawData = rawData.filter(d => {
                const norm = this.normalizeVersion(d.version);
                if (seenNormalized.has(norm)) return false;
                seenNormalized.add(norm);
                return true;
            });

            // Apply overrides dynamically over the fresh JSON
            this._data = this.applyDataOverrides(rawData);

            this._data.forEach(item => {
                item.parsedVersion = this.parseVersion(item.version);
            });

            this._allSeasons = [];
            const seasonSet = new Set<string>();
            for (let i = this._data.length - 1; i >= 0; i--) {
                const d = this._data[i];
                const key = `${d.chapter}-${d.season}`;
                if (!seasonSet.has(key)) {
                    seasonSet.add(key);
                    this._allSeasons.push({ chapter: d.chapter, season: d.season });
                }
            }
            this._allChapters = Array.from(new Set(this._allSeasons.map(s => s.chapter)));

            this._seasonStarts.clear();
            this._chapterStarts.clear();

            for (const s of this._allSeasons) {
                const targetVersions = this._data.filter(d => d.chapter === s.chapter && d.season === s.season);
                if (targetVersions.length > 0) {
                    const major = targetVersions.find(d => d.parsedVersion?.isMajor);
                    const start = major || targetVersions[targetVersions.length - 1];
                    this._seasonStarts.set(`${s.chapter}-${s.season}`, start);
                }
            }

            for (const c of this._allChapters) {
                const targetVersions = this._data.filter(d => d.chapter === c);
                if (targetVersions.length > 0) {
                    const firstSeason = targetVersions[targetVersions.length - 1].season;
                    const start = this._seasonStarts.get(`${c}-${firstSeason}`);
                    if (start) this._chapterStarts.set(c, start);
                }
            }

            const fuseData = this._data.map(item => {
                const p = item.parsedVersion!;
                const dotVersion = p.minor ? `${p.major}.${p.minor}` : p.major;
                return {
                    ...item,
                    codename: p.codename,
                    formattedVersion: p.formatted,
                    dotVersion,
                    exactLabel: this.formatLabel(item),
                    searchable: `${p.formatted} Chapter ${item.chapter} ${this.getSeasonName(item.chapter, item.season)}`
                };
            });

            this.fuse = new Fuse(fuseData, {
                keys: [
                    { name: "version", weight: 0.2 },
                    { name: "formattedVersion", weight: 0.5 },
                    { name: "dotVersion", weight: 0.5 },
                    { name: "chapter", weight: 0.2 },
                    { name: "season", weight: 0.2 },
                    { name: "codename", weight: 0.8 },
                    { name: "searchable", weight: 0.5 },
                    { name: "exactLabel", weight: 1.0 },
                    { name: "pois.name", weight: 0.9 }
                ],
                threshold: 0.4,
                includeMatches: true
            });
        } catch (e) {
            console.error("Failed to load mapData.json", e);
        }
    }

    private async loadImageManifest() {
        try {
            const manifest = await loadMapImageManifest();
            this.imageManifest = manifest.versions || {};
        } catch (error: any) {
            if (error?.code !== "ENOENT") {
                console.warn("[FortniteMap] Failed to load map image manifest.", error);
            }
            this.imageManifest = {};
        }
    }

    private resolveHostedMapImageUrl(version: string): string | null {
        const entry = this.imageManifest[this.normalizeVersion(version)];
        return entry?.discordUrl || null;
    }


    private async syncLatestMap() {
        try {
            const apiKey = process.env.FORTNITE_MAP_API_KEY;
            if (!apiKey) {
                console.log("[FortniteMap] No API key found for syncLatestMap");
                return;
            }

            const fetchWithRetry = async (url: string, retries: number = 3) => {
                for (let i = 0; i < retries; i++) {
                    try {
                        return await axios.get(url, {
                            headers: { "x-api-key": apiKey },
                            httpsAgent: new https.Agent({ rejectUnauthorized: false })
                        });
                    } catch (err: any) {
                        const status = err.response?.status;
                        // Retry on 5xx errors or network failures
                        if (i < retries - 1 && (!status || status >= 500)) {
                            console.warn(`[FortniteMap] API error (${status || err.message}) on ${url}. Retrying in ${i + 1} seconds...`);
                            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
                            continue;
                        }
                        throw err;
                    }
                }
            };

            const historyRes = await fetchWithRetry("https://prod.api-fortnite.com/api/v1/map/history") as any;
            const history: MapHistoryItem[] = historyRes.data.data;
            if (!history || history.length === 0) return;

            const dataPath = path.join(process.cwd(), "src", "Fortnite", "FortniteMap", "mapData.json");
            let rawData: MapHistoryItem[] = [];
            try {
                const fileContent = await fs.promises.readFile(dataPath, "utf8");
                const parsed = JSON.parse(fileContent);
                rawData = Array.isArray(parsed) ? parsed : (parsed.data || []);
            } catch (e) {
                console.error("Failed to parse mapData.json during sync", e);
            }

            const existingVersions = new Set(rawData.map(d => this.normalizeVersion(d.version)));
            const newEntries: MapHistoryItem[] = [];
            let hasNew = false;

            for (const h of history) {
                if (existingVersions.has(this.normalizeVersion(h.version))) {
                    continue;
                }

                console.log(`[FortniteMap] New map version detected from history: ${h.version}. Fetching details...`);
                hasNew = true;

                let detailed: any = { ...h };
                try {
                    const detailRes = await fetchWithRetry(`https://prod.api-fortnite.com/api/v1/map?version=${h.version}`) as any;
                    detailed = detailRes.data.data;
                } catch (e: any) {
                    console.error(`[FortniteMap] Failed to fetch details for ${h.version}, using history fallback.`);
                    detailed.pois = [];
                }

                if (detailed.hasImage === undefined) detailed.hasImage = h.hasImage;
                newEntries.push(detailed);
            }

            if (hasNew && newEntries.length > 0) {
                let lastSeenPois = rawData.find(d => d.pois && d.pois.length > 0)?.pois || [];

                for (let i = newEntries.length - 1; i >= 0; i--) {
                    const entry = newEntries[i];
                    if (!entry.pois || entry.pois.length === 0) {
                        if (lastSeenPois.length > 0) {
                            entry.pois = lastSeenPois.map((p: any) => ({ ...p, type: "Inherited" }));
                            entry.hasPois = true;
                        } else {
                            entry.pois = [];
                            entry.hasPois = false;
                        }
                    } else {
                        lastSeenPois = entry.pois;
                        entry.hasPois = true;
                    }
                }

                for (const entry of newEntries) {
                    if (!entry.hasImage) {
                        continue;
                    }

                    try {
                        const manifestEntry = await ensureMapImageHosted({
                            version: entry.version,
                            chapter: entry.chapter,
                            season: entry.season
                        }, apiKey, this.client);

                        this.imageManifest[this.normalizeVersion(entry.version)] = manifestEntry;
                    } catch (error: any) {
                        console.warn(`[FortniteMap] Failed to host map image for ${entry.version}: ${error.message}`);
                    }
                }

                rawData = [...newEntries, ...rawData];
                await fs.promises.writeFile(dataPath, JSON.stringify(rawData, null, 2), "utf8");
                console.log(`[FortniteMap] Synced ${newEntries.length} new map versions.`);
                await this.loadData();
            }
        } catch (e: any) {
            const status = e.response?.status || e.status;
            if (status === 502 || status === 503) {
                console.warn(`[FortniteMap] Map API is currently unavailable (Status: ${status}). Falling back to local cached data.`);
            } else {
                console.error("[FortniteMap] Failed to sync map history on startup:", e.message);
            }
        }
    }

    private parseVersion(versionStr: string) {
        const match = versionStr.match(/^([0-9]+)_([0-9]+)(?:-\((.*)\))?$/);
        if (!match) return { formatted: `v${versionStr}`, major: versionStr, codename: null, isMajor: false };

        const major = match[1];
        const minor = match[2];
        const rawCodename = match[3];

        let codename = null;
        if (rawCodename) {
            codename = rawCodename.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
            codename = codename.replace("Lvl", "Level");
        }

        const isMajor = minor === "00" && !codename;
        const formatted = `v${major}.${minor}`;

        return { formatted, major, minor, codename, isMajor };
    }

    private formatLabel(item: MapHistoryItem, matchedPoi?: string) {
        const p = item.parsedVersion || this.parseVersion(item.version);
        let label = `Chapter ${item.chapter} ${this.getSeasonName(item.chapter, item.season)} (${p.formatted} 📁)`;
        if (p.codename) label += ` - ${p.codename}`;
        if (matchedPoi) label += ` (${matchedPoi})`;
        return label;
    }

    private resolveAutocomplete(i: AutocompleteInteraction<CacheType>) {
        const query = i.options.getFocused(true).value as string;
        if (!query) {
            const top3 = this._data.slice(0, 3);
            const majorVersions = this._data.filter(d => (d.parsedVersion || this.parseVersion(d.version)).isMajor && !top3.includes(d));
            const recent = [...top3, ...majorVersions].slice(0, 25).map(item => ({
                name: this.formatLabel(item),
                value: `v${item.version.replace("_", ".")}`
            }));
            return i.respond(recent);
        }

        const fuseResults = this.fuse.search(query);
        let rawResults = fuseResults.map(r => {
            let matchedPoi: string | undefined = undefined;
            if (r.matches) {
                const poiMatch = r.matches.find(m => m.key === "pois.name");
                if (poiMatch && poiMatch.value) {
                    matchedPoi = poiMatch.value;
                }
            }
            return { item: r.item, matchedPoi };
        });

        const qLower = query.toLowerCase();
        const isMajorIntent = qLower.includes("chapter") || qLower.includes("season") || qLower.includes("00");
        const isCodenameIntent = qLower.includes("water") || qLower.includes("week") || qLower.includes("stage");

        const chapterMatch = qLower.match(/chapter\s*(\d+)/);
        const seasonMatch = qLower.match(/season\s*(\d+)/);

        if (chapterMatch) {
            const targetChapter = parseInt(chapterMatch[1]);
            rawResults = rawResults.filter(r => r.item.chapter === targetChapter);
        }
        if (seasonMatch) {
            const targetSeason = parseInt(seasonMatch[1]);
            rawResults = rawResults.filter(r => r.item.season === targetSeason);
        }

        if (isMajorIntent && !isCodenameIntent) {
            rawResults = rawResults.filter(r => (r.item.parsedVersion || this.parseVersion(r.item.version)).isMajor);
        } else if (!isMajorIntent && !isCodenameIntent) {
            rawResults = rawResults.filter(r => !(r.item.parsedVersion || this.parseVersion(r.item.version)).isMajor);
        }

        let sorted = [...rawResults];

        if (isCodenameIntent) {
            sorted.sort((a, b) => {
                const aP = a.item.parsedVersion || this.parseVersion(a.item.version);
                const bP = b.item.parsedVersion || this.parseVersion(b.item.version);
                if (aP.codename && !bP.codename) return -1;
                if (!aP.codename && bP.codename) return 1;
                return 0;
            });
        } else if (isMajorIntent) {
            sorted.sort((a, b) => {
                const aP = a.item.parsedVersion || this.parseVersion(a.item.version);
                const bP = b.item.parsedVersion || this.parseVersion(b.item.version);
                if (aP.isMajor && !bP.isMajor) return -1;
                if (!aP.isMajor && bP.isMajor) return 1;
                return 0;
            });
        }

        const results = sorted.slice(0, 25).map(r => ({
            name: this.formatLabel(r.item, r.matchedPoi),
            value: `v${r.item.version.replace("_", ".")}`
        }));

        i.respond(results);
    }

    private async fetchMapImage(version: string) {
        const hostedImageUrl = this.resolveHostedMapImageUrl(version);
        if (hostedImageUrl) {
            return hostedImageUrl;
        }

        throw new Error(`No Discord-hosted map image found for version ${version}`);
    }

    private async generateViewResponse(versionStr: string, showNav: boolean = false, ownerId?: string, user?: User, displayName?: string) {
        const item = this._data.find(d => d.version === versionStr);
        if (!item) return { content: "Version not found." };

        const embed = new MessageEmbed()
            .setTitle(this.formatLabel(item))
            .setColor("#2186DB")
            .setFooter({ text: appVersion })
            .setTimestamp();

        if (user && displayName) {
            embed.setAuthor({ name: displayName, iconURL: user.displayAvatarURL({ dynamic: true }) });
        } else if (user) {
            embed.setAuthor({ name: user.username, iconURL: user.displayAvatarURL({ dynamic: true }) });
        }

        if (item.hasImage) {
            try {
                const imageAsset = await this.fetchMapImage(item.version);
                embed.setImage(imageAsset);
            } catch (e) {
                console.error("Failed to fetch map image", e);
                embed.setDescription("Failed to load the Discord-hosted map image for this version.");
            }
        } else {
            embed.setDescription("No image available for this version.");
        }

        const getStartOfSeason = (chapter: number, season: number) => {
            return this._seasonStarts.get(`${chapter}-${season}`) || null;
        };

        const getStartOfChapter = (chapter: number) => {
            return this._chapterStarts.get(chapter) || null;
        };

        const seasonVersions = this._data.filter(d => d.chapter === item.chapter && d.season === item.season);
        const svIndex = seasonVersions.findIndex(d => d.version === item.version);
        const newerPatch = svIndex > 0 ? seasonVersions[svIndex - 1] : null;
        const olderPatch = svIndex < seasonVersions.length - 1 ? seasonVersions[svIndex + 1] : null;

        const currentSeasonIndex = this._allSeasons.findIndex(s => s.chapter === item.chapter && s.season === item.season);
        const prevSeasonTarget = currentSeasonIndex > 0 ? this._allSeasons[currentSeasonIndex - 1] : null;
        const nextSeasonTarget = currentSeasonIndex < this._allSeasons.length - 1 ? this._allSeasons[currentSeasonIndex + 1] : null;

        const olderSeason = prevSeasonTarget ? getStartOfSeason(prevSeasonTarget.chapter, prevSeasonTarget.season) : null;
        const newerSeason = nextSeasonTarget ? getStartOfSeason(nextSeasonTarget.chapter, nextSeasonTarget.season) : null;

        const currentChapterIndex = this._allChapters.indexOf(item.chapter);
        const prevChapterTarget = currentChapterIndex > 0 ? this._allChapters[currentChapterIndex - 1] : null;
        const nextChapterTarget = currentChapterIndex < this._allChapters.length - 1 ? this._allChapters[currentChapterIndex + 1] : null;

        const olderChapter = prevChapterTarget !== null ? getStartOfChapter(prevChapterTarget) : null;
        const newerChapter = nextChapterTarget !== null ? getStartOfChapter(nextChapterTarget) : null;

        const ownerSuffix = ownerId ? `|${ownerId}` : '';

        const prevRow = new MessageActionRow().addComponents(
            new MessageButton()
                .setCustomId(olderChapter ? `fn_map_page_chap_${olderChapter.version}${ownerSuffix}` : 'prev_chap_disabled')
                .setLabel("<<< 🏝️ Chapter")
                .setStyle("SECONDARY")
                .setDisabled(!olderChapter),
            new MessageButton()
                .setCustomId(olderSeason ? `fn_map_page_season_${olderSeason.version}${ownerSuffix}` : 'prev_season_disabled')
                .setLabel("<< 🌤️ Season")
                .setStyle("SUCCESS") // Green
                .setDisabled(!olderSeason),
            new MessageButton()
                .setCustomId(olderPatch ? `fn_map_page_patch_${olderPatch.version}${ownerSuffix}` : 'prev_patch_disabled')
                .setLabel("< 📂 Patch")
                .setStyle("PRIMARY") // Blue
                .setDisabled(!olderPatch)
        );

        const nextRow = new MessageActionRow().addComponents(
            new MessageButton()
                .setCustomId(newerPatch ? `fn_map_page_patch_${newerPatch.version}${ownerSuffix}` : 'next_patch_disabled')
                .setLabel("📂 Patch >")
                .setStyle("PRIMARY") // Blue
                .setDisabled(!newerPatch),
            new MessageButton()
                .setCustomId(newerSeason ? `fn_map_page_season_${newerSeason.version}${ownerSuffix}` : 'next_season_disabled')
                .setLabel("🌤️ Season >>")
                .setStyle("SUCCESS") // Green
                .setDisabled(!newerSeason),
            new MessageButton()
                .setCustomId(newerChapter ? `fn_map_page_chap_${newerChapter.version}${ownerSuffix}` : 'next_chap_disabled')
                .setLabel("🏝️ Chapter >>>")
                .setStyle("SECONDARY")
                .setDisabled(!newerChapter)
        );

        if (showNav) {
            return { embeds: [embed], files: [], components: [prevRow, nextRow] };
        } else {
            return { embeds: [embed], files: [], components: [] };
        }
    }

    private async replyView(i: BaseCommandInteraction<CacheType>) {
        await i.deferReply();
        let versionRaw = i.options.get("version")?.value as string;
        let version = versionRaw;

        if (version) {
            // Check if it's an exact match for the label, autocomplete value, or internal version
            const matchedItem = this._data.find(d =>
                this.formatLabel(d) === version ||
                `v${d.version.replace("_", ".")}` === version ||
                d.version === version
            );

            if (matchedItem) {
                version = matchedItem.version;
            } else {
                // If the user pasted something like "Chapter 7 Season 2 ⚔ (v40.00 📁)" but the string 
                // match failed due to invisible characters or slight variation, extract via regex
                const vMatch = version.match(/v([0-9]+(?:\.[0-9]+)?(?:-\([^)]+\))?)/);
                if (vMatch) {
                    version = vMatch[1].replace(".", "_");
                } else {
                    version = version.replace(/^v/i, "").replace(".", "_");
                }
            }
        }

        const displayName = await this.getDisplayName(i as any);
        const response = await this.generateViewResponse(version, false, i.user.id, i.user as User, displayName);
        await i.editReply(response);
    }

    private getChapters() {
        return [...this._allChapters].reverse();
    }

    private getSeasons(chapter: number) {
        return this._allSeasons.filter(s => s.chapter === chapter).map(s => s.season).reverse();
    }

    private getVersions(chapter: number, season: number) {
        return this._data.filter(d => d.chapter === chapter && d.season === season).reverse();
    }

    private generateOptionsUI(chapter: number, season: number, page: number, ownerId: string) {
        const chapters = this.getChapters();
        const seasons = this.getSeasons(chapter);
        const versions = this.getVersions(chapter, season);

        const ownerSuffix = `|${ownerId}`;

        const chapterRow = new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`fn_map_chapter_${season}${ownerSuffix}`)
                .setPlaceholder("Select Chapter")
                .addOptions(chapters.map(c => ({
                    label: `Chapter ${c}`,
                    value: c.toString(),
                    default: c === chapter
                })))
        );

        const seasonRow = new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`fn_map_season_${chapter}${ownerSuffix}`)
                .setPlaceholder("Select Season")
                .addOptions(seasons.map(s => ({
                    label: this.getSeasonName(chapter, s),
                    value: s.toString(),
                    default: s === season
                })))
        );

        const ITEMS_PER_PAGE = 10; // 2 rows for menus, 2 rows for buttons (5 each), 1 row for nav
        const totalPages = Math.ceil(versions.length / ITEMS_PER_PAGE);
        const currentVersions = versions.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

        const rows = [chapterRow, seasonRow];

        let currentRow = new MessageActionRow();
        currentVersions.forEach((v, index) => {
            const p = v.parsedVersion || this.parseVersion(v.version);
            let label = `${p.formatted} 📁`;
            if (p.codename) label += ` (${p.codename})`;
            // button labels max length is 80
            if (label.length > 80) label = label.substring(0, 77) + "...";

            currentRow.addComponents(
                new MessageButton()
                    .setCustomId(`fn_map_view_${v.version}${ownerSuffix}`)
                    .setLabel(label)
                    .setStyle("PRIMARY")
            );

            if (currentRow.components.length === 5) {
                rows.push(currentRow);
                currentRow = new MessageActionRow();
            }
        });

        if (currentRow.components.length > 0) {
            rows.push(currentRow);
        }

        const navRow = new MessageActionRow();
        if (page > 0) {
            navRow.addComponents(
                new MessageButton()
                    .setCustomId(`fn_map_nav_${chapter}_${season}_${page - 1}${ownerSuffix}`)
                    .setLabel("Previous Page")
                    .setStyle("SECONDARY")
            );
        }
        if (page < totalPages - 1) {
            navRow.addComponents(
                new MessageButton()
                    .setCustomId(`fn_map_nav_${chapter}_${season}_${page + 1}${ownerSuffix}`)
                    .setLabel("Next Page")
                    .setStyle("SECONDARY")
            );
        }

        if (navRow.components.length > 0) {
            rows.push(navRow);
        }

        return rows;
    }

    private async replyOptions(i: BaseCommandInteraction<CacheType>) {
        const chapters = this.getChapters();
        const defaultChapter = chapters[0];
        const defaultSeason = this.getSeasons(defaultChapter)[0];

        const rows = this.generateOptionsUI(defaultChapter, defaultSeason, 0, i.user.id);

        const displayName = await this.getDisplayName(i as any);
        const embed = new MessageEmbed()
            .setTitle(`Map Options - Chapter ${defaultChapter} ${this.getSeasonName(defaultChapter, defaultSeason)}`)
            .setDescription("Select a version to view the map.")
            .setColor("#2186DB")
            .setAuthor({ name: displayName, iconURL: i.user.displayAvatarURL({ dynamic: true }) });

        await i.reply({ embeds: [embed], components: rows });
    }

    private extractOwnerId(customId: string): string | null {
        const pipeIndex = customId.lastIndexOf('|');
        if (pipeIndex === -1) return null;
        return customId.substring(pipeIndex + 1);
    }

    private stripOwnerId(customId: string): string {
        const pipeIndex = customId.lastIndexOf('|');
        if (pipeIndex === -1) return customId;
        return customId.substring(0, pipeIndex);
    }

    private async getDisplayName(i: SelectMenuInteraction<CacheType> | ButtonInteraction<CacheType> | CommandInteraction<CacheType>): Promise<string> {
        let member = i.member as any;
        
        if (i.guild && (!member || (!member.nickname && !member.nick))) {
            try {
                member = await i.guild.members.fetch(i.user.id);
            } catch (e) {}
        }

        const user = i.user as any;
        const nickname = member?.nickname || member?.nick;
        
        let globalName = user?.globalName || user?.global_name;
        
        if (!nickname && !globalName) {
            try {
                const fetchedUser = await i.client.users.fetch(i.user.id, { force: true });
                globalName = (fetchedUser as any).globalName || (fetchedUser as any).global_name || fetchedUser.username;
            } catch (e) {
                console.error("[FortniteMap] Failed to fetch raw user for global_name", e);
            }
        }
        
        const name = nickname || globalName || user?.username || "User";
        return name;
    }

    private async handleSelectMenu(i: SelectMenuInteraction<CacheType>) {
        const rawId = this.stripOwnerId(i.customId);
        const ownerId = this.extractOwnerId(i.customId) || i.user.id;
        const isOriginalUser = i.user.id === ownerId;

        let chapter = 0;
        let season = 0;

        if (rawId.startsWith("fn_map_chapter_")) {
            season = parseInt(rawId.replace("fn_map_chapter_", ""));
            chapter = parseInt(i.values[0]);
            const availableSeasons = this.getSeasons(chapter);
            if (!availableSeasons.includes(season)) {
                season = availableSeasons[0];
            }
        } else if (rawId.startsWith("fn_map_season_")) {
            chapter = parseInt(rawId.replace("fn_map_season_", ""));
            season = parseInt(i.values[0]);
        }

        const displayName = await this.getDisplayName(i);

        if (!isOriginalUser) {
            // Another user clicked — send them their own options UI
            const rows = this.generateOptionsUI(chapter, season, 0, i.user.id);
            const embed = new MessageEmbed()
                .setTitle(`Map Options - Chapter ${chapter} ${this.getSeasonName(chapter, season)}`)
                .setDescription("Select a version to view the map.")
                .setColor("#2186DB")
                .setAuthor({ name: displayName, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
                .setFooter({ text: appVersion })
                .setTimestamp();
            await i.reply({ embeds: [embed], components: rows });
        } else {
            const rows = this.generateOptionsUI(chapter, season, 0, ownerId);
            const embed = new MessageEmbed()
                .setTitle(`Map Options - Chapter ${chapter} ${this.getSeasonName(chapter, season)}`)
                .setDescription("Select a version to view the map.")
                .setColor("#2186DB")
                .setAuthor({ name: displayName, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
                .setFooter({ text: appVersion })
                .setTimestamp();
            await i.update({ embeds: [embed], components: rows });
        }
    }

    private async handleButton(i: ButtonInteraction<CacheType>) {
        const rawId = this.stripOwnerId(i.customId);
        const ownerId = this.extractOwnerId(i.customId) || i.user.id;
        const isOriginalUser = i.user.id === ownerId;
        const displayName = await this.getDisplayName(i);

        if (rawId.startsWith("fn_map_view_")) {
            const version = rawId.replace("fn_map_view_", "");
            
            if (!isOriginalUser) {
                await i.deferReply();
                const response: any = await this.generateViewResponse(version, true, i.user.id, i.user, displayName);
                await i.editReply(response);
            } else {
                await i.deferReply();
                const response: any = await this.generateViewResponse(version, true, ownerId, i.user, displayName);
                await i.editReply(response);
            }
        } else if (rawId.startsWith("fn_map_page_")) {
            let version = rawId;
            version = version.replace(/^fn_map_page_(chap|season|patch)_/, "");
            version = version.replace("fn_map_page_", "");

            if (!isOriginalUser) {
                await i.deferReply();
                const response: any = await this.generateViewResponse(version, true, i.user.id, i.user, displayName);
                await i.editReply(response);
            } else {
                await i.deferUpdate();
                const response = await this.generateViewResponse(version, true, ownerId, i.user, displayName);
                await i.editReply({ embeds: response.embeds, files: response.files, components: response.components, attachments: [] });
            }
        } else if (rawId.startsWith("fn_map_nav_")) {
            const parts = rawId.split("_");
            const chapter = parseInt(parts[3]);
            const season = parseInt(parts[4]);
            const page = parseInt(parts[5]);

            if (!isOriginalUser) {
                const rows = this.generateOptionsUI(chapter, season, page, i.user.id);
                const embed = new MessageEmbed()
                    .setTitle(`Map Options - Chapter ${chapter} ${this.getSeasonName(chapter, season)} (Page ${page + 1})`)
                    .setDescription("Select a version to view the map.")
                    .setColor("#2186DB")
                    .setAuthor({ name: displayName, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
                    .setFooter({ text: appVersion })
                    .setTimestamp();
                await i.reply({ embeds: [embed], components: rows });
            } else {
                const rows = this.generateOptionsUI(chapter, season, page, ownerId);
                const embed = new MessageEmbed()
                    .setTitle(`Map Options - Chapter ${chapter} ${this.getSeasonName(chapter, season)} (Page ${page + 1})`)
                    .setDescription("Select a version to view the map.")
                    .setColor("#2186DB")
                    .setAuthor({ name: displayName, iconURL: i.user.displayAvatarURL({ dynamic: true }) })
                    .setFooter({ text: appVersion })
                    .setTimestamp();
                await i.update({ embeds: [embed], components: rows });
            }
        }
    }
}
