import { Listener, Events } from '@sapphire/framework';
import type { MessageCommandDeniedPayload, MessageCommandErrorPayload } from '@sapphire/framework';

export class CommandDebugListener extends Listener {
    public constructor(context: Listener.LoaderContext, options: Listener.Options) {
        super(context, {
            ...options,
            event: 'messageCommandRun'
        });
    }

    public async run(message: any, command: any) {
        this.container.logger.info(`[DEBUG] Command recognized: ${command.name} from ${message.author.tag}`);
    }
}

export class CommandDeniedListener extends Listener {
    public constructor(context: Listener.LoaderContext, options: Listener.Options) {
        super(context, {
            ...options,
            event: Events.MessageCommandDenied
        });
    }

    public async run(error: any, payload: MessageCommandDeniedPayload) {
        this.container.logger.warn(`[DEBUG] Command denied: ${payload.command.name}. Reason: ${error.message}`);
    }
}

import { AegisUserError } from '../../lib/structures/Errors';

export class CommandErrorListener extends Listener {
    public constructor(context: Listener.LoaderContext, options: Listener.Options) {
        super(context, {
            ...options,
            event: Events.MessageCommandError
        });
    }

    public async run(error: any, payload: MessageCommandErrorPayload) {
        // Ignore user errors in debug logs to avoid stack trace noise
        if (error instanceof AegisUserError) return;
        
        this.container.logger.error(`[DEBUG] Command error: ${payload.command.name}`, error);
    }
}

