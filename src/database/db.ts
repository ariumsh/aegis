import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { container } from '@sapphire/framework';


// Database setup ──────────────────

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

export const prisma = new PrismaClient({ adapter, log: [] });

container.db = prisma;


// Connects to PostgreSQL ──────────

export const connectDB = async () => {
    try {
        await prisma.$connect();
        container.logger.info('🟢 [DATABASE] Connected to PostgreSQL.');
    } catch (error: any) {
        container.logger.error('🔴 [DATABASE] Connection error:', error.message);
        process.exit(1);
    }
};


// Container type augmentation ──────────

declare module '@sapphire/pieces' {
    interface Container {
        db: PrismaClient;
    }
}
