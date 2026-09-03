import { Listener, Events, type InteractionHandlerError } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { resolveKey } from '@sapphire/plugin-i18next';
import { AegisUserError } from '../../lib/structures/Errors';
import { getMessageLayout } from '../../lib/layouts/defaultLayout';
import { Emojis } from '../../lib/constants/emojis';

@ApplyOptions<Listener.Options>({
    event: Events.InteractionHandlerError
})
export class InteractionHandlerErrorListener extends Listener {
    public async run(error: unknown, { interaction }: InteractionHandlerError) {
        // Silently ignore "Unknown Interaction" errors as they usually mean the token expired or network issue
        if ((error as any).code === 10062) return;

        const defaultContext = { 
            cross: Emojis.cross_emoji, 
            check: Emojis.check_emoji,
            error: Emojis.error_emoji,
            info:  Emojis.info_emoji,
            list:  Emojis.list_emoji
        };

        // 1. Expected User Errors (Validations)
        if (error instanceof AegisUserError) {
            const content = await resolveKey(interaction, error.identifier, { ...defaultContext, ...error.context as any });
            return this.respond(interaction, content);
        }

        // 2. Unexpected Errors (System/Logic)
        this.container.logger.error(`[INTERACTION ERROR]`, error);
        
        const unexpectedMsg = await resolveKey(interaction, 'errors:unexpected', { ...defaultContext });
        
        try {
            return await this.respond(interaction, unexpectedMsg);
        } catch (err) {
            if ((err as any).code !== 40060 && (err as any).code !== 10062) {
                this.container.logger.error(`[INTERACTION ERROR] Failed to send error message:`, err);
            }
        }
    }

    private async respond(interaction: any, content: string) {
        const layout = getMessageLayout(content);
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply({ ...layout });
        }
        return await interaction.reply({ ...layout, flags: ['Ephemeral', 'IsComponentsV2'] });
    }
}
