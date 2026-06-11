import { AutocompleteInteraction, BaseCommandInteraction, CacheType, Client, MessageActionRow, MessageAttachment, MessageButton, MessageEmbed, MessageSelectMenu, SelectMenuInteraction, ButtonInteraction } from "discord.js";
import axios from "axios";
import { version as appVersion } from "../../index";
import Fuse from "fuse.js";
import * as fs from "fs";
import * as path from "path";
import https from "https";

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

    constructor(private client: Client) {
        this.loadData();
        this.syncLatestMap();

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

    private loadData() {
        try {
            const dataPath = path.join(process.cwd(), "src", "Fortnite", "FortniteMap", "mapData.json");
            const fileContent = fs.readFileSync(dataPath, "utf8");
            const parsed = JSON.parse(fileContent);
            const rawData: MapHistoryItem[] = Array.isArray(parsed) ? parsed : (parsed.data || []);

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

    private async syncLatestMap() {
        try {
            require("dotenv").config();
            const apiKey = process.env.FORTNITE_MAP_API_KEY;
            if (!apiKey) {
                console.log("[FortniteMap] No API key found for syncLatestMap");
                return;
            }

            const historyRes = await axios.get("https://prod.api-fortnite.com/api/v1/map/history", {
                headers: { "x-api-key": apiKey },
                httpsAgent: new https.Agent({ rejectUnauthorized: false })
            });

            const history: MapHistoryItem[] = historyRes.data.data;
            if (!history || history.length === 0) return;

            const dataPath = path.join(process.cwd(), "src", "Fortnite", "FortniteMap", "mapData.json");
            let rawData: MapHistoryItem[] = [];
            try {
                const fileContent = fs.readFileSync(dataPath, "utf8");
                const parsed = JSON.parse(fileContent);
                rawData = Array.isArray(parsed) ? parsed : (parsed.data || []);
            } catch (e) {
                console.error("Failed to parse mapData.json during sync", e);
            }

            const existingVersions = new Set(rawData.map(d => d.version));
            const newEntries: MapHistoryItem[] = [];
            let hasNew = false;

            for (const h of history) {
                if (existingVersions.has(h.version)) {
                    continue;
                }
                
                console.log(`[FortniteMap] New map version detected from history: ${h.version}. Fetching details...`);
                hasNew = true;

                let detailed: any = { ...h };
                try {
                    const detailRes = await axios.get(`https://prod.api-fortnite.com/api/v1/map?version=${h.version}`, {
                        headers: { "x-api-key": apiKey },
                        httpsAgent: new https.Agent({ rejectUnauthorized: false })
                    });
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

                rawData = [...newEntries, ...rawData];
                fs.writeFileSync(dataPath, JSON.stringify(rawData, null, 2), "utf8");
                console.log(`[FortniteMap] Synced ${newEntries.length} new map versions.`);
                this.loadData();
            }
        } catch (e: any) {
            console.error("Failed to sync map history on startup:", e.message);
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
        const apiKey = process.env.FORTNITE_MAP_API_KEY;
        const response = await axios.get(`https://prod.api-fortnite.com/api/v1/map/image?version=${version}`, {
            responseType: 'arraybuffer',
            headers: {
                "x-api-key": apiKey
            },
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
        return Buffer.from(response.data, 'binary');
    }

    private async generateViewResponse(versionStr: string, showNav: boolean = false) {
        const item = this._data.find(d => d.version === versionStr);
        if (!item) return { content: "Version not found." };

        const embed = new MessageEmbed()
            .setTitle(this.formatLabel(item))
            .setColor("#2186DB")
            .setFooter({ text: appVersion })
            .setTimestamp();

        let files: MessageAttachment[] = [];
        if (item.hasImage) {
            try {
                const imageBuffer = await this.fetchMapImage(item.version);
                const attachment = new MessageAttachment(imageBuffer, "map.png");
                files.push(attachment);
            } catch (e) {
                console.error("Failed to fetch map image", e);
                embed.setDescription("Failed to fetch map image from API.");
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

        const prevRow = new MessageActionRow().addComponents(
            new MessageButton()
                .setCustomId(olderChapter ? `fn_map_page_chap_${olderChapter.version}` : 'prev_chap_disabled')
                .setLabel("<<< 🏝️ Chapter")
                .setStyle("SECONDARY")
                .setDisabled(!olderChapter),
            new MessageButton()
                .setCustomId(olderSeason ? `fn_map_page_season_${olderSeason.version}` : 'prev_season_disabled')
                .setLabel("<< 🌤️ Season")
                .setStyle("SUCCESS") // Green
                .setDisabled(!olderSeason),
            new MessageButton()
                .setCustomId(olderPatch ? `fn_map_page_patch_${olderPatch.version}` : 'prev_patch_disabled')
                .setLabel("< 📂 Patch")
                .setStyle("PRIMARY") // Blue
                .setDisabled(!olderPatch)
        );

        const nextRow = new MessageActionRow().addComponents(
            new MessageButton()
                .setCustomId(newerPatch ? `fn_map_page_patch_${newerPatch.version}` : 'next_patch_disabled')
                .setLabel("📂 Patch >")
                .setStyle("PRIMARY") // Blue
                .setDisabled(!newerPatch),
            new MessageButton()
                .setCustomId(newerSeason ? `fn_map_page_season_${newerSeason.version}` : 'next_season_disabled')
                .setLabel("🌤️ Season >>")
                .setStyle("SUCCESS") // Green
                .setDisabled(!newerSeason),
            new MessageButton()
                .setCustomId(newerChapter ? `fn_map_page_chap_${newerChapter.version}` : 'next_chap_disabled')
                .setLabel("🏝️ Chapter >>>")
                .setStyle("SECONDARY")
                .setDisabled(!newerChapter)
        );

        if (showNav) {
            return { embeds: [embed], files, components: [prevRow, nextRow] };
        } else {
            return { embeds: [embed], files, components: [] };
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

        const response = await this.generateViewResponse(version, false);
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

    private generateOptionsUI(chapter: number, season: number, page: number) {
        const chapters = this.getChapters();
        const seasons = this.getSeasons(chapter);
        const versions = this.getVersions(chapter, season);

        const chapterRow = new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`fn_map_chapter_${season}`)
                .setPlaceholder("Select Chapter")
                .addOptions(chapters.map(c => ({
                    label: `Chapter ${c}`,
                    value: c.toString(),
                    default: c === chapter
                })))
        );

        const seasonRow = new MessageActionRow().addComponents(
            new MessageSelectMenu()
                .setCustomId(`fn_map_season_${chapter}`)
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
                    .setCustomId(`fn_map_view_${v.version}`)
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
                    .setCustomId(`fn_map_nav_${chapter}_${season}_${page - 1}`)
                    .setLabel("Previous Page")
                    .setStyle("SECONDARY")
            );
        }
        if (page < totalPages - 1) {
            navRow.addComponents(
                new MessageButton()
                    .setCustomId(`fn_map_nav_${chapter}_${season}_${page + 1}`)
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

        const rows = this.generateOptionsUI(defaultChapter, defaultSeason, 0);

        const embed = new MessageEmbed()
            .setTitle(`Map Options - Chapter ${defaultChapter} ${this.getSeasonName(defaultChapter, defaultSeason)}`)
            .setDescription("Select a version to view the map.")
            .setColor("#2186DB");

        await i.reply({ embeds: [embed], components: rows });
    }

    private async handleSelectMenu(i: SelectMenuInteraction<CacheType>) {
        let chapter = 0;
        let season = 0;

        if (i.customId.startsWith("fn_map_chapter_")) {
            season = parseInt(i.customId.replace("fn_map_chapter_", ""));
            chapter = parseInt(i.values[0]);
            const availableSeasons = this.getSeasons(chapter);
            if (!availableSeasons.includes(season)) {
                season = availableSeasons[0];
            }
        } else if (i.customId.startsWith("fn_map_season_")) {
            chapter = parseInt(i.customId.replace("fn_map_season_", ""));
            season = parseInt(i.values[0]);
        }

        const rows = this.generateOptionsUI(chapter, season, 0);
        const embed = new MessageEmbed()
            .setTitle(`Map Options - Chapter ${chapter} ${this.getSeasonName(chapter, season)}`)
            .setDescription("Select a version to view the map.")
            .setColor("#2186DB")
            .setFooter({ text: appVersion })
            .setTimestamp();

        const isOriginalUser = i.message.interaction ? i.user.id === i.message.interaction.user.id : false;
        
        if (!isOriginalUser) {
            const displayName = (i.member as any)?.displayName || i.user.username;
            await i.reply({ content: `**${displayName}**,`, embeds: [embed], components: rows });
        } else {
            await i.update({ embeds: [embed], components: rows });
        }
    }

    private async handleButton(i: ButtonInteraction<CacheType>) {
        const isOriginalUser = i.message.interaction ? i.user.id === i.message.interaction.user.id : false;
        const displayName = (i.member as any)?.displayName || i.user.username;

        if (i.customId.startsWith("fn_map_view_")) {
            const version = i.customId.replace("fn_map_view_", "");
            await i.deferReply();
            const response: any = await this.generateViewResponse(version, true);
            if (!isOriginalUser) {
                response.content = response.content ? `**${displayName}**, ${response.content}` : `**${displayName}**,`;
            }
            await i.editReply(response);
        } else if (i.customId.startsWith("fn_map_page_")) {
            let version = i.customId;
            version = version.replace(/^fn_map_page_(chap|season|patch)_/, "");
            version = version.replace("fn_map_page_", "");

            if (!isOriginalUser) {
                await i.deferReply();
                const response: any = await this.generateViewResponse(version, true);
                response.content = response.content ? `**${displayName}**, ${response.content}` : `**${displayName}**,`;
                await i.editReply(response);
            } else {
                await i.deferUpdate();
                const response = await this.generateViewResponse(version, true);
                await i.editReply({ embeds: response.embeds, files: response.files, components: response.components, attachments: [] });
            }
        } else if (i.customId.startsWith("fn_map_nav_")) {
            const parts = i.customId.split("_");
            const chapter = parseInt(parts[3]);
            const season = parseInt(parts[4]);
            const page = parseInt(parts[5]);

            const rows = this.generateOptionsUI(chapter, season, page);
            const embed = new MessageEmbed()
                .setTitle(`Map Options - Chapter ${chapter} ${this.getSeasonName(chapter, season)} (Page ${page + 1})`)
                .setDescription("Select a version to view the map.")
                .setColor("#2186DB")
                .setFooter({ text: appVersion })
                .setTimestamp();

            if (!isOriginalUser) {
                await i.reply({ content: `**${displayName}**,`, embeds: [embed], components: rows });
            } else {
                await i.update({ embeds: [embed], components: rows });
            }
        }
    }
}
