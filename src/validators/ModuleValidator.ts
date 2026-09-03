// Types ──────────────────
//
// `missing` carries i18n keys rather than prose. The validator has no access to
// the invoking interaction, so it cannot resolve a locale itself; whoever
// renders the result does. Returning English sentences from here meant a Spanish
// guild was told what was missing in English.

export interface ValidationResult {
    isValid:       boolean;
    missing?:      string[];
    needsChannel?: boolean;
}


// Module validators ──────────────────

export const ModuleValidators: Record<string, (config: any, guild: any) => Promise<ValidationResult>> = {

    // Vanity validator ──────────

    vanity: async (config, guild) => {
        const errors: string[] = [];

        if (!config.vanityString) {
            errors.push('modules:validation.vanity.keyword');
        }

        const role = config.vanityRoleId
            ? await guild.roles.fetch(config.vanityRoleId).catch(() => null)
            : null;
        if (!role) {
            errors.push('modules:validation.vanity.role');
        }

        const channel = config.vanityChannelId
            ? await guild.channels.fetch(config.vanityChannelId).catch(() => null)
            : null;
        if (!channel) {
            errors.push('modules:validation.vanity.channel');
        }

        return { isValid: errors.length === 0, missing: errors };
    },

    // Mod validator ──────────

    mod: async (config, guild) => {
        if (!config.modLogChannelId) return { isValid: false, needsChannel: true };

        const channel = await guild.channels.fetch(config.modLogChannelId).catch(() => null);
        if (!channel) return { isValid: false, needsChannel: true };

        if (!config.mutedRoleId) return { isValid: false, missing: ['modules:validation.mod.mutedRole'] };

        const role = await guild.roles.fetch(config.mutedRoleId).catch(() => null);
        if (!role) return { isValid: false, missing: ['modules:validation.mod.mutedRoleInvalid'] };

        return { isValid: true };
    },

    // Counter validator ──────────

    counter: async (config, guild) => {
        if (!config.counterChannelId) {
            return { isValid: false, missing: ['modules:validation.counter.channel'] };
        }

        const channel = await guild.channels.fetch(config.counterChannelId).catch(() => null);
        if (!channel) {
            return { isValid: false, missing: ['modules:validation.counter.channelGone'] };
        }

        return { isValid: true };
    },

    // Tickets validator ──────────

    tickets: async (config, guild) => {
        const errors: string[] = [];

        if (!config.ticketsPanelChannelId) {
            errors.push('modules:validation.tickets.panelChannel');
        } else {
            const panelCh = await guild.channels.fetch(config.ticketsPanelChannelId).catch(() => null);
            if (!panelCh) errors.push('modules:validation.tickets.panelChannelInvalid');
        }

        if (config.ticketsCategoryId) {
            const cat = await guild.channels.fetch(config.ticketsCategoryId).catch(() => null);
            if (!cat) errors.push('modules:validation.tickets.categoryInvalid');
        }

        if (!config.ticketsSupporterRoleIds || config.ticketsSupporterRoleIds.length === 0) {
            errors.push('modules:validation.tickets.supporterRoles');
        }

        return { isValid: errors.length === 0, missing: errors };
    }
};
