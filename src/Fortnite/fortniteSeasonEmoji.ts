/** The season emoji used by the Fortnite map UI, shared with other Fortnite views. */
const FORTNITE_SEASON_EMOJIS: Record<number, Record<number, string>> = {
    1: { 1: "🪂", 2: "🛡️", 3: "☄️", 4: "🎥", 5: "🏜️", 6: "🦇", 7: "❄️", 8: "🏴‍☠️", 9: "🏙️", 10: "⏳" },
    2: { 1: "🗺️", 2: "🕵️♂️", 3: "🌊", 4: "🌌", 5: "🎯", 6: "🦴", 7: "👽", 8: "🟪" },
    3: { 1: "🙃", 2: "🪖", 3: "🍄", 4: "⚫" },
    4: { 1: "🏰", 2: "🏣", 3: "🌴", 4: "🧛", 5: "⏪" },
    5: { 1: "🚇", 2: "🏛️", 3: "🎸", 4: "🟢", 5: "🎤" },
    6: { 1: "🎎", 2: "🥒", 3: "⭐", 4: "🦸♂️", 5: "🪲", 6: "📺" },
    7: { 1: "🏝️", 2: "⚔️", 3: "🏃", 4: "🎮" }
};

const FORTNITE_MINI_SEASON_EMOJIS: Record<number, Record<string, string>> = {
    // Treasure Hunters is Fortnite's Chapter 7 mini season, also known as MS.
    7: { MS: "🏴‍☠️" }
};

export function getFortniteSeasonEmoji(chapter: number, season: number | string): string | undefined {
    if (typeof season === "string" && /^MS\d*$/i.test(season.trim())) {
        return FORTNITE_MINI_SEASON_EMOJIS[chapter]?.[season.trim().toUpperCase()]
            || FORTNITE_MINI_SEASON_EMOJIS[chapter]?.MS;
    }
    const seasonNumber = typeof season === "number" ? season : Number(season);
    return FORTNITE_SEASON_EMOJIS[chapter]?.[seasonNumber];
}

/** The Twemoji asset URL used by the Fortnite sprites UI for a season emoji. */
export function getFortniteSeasonEmojiAssetUrl(emoji: string): string {
    const codepoints = Array.from(emoji)
        .map(character => character.codePointAt(0)?.toString(16))
        .filter(Boolean)
        .join("-");
    return `https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/svg/${codepoints}.svg`;
}
