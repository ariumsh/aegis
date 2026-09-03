import { Emojis } from '../constants/emojis';
import { parseEmoji } from '../utils/emoji';
import {
    ContainerComponent,
    SectionComponent,
    ThumbnailComponent,
    TextDisplayComponent,
    SeparatorComponent,
    ActionRowComponent,
    ButtonComponent,
    StringSelectComponent
} from './ui';


// Ticket layouts ──────────────────

/**
 * Panel message sent in the tickets panel channel.
 * Contains a category select menu to open a ticket.
 */
export function getTicketPanelLayout(description: string, avatarUrl?: string) {
    const headerSection = SectionComponent(
        [TextDisplayComponent(`## Lorem ipsum dolor sit amet\n\n${description}`)],
        avatarUrl ? ThumbnailComponent(avatarUrl) : undefined
    );

    return {
        flags: 32768,
        components: [ContainerComponent([
            headerSection,
            TextDisplayComponent(`**🎫 General**\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Use this category for general support and questions.`),
            SeparatorComponent(2, true),
            TextDisplayComponent(`**📋 Reports**\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Use this category to report rule violations or other issues.`),
            SeparatorComponent(2, true),
            TextDisplayComponent(`**⚖️ Appeals**\nLorem ipsum dolor sit amet, consectetur adipiscing elit. Use this category to appeal a sanction or moderation decision.`),
            SeparatorComponent(1, false),
            ActionRowComponent([
                StringSelectComponent('ticket_category_select', [
                    { label: 'General', value: 'general', description: 'General support and questions', emoji: { name: '🎫' } },
                    { label: 'Reports', value: 'reports', description: 'Report a rule violation', emoji: { name: '📋' } },
                    { label: 'Appeals', value: 'appeals', description: 'Appeal a sanction or ban', emoji: { name: '⚖️' } }
                ], 'Select a category to open a ticket...')
            ])
        ])]
    };
}


/**
 * Welcome message posted inside a newly created ticket channel.
 */
export function getTicketWelcomeLayout(ticketNumber: number, userId: string, claimed: boolean, claimedById: string | null) {
    const claimLine = claimed && claimedById ? `\n-# Claimed by <@${claimedById}>` : '';
    return {
        flags: 32768,
        components: [ContainerComponent([
            TextDisplayComponent(`🎫 **Ticket #${ticketNumber}**\n\nWelcome <@${userId}>! Support will be with you shortly.${claimLine}`),
            SeparatorComponent(1, true),
            ActionRowComponent([
                ButtonComponent('ticket_close', 'Close', 4, parseEmoji(Emojis.cross_emoji)),
                ButtonComponent('ticket_claim', claimed ? 'Claimed' : 'Claim', claimed ? 3 : 2, parseEmoji(Emojis.check_emoji), claimed),
                ButtonComponent('ticket_remind', 'Reminder', 2, { name: '⏰' }, !claimed)
            ])
        ])]
    };
}


/**
 * Closed-state message posted in a ticket channel after it is closed.
 */
export function getTicketClosedLayout(ticketNumber: number) {
    return {
        flags: 32768,
        components: [ContainerComponent([
            TextDisplayComponent(`🔒 **Ticket #${ticketNumber} closed**\n\nThis ticket has been closed.`),
            SeparatorComponent(1, true),
            ActionRowComponent([
                ButtonComponent('ticket_reopen', 'Reopen', 2, { name: '🔓' }),
                ButtonComponent('ticket_delete', 'Delete', 4, parseEmoji(Emojis.cross_emoji))
            ])
        ])]
    };
}


/**
 * Countdown reminder posted before auto-close fires.
 */
export function getReminderCountdownLayout(userId: string, closeAtUnix: number) {
    return {
        flags: 32768,
        components: [ContainerComponent([
            TextDisplayComponent(`⏰ <@${userId}>, please respond to keep this ticket open.\n\nThis ticket will be automatically closed <t:${closeAtUnix}:R>.`)
        ])]
    };
}
