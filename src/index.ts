import dotenv from 'dotenv';
import { Telegraf } from 'telegraf';
import { StickerSet } from 'telegraf/typings/core/types/typegram';

dotenv.config();
if (process.env.BOT_TOKEN === undefined) throw new Error('"BOT_TOKEN" is not set ⚠');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply('🚧 The bot is being rewritten 🚧');
});

bot.command('ping', (ctx) => {
    ctx.reply('Pong 🏓');
});

bot.on('sticker', (ctx) => {
    const debugData = JSON.stringify(ctx.message.sticker, undefined, '\t')
    ctx.replyWithMarkdownV2(`Debug:\n\`\`\`json\n${debugData}\n\`\`\``);
});

bot.command('packs', async (ctx) => {
    const packs: StickerSet[] = [];

    const { id: userId } = ctx.from;
    const { username: botUsername } = ctx.botInfo;

    ctx.replyWithChatAction('typing');

    let volumesId = 0;
    while (true) {
        try {
            const pack = await ctx.telegram.getStickerSet(`Collection_${++volumesId}_${userId}_by_${botUsername}`);
            packs.push(pack);
        } catch (error) {
            console.error('Error while fetching packs list', error);
            break;
        }
    }

    const list = packs.map((pack) => `[${pack.title}](https://t.me/addstickers/${pack.name})`).join('\n');
    
    if (packs.length === 0) {
        ctx.reply('No packs were found ⚠');
    } else {
        ctx.replyWithMarkdownV2(list);
    }
});

bot.command('stop', (ctx) => {
    ctx.reply('It was nice to serve you sir 😊');
    bot.stop(`Requested by ${ctx.from.id}`);
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));