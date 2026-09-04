import { UserError } from '@sapphire/framework';

export class AegisUserError extends UserError {
    public readonly identifier: string;
    public readonly context: unknown;

    constructor(identifier: string, message?: string, context?: unknown) {
        super({ identifier, message, context });
        this.identifier = identifier;
        this.context = context;
    }
}
