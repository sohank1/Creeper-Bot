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
};

export class FortniteMap {
    private _data: MapHistoryItem[] = [];
    private fuse: Fuse<any>;

    constructor(private client: Client) {
        this.loadData();

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
        return data.map(d => {
            if (d.chapter === 6) {
                const majorStr = d.version.split('_')[0];
                if (majorStr === '35') d.season = 3;
                if (majorStr === '36') d.season = 4;
                if (majorStr === '37') d.season = 5;
                if (majorStr === '38') d.season = 6; // The Simpsons
            }
            return d;
        });
    }

    private loadData() {
        try {
            const dataPath = path.join(process.cwd(), "src", "Fortnite", "FortniteMap", "mapData.json");
            const fileContent = fs.readFileSync(dataPath, "utf8");
            const parsed = JSON.parse(fileContent);
            const rawData: MapHistoryItem[] = Array.isArray(parsed) ? parsed : (parsed.data || []);

            // Apply overrides dynamically over the fresh JSON
            this._data = this.applyDataOverrides(rawData);

            const fuseData = this._data.map(item => {
                const parsedVersion = this.parseVersion(item.version);
                return {
                    ...item,
                    codename: parsedVersion.codename,
                    searchable: `${parsedVersion.formatted} Chapter ${item.chapter} ${this.getSeasonName(item.chapter, item.season)}`
                };
            });

            this.fuse = new Fuse(fuseData, {
                keys: [
                    { name: "version", weight: 0.5 },
                    { name: "chapter", weight: 0.2 },
                    { name: "season", weight: 0.2 },
                    { name: "codename", weight: 0.8 },
                    { name: "searchable", weight: 0.5 },
                    { name: "pois.name", weight: 0.9 }
                ],
                threshold: 0.4,
                includeMatches: true
            });
        } catch (e) {
            console.error("Failed to load mapData.json", e);
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
        const p = this.parseVersion(item.version);
        let label = `Chapter ${item.chapter} ${this.getSeasonName(item.chapter, item.season)} (${p.formatted})`;
        if (p.codename) label += ` - ${p.codename}`;
        if (matchedPoi) label += ` (${matchedPoi})`;
        return label;
    }

    private resolveAutocomplete(i: AutocompleteInteraction<CacheType>) {
        const query = i.options.getFocused(true).value as string;
        if (!query) {
            const top3 = this._data.slice(0, 3);
            const majorVersions = this._data.filter(d => this.parseVersion(d.version).isMajor && !top3.includes(d));
            const recent = [...top3, ...majorVersions].slice(0, 25).map(item => ({
                name: this.formatLabel(item),
                value: item.version
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
            rawResults = rawResults.filter(r => this.parseVersion(r.item.version).isMajor);
        } else if (!isMajorIntent && !isCodenameIntent) {
            rawResults = rawResults.filter(r => !this.parseVersion(r.item.version).isMajor);
        }

        let sorted = [...rawResults];

        if (isCodenameIntent) {
            sorted.sort((a, b) => {
                const aP = this.parseVersion(a.item.version);
                const bP = this.parseVersion(b.item.version);
                if (aP.codename && !bP.codename) return -1;
                if (!aP.codename && bP.codename) return 1;
                return 0;
            });
        } else if (isMajorIntent) {
            sorted.sort((a, b) => {
                const aP = this.parseVersion(a.item.version);
                const bP = this.parseVersion(b.item.version);
                if (aP.isMajor && !bP.isMajor) return -1;
                if (!aP.isMajor && bP.isMajor) return 1;
                return 0;
            });
        }

        const results = sorted.slice(0, 25).map(r => ({
            name: this.formatLabel(r.item, r.matchedPoi),
            value: r.item.version
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
            const targetVersions = this._data.filter(d => d.chapter === chapter && d.season === season);
            if (targetVersions.length === 0) return null;
            const major = targetVersions.find(d => this.parseVersion(d.version).isMajor);
            return major || targetVersions[targetVersions.length - 1];
        };

        const getStartOfChapter = (chapter: number) => {
            const targetVersions = this._data.filter(d => d.chapter === chapter);
            if (targetVersions.length === 0) return null;
            const firstSeason = targetVersions[targetVersions.length - 1].season;
            return getStartOfSeason(chapter, firstSeason);
        };

        const allSeasons: { chapter: number, season: number }[] = [];
        const seasonSet = new Set<string>();
        for (let i = this._data.length - 1; i >= 0; i--) {
            const d = this._data[i];
            const key = `${d.chapter}-${d.season}`;
            if (!seasonSet.has(key)) {
                seasonSet.add(key);
                allSeasons.push({ chapter: d.chapter, season: d.season });
            }
        }

        const seasonVersions = this._data.filter(d => d.chapter === item.chapter && d.season === item.season);
        const svIndex = seasonVersions.findIndex(d => d.version === item.version);
        const newerPatch = svIndex > 0 ? seasonVersions[svIndex - 1] : null;
        const olderPatch = svIndex < seasonVersions.length - 1 ? seasonVersions[svIndex + 1] : null;

        const currentSeasonIndex = allSeasons.findIndex(s => s.chapter === item.chapter && s.season === item.season);
        const prevSeasonTarget = currentSeasonIndex > 0 ? allSeasons[currentSeasonIndex - 1] : null;
        const nextSeasonTarget = currentSeasonIndex < allSeasons.length - 1 ? allSeasons[currentSeasonIndex + 1] : null;

        const olderSeason = prevSeasonTarget ? getStartOfSeason(prevSeasonTarget.chapter, prevSeasonTarget.season) : null;
        const newerSeason = nextSeasonTarget ? getStartOfSeason(nextSeasonTarget.chapter, nextSeasonTarget.season) : null;

        const allChapters = Array.from(new Set(allSeasons.map(s => s.chapter)));
        const currentChapterIndex = allChapters.indexOf(item.chapter);
        const prevChapterTarget = currentChapterIndex > 0 ? allChapters[currentChapterIndex - 1] : null;
        const nextChapterTarget = currentChapterIndex < allChapters.length - 1 ? allChapters[currentChapterIndex + 1] : null;

        const olderChapter = prevChapterTarget !== null ? getStartOfChapter(prevChapterTarget) : null;
        const newerChapter = nextChapterTarget !== null ? getStartOfChapter(nextChapterTarget) : null;

        const prevRow = new MessageActionRow().addComponents(
            new MessageButton()
                .setCustomId(olderChapter ? `fn_map_page_chap_${olderChapter.version}` : 'prev_chap_disabled')
                .setLabel("<<< Chapter")
                .setStyle("SECONDARY")
                .setDisabled(!olderChapter),
            new MessageButton()
                .setCustomId(olderSeason ? `fn_map_page_season_${olderSeason.version}` : 'prev_season_disabled')
                .setLabel("<< Season")
                .setStyle("SUCCESS") // Green
                .setDisabled(!olderSeason),
            new MessageButton()
                .setCustomId(olderPatch ? `fn_map_page_patch_${olderPatch.version}` : 'prev_patch_disabled')
                .setLabel("< Patch")
                .setStyle("PRIMARY") // Blue
                .setDisabled(!olderPatch)
        );

        const nextRow = new MessageActionRow().addComponents(
            new MessageButton()
                .setCustomId(newerPatch ? `fn_map_page_patch_${newerPatch.version}` : 'next_patch_disabled')
                .setLabel("Patch >")
                .setStyle("PRIMARY") // Blue
                .setDisabled(!newerPatch),
            new MessageButton()
                .setCustomId(newerSeason ? `fn_map_page_season_${newerSeason.version}` : 'next_season_disabled')
                .setLabel("Season >>")
                .setStyle("SUCCESS") // Green
                .setDisabled(!newerSeason),
            new MessageButton()
                .setCustomId(newerChapter ? `fn_map_page_chap_${newerChapter.version}` : 'next_chap_disabled')
                .setLabel("Chapter >>>")
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
        const version = i.options.get("version")?.value as string;
        const response = await this.generateViewResponse(version, false);
        await i.editReply(response);
    }

    private getChapters() {
        const chapters = new Set(this._data.map(d => d.chapter));
        return Array.from(chapters).sort((a, b) => b - a);
    }

    private getSeasons(chapter: number) {
        const seasons = new Set(this._data.filter(d => d.chapter === chapter).map(d => d.season));
        return Array.from(seasons).sort((a, b) => b - a);
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
            const p = this.parseVersion(v.version);
            let label = p.formatted;
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

        await i.update({ embeds: [embed], components: rows });
    }

    private async handleButton(i: ButtonInteraction<CacheType>) {
        if (i.customId.startsWith("fn_map_view_")) {
            const version = i.customId.replace("fn_map_view_", "");
            await i.deferReply();
            const response = await this.generateViewResponse(version, true);
            await i.editReply(response);
        } else if (i.customId.startsWith("fn_map_page_")) {
            let version = i.customId;
            version = version.replace(/^fn_map_page_(chap|season|patch)_/, "");
            version = version.replace("fn_map_page_", "");

            const response = await this.generateViewResponse(version, true);
            await i.update(response);
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

            await i.update({ embeds: [embed], components: rows });
        } else if (i.customId.startsWith("fn_map_page_")) {
            const version = i.customId.replace("fn_map_page_", "");
            await i.deferUpdate();
            const response = await this.generateViewResponse(version, true);
            await i.editReply({ embeds: response.embeds, files: response.files, components: response.components, attachments: [] });
        }
    }
}
