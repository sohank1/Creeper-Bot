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

export function getFortniteSeasonEmoji(chapter: number, season: number): string | undefined {
    return FORTNITE_SEASON_EMOJIS[chapter]?.[season];
}
