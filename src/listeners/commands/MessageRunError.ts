import { Listener, MessageCommandErrorPayload, ArgumentError, Events } from '@sapphire/framework';
import { ApplyOptions } from '@sapphire/decorators';
import { resolveKey } from '@sapphire/plugin-i18next';
import { AegisUserError } from '../../lib/structures/Errors';
import { getMessageLayout } from '../../lib/layouts/defaultLayout';

import { Emojis } from '../../lib/constants/emojis';
import { DEFAULT_PREFIX } from '../../lib/constants/bot';

const TRANSIENT_MOD_ERROR_KEYS = new Set([
    'modcommands:mod.mute.alreadyMuted',
    'modcommands:mod.mute.hasTimeoutProceedWithForce',
    'modcommands:mod.timeout.alreadyTimedOut',
    'modcommands:mod.timeout.hasMuteProceedWithForce'
]);

@ApplyOptions<Listener.Options>({
    event: Events.MessageCommandError
})
export class MessageRunErrorListener extends Listener {
    public async run(error: unknown, { message, command, context }: MessageCommandErrorPayload) {
        const err = error as any;
        const defaultContext = { 
            cross: Emojis.cross_emoji, 
            check: Emojis.check_emoji,
            error: Emojis.error_emoji,
            info:  Emojis.info_emoji,
            list:  Emojis.list_emoji,
            warning: Emojis.warning_emoji
        };

        // 1. Argument Errors (Missing or invalid arguments in prefix commands)
        if (err?.identifier === 'argsMissing' || err?.name === 'ArgumentError') {
            const prefix = context.prefix ?? DEFAULT_PREFIX;
            const usagePrefix = await resolveKey(message, 'errors:usagePrefix');
            
            let usage = (command as any).usage;
            if (usage && usage.includes(':')) {
                usage = await resolveKey(message, usage as any);
            }
            const usageText = usage ? `\n${usagePrefix} **${prefix}${command.name} ${usage}**` : '';
            
            const errorKey = err.identifier === 'argsMissing' ? 'errors:argsMissing' : 'errors:argsInvalid';
            const errorMsg = await resolveKey(message, errorKey);
            
            return message.reply({ ...getMessageLayout(`${Emojis.warning_emoji} ${errorMsg}${usageText}`) });
        }

        // 2. Expected User Errors (Validations)
        if (error instanceof AegisUserError) {
            const content = await resolveKey(message, error.identifier, { ...defaultContext, ...error.context as any });
            const reply = await message.reply({ ...getMessageLayout(content) });

            if (TRANSIENT_MOD_ERROR_KEYS.has(error.identifier)) {
                setTimeout(() => {
                    reply.delete().catch(() => null);
                }, 10000);
            }

            return reply;
        }

        // 3. Unexpected Errors (System/Logic)
        this.container.logger.error(`[PREFIX ERROR]`, error);
        const unexpectedMsg = await resolveKey(message, 'errors:unexpected', { ...defaultContext });
        return message.reply({ ...getMessageLayout(unexpectedMsg) });
    }
}
