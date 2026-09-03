import { InternationalizationContext } from '@sapphire/plugin-i18next';
import {
    ApplicationCommandRegistries,
    RegisterBehavior,
    SapphireClient,
    container,
    LogLevel
} from '@sapphire/framework';
import { GatewayIntentBits, Message } from 'discord.js';
import pino from 'pino';
import { join } from 'path';
import { CacheManager } from '../database/CacheManager';
import { AegisUserError } from '../lib/structures/Errors';
import { developmentGuildIds } from '../lib/constants/devGuilds';
import { DEFAULT_PREFIX } from '../lib/constants/bot';


// Application command registration ──────────────────
//
// BulkOverwrite replaces the whole command set on every boot instead of
// patching commands one by one. Without it, a command deleted from the source
// stays registered with Discord forever — it keeps showing up in the picker
// and fails when used.
//
// setDefaultGuildIds is the supported way to scope registration to specific
// guilds. The `applicationCommands.developmentGuildIds` client option does not
// exist in Sapphire and is silently ignored.

ApplicationCommandRegistries.setDefaultBehaviorWhenNotIdentical(RegisterBehavior.BulkOverwrite);

if (developmentGuildIds.length) {
    ApplicationCommandRegistries.setDefaultGuildIds(developmentGuildIds);
}


// Aegis client ──────────────────

export class AegisClient extends SapphireClient {
    public constructor() {

        // Pino logger setup ──────────
        const pinoLogger = pino({
            level: 'trace',
            transport: {
                targets: [
                    {
                        target: 'pino-pretty',
                        options: { colorize: true, ignore: 'pid,hostname' },
                        level: 'info'
                    },
                    {
                        target: 'pino/file',
                        options: { destination: 'logs/combined.log', mkdir: true },
                        level: 'info'
                    },
                    {
                        target: 'pino/file',
                        options: { destination: 'logs/errors.log', mkdir: true },
                        level: 'error'
                    }
                ]
            }
        });

        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildVoiceStates,
                GatewayIntentBits.MessageContent,
            ],
            presence: {
                status: 'dnd',
                activities: []
            },
            defaultPrefix: process.env.PREFIX ?? DEFAULT_PREFIX,
            fetchPrefix: async (message: Message) => {
                if (!message.guild) return process.env.PREFIX ?? DEFAULT_PREFIX;
                return await CacheManager.getPrefix(message.guild.id);
            },
            loadMessageCommandListeners: true,
            disableInternalMessages: true,
            baseUserDirectory: join(__dirname, '..'),
            i18n: {
                fetchLanguage: async (context: InternationalizationContext) => {
                    if (!context.guild) return 'en-US';
                    return await CacheManager.getLocale(context.guild.id);
                },
                defaultLanguageDirectory: join(process.cwd(), 'src', 'lib', 'i18n'),
                i18next: {
                    fallbackLng: 'en-US'
                }
            },
            allowedMentions: {
                repliedUser: false
            },
            applicationCommands: {
                registries: {
                    processLogging: {
                        logInit: false,
                        logSuccess: false
                    }
                }
            },
            logger: {
                instance: {
                    has: () => true,
                    info: (message: any) => {
                        if (typeof message === 'string' &&
                            (message.includes('ApplicationCommandRegistries') || message.includes('initialize'))) return;
                        pinoLogger.info(message);
                    },
                    debug: (message: any) => pinoLogger.debug(message),
                    error: (...args: any[]) => {
                        // Filter out AegisUserError to avoid stack trace noise in the console
                        if (args.some(arg => arg instanceof AegisUserError || (arg && typeof arg === 'object' && 'name' in arg && arg.name === 'UserError'))) return;
                        
                        const formatted = args.map(arg => {
                            if (arg instanceof Error) return arg.stack ?? arg.message;
                            if (typeof arg === 'object') return JSON.stringify(arg, null, 2);
                            return arg;
                        }).join(' ');
                        pinoLogger.error(formatted);
                    },
                    warn:  (...args: any[]) => pinoLogger.warn(args.join(' ')),
                    fatal: (message: any) => pinoLogger.fatal(`[FATAL] ${message}`),
                    trace: (message: any) => pinoLogger.trace(message),
                    run:   () => {},
                    level: LogLevel.Info
                } as any
            }
        } as any);

    }


    // Logs in and confirms the bot is online ──────────

    public async start(token: string) {
        try {
            await super.login(token);
            container.logger.info(`🍬 [BOT] Online as ${this.user?.tag}`);
        } catch (error) {
            container.logger.error('🔴 [CLIENT] Login failed:');
            console.error(error);
            throw error;
        }
    }
}
