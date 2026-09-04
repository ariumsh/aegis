import { Guild, TextChannel, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { container } from '@sapphire/framework';
import { prisma } from '../../database/db';
import { resolveKey } from '@sapphire/plugin-i18next';


// Ticket utilities ──────────────────

export interface TicketConfig {
    module: boolean;
    panelChannelId: string | null;
    categoryId: string | null;
    transcriptChannelId: string | null;
    logChannelId: string | null;
    supporterRoleIds: string[];
    panelMessageId: string | null;
}


export async function getTicketConfig(guildId: string): Promise<TicketConfig> {
    const [mod, panelCh, cat, transcriptCh, logCh, supporterRoles, panelMsg] = await container.redis.mget(
        `tickets:module:${guildId}`,
        `tickets:panel_channel:${guildId}`,
        `tickets:category:${guildId}`,
        `tickets:transcript_channel:${guildId}`,
        `tickets:log_channel:${guildId}`,
        `tickets:supporter_roles:${guildId}`,
        `tickets:panel_message:${guildId}`
    );
    return {
        module: mod === 'true' || mod === '1',
        panelChannelId: panelCh,
        categoryId: cat,
        transcriptChannelId: transcriptCh,
        logChannelId: logCh,
        supporterRoleIds: supporterRoles ? JSON.parse(supporterRoles) : [],
        panelMessageId: panelMsg
    };
}


/**
 * Reserves the next ticket number for a guild.
 *
 * The previous implementation read the highest number and added one, which is a
 * read followed by a write with no coordination between them. Two users opening
 * a ticket at the same moment both read N and both tried to insert N+1; the
 * second violated ticket_guild_number_unique, and because the Discord channel is
 * created before the row, their channel was already there and stayed behind as
 * an orphan.
 *
 * Postgres settles it instead: the row is created with the number computed
 * inside the same statement, under a lock on the guild's existing tickets.
 * Concurrent callers serialise rather than collide.
 */
export async function createTicketWithNumber(guildId: string, channelId: string, userId: string) {
    return prisma.$transaction(async (tx) => {
        // A transaction-scoped advisory lock keyed on the guild. FOR UPDATE is
        // not an option here -- Postgres rejects it alongside an aggregate -- and
        // there is no row to lock anyway when the guild has no tickets yet. The
        // lock releases automatically when the transaction ends, so a crash
        // mid-flight cannot wedge the guild.
        //
        // The first argument namespaces this lock so it cannot collide with any
        // other advisory lock taken against the same database.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(4919, hashtext(${guildId}))`;

        const [{ next }] = await tx.$queryRaw<{ next: number }[]>`
            SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next
            FROM tickets
            WHERE guild_id = ${guildId}
        `;

        return tx.ticket.create({
            data: { guildId, channelId, userId, ticketNumber: Number(next), status: 'open' }
        });
    });
}


export function buildChannelPermissions(guild: Guild, userId: string, supporterRoleIds: string[]) {
    return [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: userId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        },
        ...supporterRoleIds.map(roleId => ({
            id: roleId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.AttachFiles,
                PermissionFlagsBits.EmbedLinks
            ]
        })),
        {
            id: guild.members.me!.id,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageMessages,
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ReadMessageHistory,
                PermissionFlagsBits.AttachFiles
            ]
        }
    ];
}


/**
 * Escapes text for interpolation into HTML.
 *
 * Every value in a transcript is authored by whoever was in the ticket, so all
 * of it is untrusted. Escaping only < and > is not enough: an attribute value is
 * escaped out of with a bare quote, and & has to be handled first or it
 * double-encodes the entities this function itself produces.
 */
export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escapes a URL for an href, refusing anything that is not plain http(s).
 *
 * Attachment URLs come back from Discord's CDN and should always be https, but
 * the transcript is opened from disk in a browser and a javascript: href would
 * run there, so the scheme is checked rather than assumed.
 */
export function safeHref(value: unknown): string {
    try {
        const url = new URL(String(value ?? ''));
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return '#';
        return escapeHtml(url.toString());
    } catch {
        return '#';
    }
}

/**
 * Upper bound on how much of a channel a transcript will page through.
 *
 * The loop below is otherwise unbounded: it walks the entire history in pages of
 * 100, holding every message in memory. A ticket left open for months, or one
 * used as a general chat, would spend hundreds of requests and a large heap on a
 * single close. Twenty thousand messages is far more than a support ticket ever
 * legitimately holds, and it caps the worst case at 200 requests.
 */
const TRANSCRIPT_MESSAGE_LIMIT = 20_000;

/** Renders the transcript document. Returns the HTML rather than a file, so one
 *  render can be sent to several destinations. */
export async function buildTranscriptHtml(channel: TextChannel): Promise<string> {
    const allMessages: any[] = [];
    let lastId: string | undefined;
    let truncated = false;

    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
        if (batch.size === 0) break;
        allMessages.push(...batch.values());
        lastId = batch.last()!.id;
        if (batch.size < 100) break;
        if (allMessages.length >= TRANSCRIPT_MESSAGE_LIMIT) {
            truncated = true;
            break;
        }
    }
    allMessages.reverse(); // chronological order

    const rows = allMessages.map(m => {
        const time = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
        const content = escapeHtml(m.content);
        const attachments = m.attachments
            .map((a: any) => `<a href="${safeHref(a.url)}">[attachment: ${escapeHtml(a.name)}]</a>`)
            .join(' ');
        return `<div class="msg"><span class="ts">${escapeHtml(time)}</span> <span class="author">${escapeHtml(m.author.tag)}</span>: <span class="content">${content} ${attachments}</span></div>`;
    }).join('\n');

    const safeChannelName = escapeHtml(channel.name);

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transcript — #${safeChannelName}</title>
<style>body{font-family:monospace;background:#1e1e2e;color:#cdd6f4;padding:1rem}
.msg{padding:2px 0}.ts{color:#6c7086}.author{color:#89b4fa;font-weight:bold}.content{color:#cdd6f4}
a{color:#89dceb}</style></head><body>
<h2>Transcript: #${safeChannelName}</h2>
${truncated ? `<div class="msg"><span class="ts">note</span> <span class="content">Older messages were omitted: this channel exceeds the ${TRANSCRIPT_MESSAGE_LIMIT}-message transcript limit.</span></div>` : ''}
${rows}
</body></html>`;

    return html;
}

/** File form of the transcript, for callers that need a single attachment. */
export async function generateTranscript(channel: TextChannel): Promise<AttachmentBuilder> {
    const html = await buildTranscriptHtml(channel);
    return new AttachmentBuilder(Buffer.from(html, 'utf-8'), { name: `transcript-${channel.name}.html` });
}


export async function sendTranscript(ticket: any, guild: Guild, config: TicketConfig, channel: TextChannel): Promise<void> {
    const transcriptCh = config.transcriptChannelId
        ? (guild.channels.cache.get(config.transcriptChannelId) as TextChannel | null)
        : null;
    const user = await guild.client.users.fetch(ticket.userId).catch(() => null);

    // Nothing to send it to, so nothing to build.
    if (!transcriptCh && !user) return;

    // Built once. This used to be generated separately for the channel copy and
    // the DM copy, and generating it walks the channel's entire history in pages
    // of 100 — so closing a busy ticket paged through every message in it twice,
    // holding two full copies in memory to produce two identical files.
    const html = await buildTranscriptHtml(channel);
    const filename = `transcript-${channel.name}.html`;

    if (transcriptCh) {
        await transcriptCh.send({
            content: await resolveKey(guild, 'modules:tickets.transcript.channel', { number: ticket.ticketNumber, user: `<@${ticket.userId}>` }),
            files: [new AttachmentBuilder(Buffer.from(html, 'utf-8'), { name: filename })]
        }).catch(() => null);
    }

    if (user) {
        // Discord consumes the buffer on send, so the DM needs its own
        // AttachmentBuilder around the same already-rendered string.
        await user.send({
            content: await resolveKey(guild, 'modules:tickets.transcript.dm', { number: ticket.ticketNumber, guild: guild.name }),
            files: [new AttachmentBuilder(Buffer.from(html, 'utf-8'), { name: filename })]
        }).catch(() => null);
    }
}


export async function logTicketEvent(
    event: 'opened' | 'closed' | 'claimed' | 'reopened' | 'deleted' | 'auto_closed',
    ticket: any,
    actorId: string | null,
    guild: Guild,
    config: TicketConfig
): Promise<void> {
    if (!config.logChannelId) return;
    const logCh = guild.channels.cache.get(config.logChannelId) as TextChannel | null;
    if (!logCh) return;

    const eventLabel = await resolveKey(guild, `modules:tickets.log.${event}`).catch(() => event);
    const actorStr = actorId
        ? `<@${actorId}>`
        : await resolveKey(guild, 'modules:tickets.log.system').catch(() => 'System');

    const line = await resolveKey(guild, 'modules:tickets.log.entry', {
        number: ticket.ticketNumber,
        event: eventLabel,
        user: `<@${ticket.userId}>`,
        actor: actorStr
    });

    await logCh.send(line).catch(() => null);
}


export async function closeTicket(
    ticket: any,
    guild: Guild,
    config: TicketConfig,
    actorId: string | null,
    reason: 'manual' | 'auto_close'
): Promise<void> {
    const channel = guild.channels.cache.get(ticket.channelId) as TextChannel | null;

    // Cancel any pending auto-close job
    if (ticket.autoCloseJobId) {
        const { cancelAutoClose } = await import('./ticketQueue.js');
        await cancelAutoClose(ticket.autoCloseJobId).catch(() => null);
        await container.redis.del(`tickets:autoclose_job:${guild.id}:${ticket.id}`);
    }

    // Generate and send transcript BEFORE modifying channel
    if (channel) {
        await sendTranscript(ticket, guild, config, channel);
    }

    // Update DB
    await prisma.ticket.update({
        where: { id: ticket.id },
        data: { status: 'closed', closedAt: new Date(), autoCloseJobId: null }
    });

    // Clear Redis open/channel-map keys
    await container.redis.del(
        `tickets:open:${guild.id}:${ticket.userId}`,
        `tickets:channel_map:${guild.id}:${ticket.channelId}`
    );

    // Update channel permissions — remove user access, then post closed layout
    if (channel) {
        await channel.permissionOverwrites.delete(ticket.userId).catch(() => null);
        const { getTicketClosedLayout } = await import('../layouts/ticketLayouts.js');
        await channel.send(getTicketClosedLayout(ticket.ticketNumber) as any).catch(() => null);
    }

    await logTicketEvent(reason === 'auto_close' ? 'auto_closed' : 'closed', ticket, actorId, guild, config);
}
