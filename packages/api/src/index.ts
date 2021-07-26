import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import chalk from 'chalk';
import express from 'express';
import Redis from 'ioredis';

import cors from 'cors';

const app = express();
const port = Number.parseInt(process.env.API_PORT ?? '3000', 10);

const redis = new Redis(process.env.REDIS_URL, { keyPrefix: process.env.REDIS_PREFIX });

app.use(cors());

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

app.get('/users/ids', async (_, res) => {
    const rawIds = await redis.smembers('users');
    const ids = rawIds.map((id) => Number.parseInt(id, 10));

    res.json(ids);
});

app.get('/users/list', async (_, res) => {
    const rawIds = await redis.smembers('users');
    const ids = rawIds.map((id) => Number.parseInt(id, 10));

    const users: Record<string, string | number>[] = [];
    const pipeline = redis.pipeline();

    ids.forEach((id) => pipeline.hgetall(`user:${id}`, (err, data: Record<string, string | number>) => {
        if (err !== null) return console.error(`failed to fetch user (${id}):`, err);

        Object.entries(data).forEach(([key, value]) => {
            if (typeof value === 'string' && /^-?\d+$/.test(value))
                data[key] = Number.parseInt(value, 10);
        });

        data['id'] = id;
        users.push(data);
    }));

    await pipeline.exec();

    res.json(users);
});

app.get('/user/:userId(-?\\d+)', async (req, res) => {
    const { userId: rawId } = req.params;
    const id = Number.parseInt(rawId, 10);

    const key = `user:${id}`;

    if (!await redis.exists(key)) res.sendStatus(404);
    else res.json(await redis.hgetall(key));
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