import { Emojis } from '../constants/emojis';
import { ContainerComponent, SectionComponent, TextDisplayComponent, ThumbnailComponent } from './ui';

/**
 * Layout for the vanity role welcome message
 */
export function getVanityWelcomeLayout(memberId: string, roleId: string, avatarURL: string, vanityString: string) {
    return {
        flags: 32768,
        components: [
            ContainerComponent([
                SectionComponent(
                    [TextDisplayComponent(`# Thanks for the support! ${Emojis.vanity_welcome_emoji}\nHey, <@${memberId}>! We appreciate you promoting\nour server on your profile, **${vanityString}** looks great on you.\n\n> You've received the role: <@&${roleId}>\n\n-# If you remove the vanity, you'll lose the role automatically`)],
                    ThumbnailComponent(avatarURL)
                )
            ])
        ],
        allowed_mentions: { parse: ['users'], roles: [] }
    };
}

