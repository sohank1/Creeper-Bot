import Fuse from "fuse.js";
import { FortniteStatsPlayer } from "./FortniteStats.model";

export type FortniteStatsPlatform = "epic" | "xbl" | "psn";

export interface FortniteStatsPlayerIdentifier {
    platform: FortniteStatsPlatform;
    lookupName: string;
    normalizedName: string;
    lastVerifiedAt: Date | string;
}

export interface FortniteStatsPlayerRecord {
    _id: unknown;
    bot: string;
    accountId: string;
    canonicalName: string;
    normalizedCanonicalName: string;
    identifiers: FortniteStatsPlayerIdentifier[];
    lookupCount?: number;
    lastUsedAt?: Date | string;
    lastVerifiedAt?: Date | string;
}

export interface ResolvedStatsPlayer {
    username: string;
    platform: FortniteStatsPlatform;
    accountId: string;
    canonicalName: string;
}

export interface ParsedStatsPlayerInput {
    username: string;
    platform?: FortniteStatsPlatform;
}

export interface StatsAutocompleteChoice {
    name: string;
    value: string;
}

const supportedPlatforms: FortniteStatsPlatform[] = ["epic", "psn", "xbl"];

const platformPrefixes: Array<{ expression: RegExp; platform: FortniteStatsPlatform }> = [
    { expression: /^epic(?:\s*games?)?\s*(?::|\||\/|-|\s)\s*(.+)$/i, platform: "epic" },
    { expression: /^(?:psn|playstation)\s*(?::|\||\/|-|\s)\s*(.+)$/i, platform: "psn" },
    { expression: /^(?:xbl|xbox)\s*(?::|\||\/|-|\s)\s*(.+)$/i, platform: "xbl" },
];

export function normalizeFortniteStatsName(value: unknown): string {
    return String(value || "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/['’`]/g, "")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .replace(/\s+/g, " ");
}

export function parseFortniteStatsPlayerInput(value: unknown): ParsedStatsPlayerInput {
    const raw = String(value || "").trim().slice(0, 100);
    for (const prefix of platformPrefixes) {
        const match = prefix.expression.exec(raw);
        if (match?.[1]?.trim()) return { username: match[1].trim(), platform: prefix.platform };
    }
    return { username: raw };
}

function isPlatform(value: unknown): value is FortniteStatsPlatform {
    return supportedPlatforms.includes(value as FortniteStatsPlatform);
}

function timestamp(value: Date | string | undefined): number {
    const parsed = value instanceof Date ? value.getTime() : Date.parse(String(value || ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value: unknown, fallback = new Date(0)): Date {
    const parsed = new Date(String(value || ""));
    return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function boundedEditDistance(left: string, right: string, limit: number): number {
    if (Math.abs(left.length - right.length) > limit) return limit + 1;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
        const row = [leftIndex];
        let minimum = leftIndex;
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
            row[rightIndex] = Math.min(
                previous[rightIndex] + 1,
                row[rightIndex - 1] + 1,
                previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
            );
            minimum = Math.min(minimum, row[rightIndex]);
        }
        if (minimum > limit) return limit + 1;
        previous = row;
    }
    return previous[right.length];
}

function fuzzyDistanceLimit(queryLength: number): number {
    if (queryLength < 4) return 0;
    if (queryLength < 7) return 1;
    return 2;
}

interface IndexedPlayerIdentifier {
    record: FortniteStatsPlayerRecord;
    identifier: FortniteStatsPlayerIdentifier;
    searchTerms: string[];
    searchText: string;
}

function identifierKey(item: IndexedPlayerIdentifier): string {
    return `${String(item.record._id)}:${item.identifier.platform}`;
}

function rawHasNewShape(record: any): boolean {
    return Array.isArray(record?.identifiers) && record.identifiers.length > 0;
}

function rawHasLegacyShape(record: any): boolean {
    return isPlatform(record?.platform) && !!String(record?.lookupName || record?.canonicalName || "").trim();
}

function rawRecordTime(record: any): number {
    return timestamp(record?.lastVerifiedAt)
        || timestamp(record?.lastUsedAt)
        || timestamp(record?.updatedAt)
        || timestamp(record?.createdAt);
}

export class FortniteStatsDirectory {
    private records: FortniteStatsPlayerRecord[] = [];
    private indexedPlayers: IndexedPlayerIdentifier[] = [];
    private fuse: Fuse<IndexedPlayerIdentifier> | null = null;
    private loadedAt = 0;
    private loadPromise?: Promise<void>;
    private preparePromise?: Promise<void>;
    private prepared = false;
    private readonly cacheTtlMs = 15_000;

    constructor(private readonly botId: string) {}

    public invalidate(): void {
        this.loadedAt = 0;
    }

    private async prepare(): Promise<void> {
        if (this.prepared || !this.botId) return;
        if (this.preparePromise) return this.preparePromise;

        this.preparePromise = (async () => {
            const collection: any = FortniteStatsPlayer.collection;
            const rawRecords: any[] = await collection.find({ bot: this.botId }).toArray();
            const groups = new Map<string, any[]>();

            for (const record of rawRecords) {
                const accountId = String(record?.accountId || "").trim();
                if (!accountId) continue;
                if (!groups.has(accountId)) groups.set(accountId, []);
                groups.get(accountId).push(record);
            }

            // The first version of this feature stored one document per
            // platform. Consolidate those records into the new one-document
            // shape while preserving the account and platform data.
            for (const [accountId, group] of groups) {
                if (group.length === 1 && rawHasNewShape(group[0]) && !rawHasLegacyShape(group[0])) continue;

                const target = [...group]
                    .sort((left, right) => Number(rawHasNewShape(right)) - Number(rawHasNewShape(left)) || rawRecordTime(right) - rawRecordTime(left))[0];
                const identifiers = new Map<FortniteStatsPlatform, FortniteStatsPlayerIdentifier>();
                const addIdentifier = (candidate: any, fallbackRecord: any) => {
                    const platform = candidate?.platform;
                    const lookupName = String(candidate?.lookupName || fallbackRecord?.lookupName || fallbackRecord?.canonicalName || "").trim();
                    if (!isPlatform(platform) || !lookupName) return;
                    const normalizedName = normalizeFortniteStatsName(candidate?.normalizedName || lookupName);
                    if (!normalizedName) return;
                    const next: FortniteStatsPlayerIdentifier = {
                        platform,
                        lookupName,
                        normalizedName,
                        lastVerifiedAt: asDate(candidate?.lastVerifiedAt || fallbackRecord?.lastVerifiedAt || fallbackRecord?.updatedAt),
                    };
                    const existing = identifiers.get(platform);
                    if (!existing || timestamp(next.lastVerifiedAt) >= timestamp(existing.lastVerifiedAt)) identifiers.set(platform, next);
                };

                for (const record of group) {
                    for (const candidate of Array.isArray(record?.identifiers) ? record.identifiers : []) addIdentifier(candidate, record);
                    if (rawHasLegacyShape(record)) addIdentifier(record, record);
                }
                if (!identifiers.size) continue;

                const namedRecords = group
                    .filter(record => String(record?.canonicalName || "").trim())
                    .sort((left, right) => rawRecordTime(right) - rawRecordTime(left));
                const canonicalName = String(namedRecords[0]?.canonicalName || "").trim();
                if (!canonicalName) continue;

                const lookupCount = group.reduce((total, record) => {
                    const count = Number(record?.lookupCount);
                    return total + (Number.isFinite(count) && count > 0 ? count : 1);
                }, 0);
                const lastUsedTime = Math.max(...group.map(record => rawRecordTime(record)), 0);
                const lastVerifiedTime = Math.max(...group.map(record => timestamp(record?.lastVerifiedAt)), 0);
                const now = Date.now();
                const lastUsedAt = new Date(lastUsedTime || now);
                const lastVerifiedAt = new Date(lastVerifiedTime || now);

                await collection.updateOne(
                    { _id: target._id },
                    {
                        $set: {
                            bot: this.botId,
                            accountId,
                            canonicalName,
                            normalizedCanonicalName: normalizeFortniteStatsName(canonicalName),
                            identifiers: Array.from(identifiers.values()),
                            lookupCount,
                            lastUsedAt,
                            lastVerifiedAt,
                        },
                        $unset: { platform: "", lookupName: "", aliases: "" },
                    },
                );

                for (const record of group) {
                    if (String(record?._id) === String(target?._id)) continue;
                    await collection.deleteOne({ _id: record._id });
                }
            }

            // Index creation is delayed until after the legacy consolidation,
            // because the old shape legitimately had multiple platform rows.
            try {
                await collection.createIndex({ bot: 1, accountId: 1 }, {
                    unique: true,
                    name: "fortnite_stats_bot_account_unique",
                });
                await collection.createIndex({ bot: 1, canonicalName: 1 }, {
                    name: "fortnite_stats_bot_canonical_name",
                });
                await collection.createIndex({ bot: 1, "identifiers.platform": 1 }, {
                    name: "fortnite_stats_bot_identifier_platform",
                });
                await collection.createIndex({ bot: 1, "identifiers.normalizedName": 1 }, {
                    name: "fortnite_stats_bot_identifier_name",
                });
            } catch (error) {
                // A previously-created index or a deployment with an unusual
                // legacy record should not make the stats command unusable.
                console.warn("Fortnite stats player indexes were not fully created.", error?.message || error);
            }

            this.prepared = true;
        })().finally(() => { this.preparePromise = undefined; });

        return this.preparePromise;
    }

    private async load(): Promise<void> {
        const now = Date.now();
        if (this.loadedAt && now - this.loadedAt < this.cacheTtlMs) return;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = (async () => {
            if (!this.botId) {
                this.records = [];
                this.indexedPlayers = [];
                this.fuse = null;
                this.loadedAt = Date.now();
                return;
            }

            await this.prepare();
            const records = await FortniteStatsPlayer.find({ bot: this.botId })
                .select("accountId canonicalName normalizedCanonicalName identifiers lookupCount lastUsedAt lastVerifiedAt")
                .sort({ lastUsedAt: -1, lastVerifiedAt: -1 })
                .lean();
            this.records = records as FortniteStatsPlayerRecord[];
            this.indexedPlayers = this.records.flatMap(record => {
                const identifiers = Array.isArray(record.identifiers) ? record.identifiers : [];
                return identifiers.filter(identifier => isPlatform(identifier?.platform) && identifier?.lookupName)
                    .map(identifier => {
                        const searchTerms = [
                            record.canonicalName,
                            record.normalizedCanonicalName,
                            identifier.lookupName,
                            identifier.normalizedName,
                        ]
                            .map(normalizeFortniteStatsName)
                            .filter(Boolean)
                            .filter((term, index, values) => values.indexOf(term) === index);
                        return {
                            record,
                            identifier,
                            searchTerms,
                            searchText: searchTerms.join(" "),
                        };
                    });
            });
            this.fuse = new Fuse(this.indexedPlayers, {
                keys: ["searchText"],
                includeScore: true,
                ignoreLocation: true,
                threshold: 0.42,
                minMatchCharLength: 2,
            });
            this.loadedAt = Date.now();
        })().finally(() => { this.loadPromise = undefined; });

        return this.loadPromise;
    }

    public async search(query: unknown, selectedPlatform?: string, limit = 25): Promise<StatsAutocompleteChoice[]> {
        const parsed = parseFortniteStatsPlayerInput(query);
        const platform = (selectedPlatform || parsed.platform) as FortniteStatsPlatform | undefined;
        await this.load();
        const indexed = this.indexedPlayers.filter(item => !platform || item.identifier.platform === platform);
        const normalizedQuery = normalizeFortniteStatsName(parsed.username);
        const scores = new Map<string, { rank: number; fuzzy: number }>();

        for (const item of indexed) {
            const key = identifierKey(item);
            if (!normalizedQuery) {
                scores.set(key, { rank: 0, fuzzy: 0 });
            } else if (item.searchTerms.some(term => term === normalizedQuery)) {
                scores.set(key, { rank: 0, fuzzy: 0 });
            } else if (item.searchTerms.some(term => term.startsWith(normalizedQuery))) {
                scores.set(key, { rank: 1, fuzzy: 0 });
            } else if (item.searchTerms.some(term => term.includes(normalizedQuery))) {
                scores.set(key, { rank: 2, fuzzy: 0 });
            }
        }

        // Fuzzy matching is limited to a small edit distance so a name such
        // as CreeperPlanet does not appear for a typo such as Creeeeeper.
        const editLimit = fuzzyDistanceLimit(normalizedQuery.length);
        if (editLimit > 0 && this.fuse) {
            for (const hit of this.fuse.search(normalizedQuery, { limit: 100 })) {
                if (platform && hit.item.identifier.platform !== platform) continue;
                let bestDistance = editLimit + 1;
                let bestLength = normalizedQuery.length;
                for (const term of hit.item.searchTerms) {
                    const distance = boundedEditDistance(normalizedQuery, term, editLimit);
                    if (distance < bestDistance) {
                        bestDistance = distance;
                        bestLength = term.length;
                    }
                }
                if (bestDistance > editLimit) continue;
                const key = identifierKey(hit.item);
                const fuzzy = bestDistance / Math.max(normalizedQuery.length, bestLength);
                const existing = scores.get(key);
                if (!existing || fuzzy < existing.fuzzy) scores.set(key, { rank: existing?.rank ?? 3, fuzzy });
            }
        }

        // Several platform identifiers can belong to the same Fortnite
        // account. Keep the best matching identifier for ranking/selection,
        // but collapse all identifiers for that account into one choice.
        const accountMatches = new Map<string, { item: IndexedPlayerIdentifier; score: { rank: number; fuzzy: number } }>();
        const compareMatches = (
            left: { item: IndexedPlayerIdentifier; score: { rank: number; fuzzy: number } },
            right: { item: IndexedPlayerIdentifier; score: { rank: number; fuzzy: number } },
        ): number => {
            return left.score.rank - right.score.rank
                || left.score.fuzzy - right.score.fuzzy
                || (right.item.record.lookupCount || 0) - (left.item.record.lookupCount || 0)
                || timestamp(right.item.record.lastUsedAt) - timestamp(left.item.record.lastUsedAt)
                || supportedPlatforms.indexOf(left.item.identifier.platform) - supportedPlatforms.indexOf(right.item.identifier.platform)
                || identifierKey(left.item).localeCompare(identifierKey(right.item));
        };

        for (const item of indexed) {
            const score = scores.get(identifierKey(item));
            if (!score) continue;
            const accountKey = String(item.record.accountId || item.record._id);
            const current = accountMatches.get(accountKey);
            const next = { item, score };
            if (!current || compareMatches(next, current) < 0) accountMatches.set(accountKey, next);
        }

        const hasFullMatch = !!normalizedQuery
            && indexed.some(item => scores.get(identifierKey(item))?.rank === 0);
        const rawQuery = String(query || "").trim().slice(0, 100);
        const shouldOfferRawSearch = !!rawQuery && !hasFullMatch && limit > 0;
        const results = Array.from(accountMatches.values())
            .sort((left, right) => compareMatches(left, right)
                || left.item.record.canonicalName.localeCompare(right.item.record.canonicalName)
                || String(left.item.record.accountId).localeCompare(String(right.item.record.accountId)))
            .slice(0, Math.max(0, limit - (shouldOfferRawSearch ? 1 : 0)));

        const usedNames = new Set<string>();
        const choices = results.map(({ item }) => {
            const record = item.record;
            // Keep the visible choice compact while the hidden value still
            // carries the platform-specific identifier that matched.
            let name = String(record.canonicalName || item.identifier.lookupName).slice(0, 100);
            if (usedNames.has(name)) name = `${name.slice(0, 91)} #${String(record.accountId).slice(-8)}`.slice(0, 100);
            usedNames.add(name);
            return {
                name,
                // Preserve the platform that matched the query so selecting
                // an Xbox name still uses the Xbox API account type, even
                // though the visible result represents one account.
                value: `stats-player:${String(record._id)}:${item.identifier.platform}`,
            };
        });

        if (shouldOfferRawSearch) {
            // Discord limits autocomplete choice names to 100 characters.
            // Keep the complete input in the value while shortening only the
            // visible label when a user pastes a long name.
            const displayQuery = rawQuery.slice(0, 87);
            choices.push({
                name: `Search for "${displayQuery}"`,
                value: rawQuery,
            });
        }

        return choices;
    }

    public async resolveSelection(value: unknown, selectedPlatform?: string): Promise<ResolvedStatsPlayer | null> {
        const raw = String(value || "");
        const prefix = "stats-player:";
        if (!raw.startsWith(prefix)) return null;

        const [, id, savedPlatform] = raw.split(":");
        if (!/^[a-f\d]{24}$/i.test(id || "") || !isPlatform(savedPlatform)) return null;
        await this.prepare();
        const record: any = await FortniteStatsPlayer.findOne({ _id: id, bot: this.botId })
            .select("accountId platform canonicalName lookupName identifiers")
            .lean();
        const platform = isPlatform(selectedPlatform) ? selectedPlatform : savedPlatform;
        const identifier = record?.identifiers?.find((candidate: any) => candidate?.platform === platform);
        if (!record?.accountId || !record?.canonicalName || !identifier?.lookupName) return null;
        return {
            username: String(identifier.lookupName),
            platform,
            accountId: String(record.accountId),
            canonicalName: String(record.canonicalName),
        };
    }

    public isSavedSelection(value: unknown): boolean {
        return String(value || "").startsWith("stats-player:");
    }

    public async recordSuccessfulLookup(input: {
        username: string;
        platform: FortniteStatsPlatform;
        accountId: string;
        canonicalName: string;
    }): Promise<void> {
        if (!this.botId || !isPlatform(input.platform)) return;
        await this.prepare();

        const username = String(input.username || "").trim().slice(0, 100);
        const canonicalName = String(input.canonicalName || "").trim().slice(0, 100);
        const accountId = String(input.accountId || "").trim();
        const normalizedCanonicalName = normalizeFortniteStatsName(canonicalName);
        const normalizedName = normalizeFortniteStatsName(username);
        if (!username || !canonicalName || !accountId || !normalizedCanonicalName || !normalizedName) return;

        // The unique account index normally makes this a single atomic write.
        // If two platform lookups discover the same account at the same time,
        // one can win the upsert race; retrying after the duplicate-key error
        // lets the losing request merge its identifier into that document.
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const existing: any = await FortniteStatsPlayer.findOne({ bot: this.botId, accountId }).lean();
                const identifiers: FortniteStatsPlayerIdentifier[] = Array.isArray(existing?.identifiers)
                    ? existing.identifiers.filter((identifier: any) => isPlatform(identifier?.platform) && identifier?.lookupName)
                        .map((identifier: any) => ({
                            platform: identifier.platform,
                            lookupName: String(identifier.lookupName),
                            normalizedName: normalizeFortniteStatsName(identifier.normalizedName || identifier.lookupName),
                            lastVerifiedAt: asDate(identifier.lastVerifiedAt),
                        }))
                    : [];
                const nextIdentifier: FortniteStatsPlayerIdentifier = {
                    platform: input.platform,
                    lookupName: username,
                    normalizedName,
                    lastVerifiedAt: new Date(),
                };
                const existingIndex = identifiers.findIndex(identifier => identifier.platform === input.platform);
                if (existingIndex === -1) identifiers.push(nextIdentifier);
                else identifiers.splice(existingIndex, 1, nextIdentifier);

                const now = new Date();
                const writeFilter: any = existing
                    ? { _id: existing._id, bot: this.botId, accountId }
                    : { bot: this.botId, accountId };
                if (existing?.updatedAt) writeFilter.updatedAt = existing.updatedAt;

                const written: any = await FortniteStatsPlayer.findOneAndUpdate(
                    writeFilter,
                    {
                        $set: {
                            bot: this.botId,
                            accountId,
                            canonicalName,
                            normalizedCanonicalName,
                            identifiers,
                            lastUsedAt: now,
                            lastVerifiedAt: now,
                            updatedAt: now,
                        },
                        $inc: { lookupCount: 1 },
                    },
                    { upsert: !existing, setDefaultsOnInsert: true },
                );
                // The updatedAt predicate prevents two writers from replacing
                // each other's platform identifier array. Read the latest
                // document and try the merge again when that predicate loses.
                if (existing && !written) continue;
                this.invalidate();
                return;
            } catch (error) {
                if (Number(error?.code) !== 11000 || attempt === 1) throw error;
            }
        }
    }
}
