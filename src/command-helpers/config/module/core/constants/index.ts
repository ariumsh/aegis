import modulesEnUs from '../../../../../lib/i18n/en-US/modules.json';
import modulesEsEs from '../../../../../lib/i18n/es-ES/modules.json';

export const moduleIds = {
    vanity: 'vanity',
    mod: 'mod',
    tickets: 'tickets',
    counter: 'counter'
} as const;

type ModuleId = (typeof moduleIds)[keyof typeof moduleIds];

const moduleDisplayNameLocales = {
    en: modulesEnUs.module.displayNames,
    es: modulesEsEs.module.displayNames
};

export const moduleOptionName = 'name';

export const moduleChoices = [
    {
        name: moduleDisplayNameLocales.en.vanity,
        value: moduleIds.vanity,
        nameLocalizations: { 'es-ES': moduleDisplayNameLocales.es.vanity }
    },
    {
        name: moduleDisplayNameLocales.en.mod,
        value: moduleIds.mod,
        nameLocalizations: { 'es-ES': moduleDisplayNameLocales.es.mod }
    },
    {
        name: moduleDisplayNameLocales.en.tickets,
        value: moduleIds.tickets,
        nameLocalizations: { 'es-ES': moduleDisplayNameLocales.es.tickets }
    },
    {
        name: moduleDisplayNameLocales.en.counter,
        value: moduleIds.counter,
        nameLocalizations: { 'es-ES': moduleDisplayNameLocales.es.counter }
    }
] as const;

export const moduleDefaultGuildLocale = 'en-US';

export const moduleTimeoutsMs = {
    setupModal: 120000,
    setupConfirm: 30000,
    resetConfirm: 20000
} as const;

export const moduleCollectorReasons = {
    success: 'success',
    cancelled: 'cancelled'
} as const;

export const moduleTextInputIds = {
    confirm: 'confirm',
    keyword: 'keyword',
    role: 'role',
    channel: 'channel',
    logChannel: 'log_channel',
    mutedRole: 'muted_role',
    thresholds: 'thresholds'
} as const;

export const moduleDefaults = {
    vanityChannelName: 'vanity-logs',
    modLogChannelName: 'mod-logs',
    mutedRoleName: 'Muted',
    thresholdMode: 'warns',
    ticketsTranscriptChannelName: 'ticket-transcripts',
    ticketsLogChannelName: 'ticket-logs',
    counterChannelName: 'server-stats'
} as const;

export const moduleConfirmInputs = ['yes', 'si'] as const;

export function getDisplayNameKey(moduleValue: string) {
    return `modules:module.displayNames.${moduleValue as ModuleId}`;
}
