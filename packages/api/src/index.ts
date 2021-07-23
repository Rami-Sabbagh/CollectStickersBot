import chalk from 'chalk';
import express from 'express';
import Redis from 'ioredis';

const app = express();
const port = 3000;

const redis = new Redis();

app.get('/', (req, res) => {
    res.send('Hello World!');
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