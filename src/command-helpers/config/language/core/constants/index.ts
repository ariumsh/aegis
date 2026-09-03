import modulesEnUs from '../../../../../lib/i18n/en-US/modules.json';
import modulesEsEs from '../../../../../lib/i18n/es-ES/modules.json';

const languageConfigText = modulesEnUs.config.language;
const languageConfigTextEs = modulesEsEs.config.language;

export const languageChoices = [
    {
        name: languageConfigText.display.english,
        value: 'en-US',
        nameLocalizations: { 'es-ES': languageConfigTextEs.display.english }
    },
    {
        name: languageConfigText.display.spanish,
        value: 'es-ES',
        nameLocalizations: { 'es-ES': languageConfigTextEs.display.spanish }
    }
] as const;

export const languageOptionName = 'language';
export const languageOptionDescription = languageConfigText.optionDescription;
export const languageDefaultLocale = 'en-US';
export const languageDisplayNames = {
    english: languageConfigText.display.english,
    spanish: languageConfigText.display.spanish
} as const;

export const acceptedLanguageInputs = ['en-US', 'es-ES', 'en', 'es'] as const;

export function normalizeLocale(value: string) {
    return value === 'es' || value === 'es-ES' ? 'es-ES' : languageDefaultLocale;
}

export function toLanguageDisplay(locale: string) {
    return locale === 'es-ES' ? languageDisplayNames.spanish : languageDisplayNames.english;
}
