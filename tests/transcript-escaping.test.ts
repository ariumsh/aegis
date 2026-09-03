import { describe, expect, it } from 'vitest';
import { escapeHtml, safeHref } from '../src/lib/utils/ticketUtils';

/**
 * Regression tests for the transcript HTML injection.
 *
 * Everything in a ticket transcript is written by whoever was in the ticket, and
 * the document is opened from disk by staff — a file:// origin, where injected
 * script runs with more reach than it would in a sandboxed page. The original
 * escaped `<` and `>` in the message body and interpolated the attachment
 * filename, the attachment URL and the author tag raw.
 */

describe('escapeHtml', () => {
    it('escapes the characters that break out of an attribute', () => {
        // The quote is the one that mattered: the filename is interpolated
        // inside href="...", so escaping only < and > left the attribute open.
        expect(escapeHtml('"')).toBe('&quot;');
        expect(escapeHtml("'")).toBe('&#39;');
        expect(escapeHtml('<')).toBe('&lt;');
        expect(escapeHtml('>')).toBe('&gt;');
        expect(escapeHtml('&')).toBe('&amp;');
    });

    it('escapes the ampersand first so entities are not double-encoded', () => {
        // Escaping < before & would turn "<" into "&lt;" and then into
        // "&amp;lt;", rendering the entity as literal text.
        expect(escapeHtml('<a>')).toBe('&lt;a&gt;');
        expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    });

    it('neutralises the attachment-filename payload', () => {
        // The exact shape of the attack: a filename closing the href, escaping
        // the anchor, and injecting an element with an event handler.
        const filename = '"><img src=x onerror=alert(1)>.png';
        const escaped = escapeHtml(filename);

        expect(escaped).not.toContain('"');
        expect(escaped).not.toContain('<');
        expect(escaped).not.toContain('>');
        expect(escaped).toBe('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;.png');
    });

    it('handles null and undefined without emitting the literal words', () => {
        expect(escapeHtml(null)).toBe('');
        expect(escapeHtml(undefined)).toBe('');
    });
});

describe('safeHref', () => {
    it('accepts ordinary http and https URLs', () => {
        expect(safeHref('https://cdn.discordapp.com/attachments/1/2/file.png')).toContain('https://cdn.discordapp.com');
        expect(safeHref('http://example.com/x')).toContain('http://example.com');
    });

    it('refuses schemes that execute', () => {
        // The transcript is opened locally, so a javascript: href would run.
        expect(safeHref('javascript:alert(1)')).toBe('#');
        expect(safeHref('JavaScript:alert(1)')).toBe('#');
        expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#');
        expect(safeHref('vbscript:msgbox(1)')).toBe('#');
        expect(safeHref('file:///etc/passwd')).toBe('#');
    });

    it('refuses anything that is not a URL at all', () => {
        expect(safeHref('not a url')).toBe('#');
        expect(safeHref('')).toBe('#');
        expect(safeHref(null)).toBe('#');
        expect(safeHref(undefined)).toBe('#');
    });

    it('escapes the URL it returns', () => {
        // A valid URL can still carry a quote in its query string.
        const result = safeHref('https://example.com/?a="onload="alert(1)');
        expect(result).not.toContain('"');
    });
});
