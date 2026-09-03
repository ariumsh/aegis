import { createServer } from 'node:http';
import { container } from '@sapphire/framework';
import { UptimeTracker } from './UptimeTracker';


export function startStatsServer(port: number): void {
    const token   = process.env.STATS_API_TOKEN;
    const tracker = new UptimeTracker();
    tracker.start();

    const server = createServer((req, res) => {
        const url = req.url?.split('?')[0];

        if (token && req.headers.authorization !== `Bearer ${token}`) {
            res.writeHead(401).end();
            return;
        }

        if (req.method !== 'GET') {
            res.writeHead(404).end();
            return;
        }

        if (url === '/stats') {
            const client   = container.client;
            const servers  = client.guilds.cache.size;
            const users    = client.guilds.cache.reduce((acc, g) => acc + (g.memberCount ?? 0), 0);
            const commands = container.stores.get('commands').size;

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ servers, users, commands }));
            return;
        }

        if (url === '/stats/history') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(tracker.getHistory()));
            return;
        }

        res.writeHead(404).end();
    });

    server.listen(port, () => {
        container.logger.info(`[StatsServer] Listening on port ${port}`);
    });
}
