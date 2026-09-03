import 'dotenv/config';
import '@sapphire/plugin-logger/register';
import '@sapphire/plugin-i18next/register';
import '@sapphire/plugin-subcommands/register';
import './database/Redis';
import { connectDB, prisma } from './database/db';
import { AegisClient } from './structures/AegisClient';
import { container } from '@sapphire/framework';
import { setupVanityWorker } from './workers/VanityWorker';
import { setupSilentBanWorker } from './workers/SilentBanWorker';
import { setupMuteWorker } from './workers/MuteWorker';
import { setupTempBanWorker } from './workers/TempBanWorker';
import { setupTicketWorker } from './workers/TicketWorker';
import { startStatsServer } from './api/StatsServer';
import { CounterService } from './services/CounterService';


// Bootstrap ──────────────────

const client = new AegisClient();

async function bootstrap() {
    try {
        await connectDB();
        startStatsServer(Number(process.env.API_PORT) || 4000);

        // Attach workers to container ──────────

        container.vanityWorker    = setupVanityWorker();
        container.silentBanWorker = setupSilentBanWorker();
        container.muteWorker      = setupMuteWorker();
        container.tempBanWorker   = setupTempBanWorker();
        container.ticketWorker    = setupTicketWorker();

        // Started in the Ready listener: it needs the guild cache populated.
        container.counterService  = new CounterService(client);

        await client.start(process.env.DISCORD_TOKEN!);
    } catch (error) {
        if (container.logger) {
            container.logger.error('[BOOTSTRAP] Fatal error during startup: ' + (error as Error).message);
        } else {
            console.error('[BOOTSTRAP] Fatal error before logger init:', error);
        }
        process.exit(1);
    }
}


// Graceful shutdown ──────────

async function shutdown() {
    await container.counterService?.stop().catch(() => undefined);
    await prisma.$disconnect();
    process.exit(0);
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);


// Container type augmentation ──────────

declare module '@sapphire/pieces' {
    interface Container {
        vanityWorker:    ReturnType<typeof setupVanityWorker>;
        silentBanWorker: ReturnType<typeof setupSilentBanWorker>;
        muteWorker:      ReturnType<typeof setupMuteWorker>;
        tempBanWorker:   ReturnType<typeof setupTempBanWorker>;
        ticketWorker:    ReturnType<typeof setupTicketWorker>;
        counterService:  CounterService;
    }
}

bootstrap();
