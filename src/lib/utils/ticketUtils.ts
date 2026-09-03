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


export async function getNextTicketNumber(guildId: string): Promise<number> {
    const last = await prisma.ticket.findFirst({ where: { guildId }, orderBy: { ticketNumber: 'desc' } });
    return (last?.ticketNumber ?? 0) + 1;
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
        const content = m.content?.replace(/</g, '&lt;').replace(/>/g, '&gt;') || '';
        const attachments = m.attachments.map((a: any) => `<a href="${a.url}">[attachment: ${a.name}]</a>`).join(' ');
        return `<div class="msg"><span class="ts">${time}</span> <span class="author">${m.author.tag}</span>: <span class="content">${content} ${attachments}</span></div>`;
    }).join('\n');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Transcript — #${channel.name}</title>
<style>body{font-family:monospace;background:#1e1e2e;color:#cdd6f4;padding:1rem}
.msg{padding:2px 0}.ts{color:#6c7086}.author{color:#89b4fa;font-weight:bold}.content{color:#cdd6f4}
a{color:#89dceb}</style></head><body>
<h2>Transcript: #${channel.name}</h2>
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
