import { Guild, TextChannel, PermissionFlagsBits, AttachmentBuilder } from 'discord.js';
import { container } from '@sapphire/framework';
import { prisma } from '../../database/db';


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

export async function generateTranscript(channel: TextChannel): Promise<AttachmentBuilder> {
    const allMessages: any[] = [];
    let lastId: string | undefined;

    while (true) {
        const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
        if (batch.size === 0) break;
        allMessages.push(...batch.values());
        lastId = batch.last()!.id;
        if (batch.size < 100) break;
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
${rows}
</body></html>`;

    return new AttachmentBuilder(Buffer.from(html, 'utf-8'), { name: `transcript-${channel.name}.html` });
}


export async function sendTranscript(ticket: any, guild: Guild, config: TicketConfig, channel: TextChannel): Promise<void> {
    // Send to transcript channel
    if (config.transcriptChannelId) {
        const transcriptCh = guild.channels.cache.get(config.transcriptChannelId) as TextChannel | null;
        if (transcriptCh) {
            const attachment = await generateTranscript(channel);
            await transcriptCh.send({
                content: `Transcript — **Ticket #${ticket.ticketNumber}** | <@${ticket.userId}>`,
                files: [attachment]
            }).catch(() => null);
        }
    }

    // Send DM to user
    const user = await guild.client.users.fetch(ticket.userId).catch(() => null);
    if (user) {
        const dmAttachment = await generateTranscript(channel);
        await user.send({
            content: `Here's your ticket transcript for **#${ticket.ticketNumber}** in **${guild.name}**:`,
            files: [dmAttachment]
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

    const eventLabels: Record<string, string> = {
        opened: 'opened',
        closed: 'closed',
        claimed: 'claimed',
        reopened: 'reopened',
        deleted: 'deleted',
        auto_closed: 'auto closed'
    };
    const actorStr = actorId ? `<@${actorId}>` : 'System';

    await logCh.send(`**Ticket #${ticket.ticketNumber}** ${eventLabels[event]} | User: <@${ticket.userId}> | By: ${actorStr}`).catch(() => null);
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
        const { cancelAutoClose } = await import('./ticketQueue');
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
        const { getTicketClosedLayout } = await import('../layouts/ticketLayouts');
        await channel.send(getTicketClosedLayout(ticket.ticketNumber) as any).catch(() => null);
    }

    await logTicketEvent(reason === 'auto_close' ? 'auto_closed' : 'closed', ticket, actorId, guild, config);
}
