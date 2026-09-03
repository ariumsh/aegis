/**
 * Helper to parse emoji strings to Discord API format
 */
export function parseEmoji(emojiStr: string) {
    if (!emojiStr) return undefined;
    const match = emojiStr.match(/<(a?):(\w+):(\d+)>/);
    if (match) {
        return { 
            name: match[2], 
            id: match[3], 
            animated: match[1] === 'a' 
        };
    }
    return { name: emojiStr };
}
