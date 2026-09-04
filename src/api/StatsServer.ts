import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { container } from '@sapphire/framework';
import { UptimeTracker } from './UptimeTracker';


/**
 * Constant-time bearer comparison.
 *
 * A plain !== leaks the length and the position of the first differing byte
 * through timing, which is enough to recover a token given enough requests
 * against an endpoint with no rate limiting.
 */
function isAuthorised(header: string | undefined, token: string): boolean {
    if (typeof header !== 'string') return false;

    const expected = Buffer.from(`Bearer ${token}`);
    const received = Buffer.from(header);

    // timingSafeEqual throws on a length mismatch, so the lengths have to be
    // compared first. That leaks length only, which is not secret.
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
}


export function startStatsServer(port: number): void {
    const token   = process.env.STATS_API_TOKEN;
    const tracker = new UptimeTracker();
    tracker.start();

    // Leaving the token unset serves /stats to anyone who can reach the port.
    // That is a reasonable default locally, but docker-compose.prod.yml
    // publishes this port on the host, so in production an unset token silently
    // exposes guild and user counts to the internet. Refuse to start instead of
    // doing it quietly.
    if (process.env.NODE_ENV === 'production' && !token) {
        throw new Error(
            '[StatsServer] STATS_API_TOKEN is required when NODE_ENV=production. ' +
            'Set it, or do not publish the API port.'
        );
    }

    const server = createServer((req, res) => {
        const url = req.url?.split('?')[0];

        if (token && !isAuthorised(req.headers.authorization, token)) {
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
            // Reads from Redis now rather than process memory, so it is async.
            tracker
                .getHistory()
                .then((history) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(history));
                })
                .catch((error) => {
                    container.logger.error('[StatsServer] Could not build uptime history:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'history unavailable' }));
                });
            return;
        }

        res.writeHead(404).end();
    });

    // Without this an occupied port raises an unhandled 'error' event and takes
    // the whole process down at startup.
    server.on('error', (error) => {
        container.logger.error(`[StatsServer] Server error: ${error.message}`);
    });

    server.listen(port, () => {
        container.logger.info(
            `[StatsServer] Listening on port ${port}${token ? '' : ' (unauthenticated — no STATS_API_TOKEN set)'}`
        );
    });
}
