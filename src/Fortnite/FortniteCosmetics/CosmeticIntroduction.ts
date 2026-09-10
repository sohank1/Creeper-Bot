import { getFortniteSeasonEmoji } from "../fortniteSeasonEmoji";

// Backend season identities include mini-seasons; player-facing numbers do not.
// Same chronology as the map browser. Epic confirms Super = C6S3 and
// Shock 'N Awesome = C6S4:
// https://www.fortnite.com/news/unleash-your-true-power-in-fortnite-battle-royale-super
// https://www.fortnite.com/news/bad-bugs-bite-the-bullet-in-fortnite-battle-royale-shock-n-awesome
const chapterSix: Record<number, string> = { 35: "Galactic Battle", 36: "3", 37: "4", 38: "The Simpsons" };

export function cosmeticIntroduction<T extends { text?: string; chapter?: string; season?: string; backendValue?: number }>(_id: string, introduction: T): T {
    if (!introduction) return introduction;
    const chapter = introduction.chapter || introduction.text?.match(/Chapter\s+(\d+)/i)?.[1];
    const season = chapterSix[introduction.backendValue];
    if (chapter !== "6" || !season) return introduction;
    // Backend IDs make this idempotent, including for saved alert metadata.
    return { ...introduction, chapter: "6", season, text: `Introduced in Chapter 6, Season ${season}.` };
}

/** Shared emoji table uses chronological season slots, not display numbers. */
export function getCosmeticSeasonEmoji(chapter: number, season: string): string | undefined {
    const slot = chapter === 6 ? ({ "Galactic Battle": 3, "3": 4, "4": 5, "The Simpsons": 6 }[season] ?? Number(season))
        : season.toUpperCase() === "X" ? 10 : Number(season);
    return getFortniteSeasonEmoji(chapter, slot);
}
