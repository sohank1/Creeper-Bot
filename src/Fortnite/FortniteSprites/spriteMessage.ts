export type SpriteMessageEditPayload = {
    [key: string]: unknown;
    content?: unknown;
    embeds?: unknown;
    files?: unknown;
};

const EMPTY_SPRITE_VIEW_MESSAGE = "This sprite view is no longer available. Run the sprites command again.";

/**
 * Builds the payload used when a tracked Discord sprite message is refreshed.
 * Discord rejects an edit whose content, embeds, and attachments are all empty.
 * That can happen when a previously valid family/variant disappears after a
 * catalog sync, so retain a useful text response instead of sending content="".
 */
export function buildTrackedSpriteMessageEditPayload(
    response: SpriteMessageEditPayload | null | undefined
): SpriteMessageEditPayload {
    const payload = response && typeof response === "object" ? response : {};
    const content = typeof payload.content === "string" ? payload.content : "";
    const hasEmbeds = Array.isArray(payload.embeds) && payload.embeds.length > 0;
    const hasFiles = Array.isArray(payload.files) && payload.files.length > 0;

    return {
        ...payload,
        content: hasEmbeds || hasFiles
            ? ""
            : content.trim() || EMPTY_SPRITE_VIEW_MESSAGE,
        attachments: []
    };
}
