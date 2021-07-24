import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import chalk from 'chalk';
import express from 'express';
import Redis from 'ioredis';

const app = express();
const port = Number.parseInt(process.env.API_PORT ?? '3000', 10);

const redis = new Redis(process.env.REDIS_URL, { keyPrefix: process.env.REDIS_PREFIX });

app.get('/', (_, res) => {
    const endpoints = ['/statistics'];
    res.send(`<ul>\n${endpoints.map((endpoint) => `<il>• <a href="${endpoints}">${endpoint}</a></il>`).join('\n')}\n</ul>`);
});

app.get('/statistics', async (_, res) => {
    const stickers = await redis.hgetall('stickers_usage');

    const rawCommands = await redis.hgetall('commands_usage');
    const commands: Record<string, number> = {};

    Object.entries(rawCommands).forEach(([key, value]) => commands[key] = Number.parseInt(value, 10));

    const statistics = {
        commands,

        usersCount: await redis.scard('users') ?? 0,
        stickers: {
            static: Number.parseInt(stickers['static'] ?? '0', 10),
            animated: Number.parseInt(stickers['animated'] ?? '0', 10),
            image: Number.parseInt(stickers['image'] ?? '0', 10),
        },
    };

    res.json(statistics);
});

async function main() {
    const info = chalk.blueBright;
    const ready = chalk.greenBright;

    console.info(info('> Connecting to database...'));
    await redis.ping();

    console.info(info('> Starting server...'));
    await new Promise<void>((resolve) => app.listen(port, resolve));

    console.info(ready(`> Ready and listening at http://127.0.0.1:${port}/ ✔`));
}

main().catch(console.error);