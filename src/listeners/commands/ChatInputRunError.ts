import { Listener, ChatInputCommandErrorPayload, Events } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { resolveKey } from '@sapphire/plugin-i18next';
import { AegisUserError } from '../../lib/structures/Errors';
import { getMessageLayout } from '../../lib/layouts/defaultLayout';
import { Emojis } from '../../lib/constants/emojis';

const TRANSIENT_MOD_ERROR_KEYS = new Set([
    'modcommands:mod.mute.alreadyMuted',
    'modcommands:mod.mute.hasTimeoutProceedWithForce',
    'modcommands:mod.timeout.alreadyTimedOut',
    'modcommands:mod.timeout.hasMuteProceedWithForce'
]);

@ApplyOptions<Listener.Options>({
    event: Events.ChatInputCommandError
})
export class ChatInputRunErrorListener extends Listener {
    public async run(error: unknown, { interaction }: ChatInputCommandErrorPayload) {
        const defaultContext = { 
            cross: Emojis.cross_emoji, 
            check: Emojis.check_emoji,
            error: Emojis.error_emoji,
            info:  Emojis.info_emoji,
            list:  Emojis.list_emoji
        };

        // 1. Expected User Errors (Validations)
        if (error instanceof AegisUserError) {
            let content = await resolveKey(interaction, error.identifier, { ...defaultContext, ...error.context as any }).catch(() => null);
            
            // Fallback if i18n key is missing or failed
            if (!content || typeof content !== 'string' || content.trim() === '') {
                content = `${Emojis.cross_emoji} An unexpected validation error occurred: \`${error.identifier}\``;
            }

            return this.respond(interaction, content, TRANSIENT_MOD_ERROR_KEYS.has(error.identifier));
        }

        // 2. Unexpected Errors (System/Logic)
        this.container.logger.error(`[COMMAND ERROR] ${interaction.commandName}:`, error);
        
        const unexpectedMsg = (await resolveKey(interaction, 'errors:unexpected', { ...defaultContext }).catch(() => null)) || `${Emojis.error_emoji} An internal system error occurred.`;
        return this.respond(interaction, unexpectedMsg);
    }

    private async respond(interaction: any, content: string, forceEphemeralFollowUp: boolean = false) {
        const layout = getMessageLayout(content);

        if (forceEphemeralFollowUp && (interaction.deferred || interaction.replied)) {
            await interaction.deleteReply().catch(() => null);
            return interaction.followUp({ ...layout, flags: ['Ephemeral', 'IsComponentsV2'] });
        }

        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ ...layout });
        }
        return interaction.reply({ ...layout, flags: ['Ephemeral', 'IsComponentsV2'] });
    }
}
