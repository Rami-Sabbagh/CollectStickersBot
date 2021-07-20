import axios from 'axios';
import dotenv from 'dotenv';

import { Context, Telegraf } from 'telegraf';
import { Sticker, StickerSet } from 'telegraf/typings/core/types/typegram';

dotenv.config();
if (process.env.BOT_TOKEN === undefined) throw new Error('"BOT_TOKEN" is not set ⚠');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.start((ctx) => {
    ctx.reply('🚧 The bot is being rewritten 🚧');
});

bot.command('ping', (ctx) => {
    ctx.reply('Pong 🏓');
});

function getCollectionName(ctx: Context, volumeId: number) {
    if (!ctx.from) throw new Error("The context doesn't belong to a user!");

    const { id: userId } = ctx.from;
    const { username: botUsername } = ctx.botInfo;

    return `Collection_${volumeId}_${userId}_by_${botUsername}`;
}

function formatStickerSetLink(pack: StickerSet) {
    return `<a href="https://t.me/addstickers/${pack.name}">${pack.title}</a>`;
}

async function findSuitablePack(ctx: Context, sticker: Sticker): Promise<[StickerSet | null, number]> {
    for (let volumeId = 1; true; volumeId++) {
        const collectionName = getCollectionName(ctx, volumeId);

        try {
            const pack = await ctx.telegram.getStickerSet(collectionName);

            // Skip the pack if it's filled to it's limit
            if (pack.stickers.length >= (pack.is_animated ? 50 : 120)) continue;

            // Skip the pack if it doesn't match in type.
            if (pack.is_animated !== sticker.is_animated) continue;

            // The pack is suitable at this point.
            return [pack, volumeId];
        } catch (_) {
            return [null, volumeId];
        }
    }
}

bot.on('sticker', async (ctx) => {
    const { sticker } = ctx.message;

    ctx.replyWithChatAction('typing');
    const [pack, volumeId] = await findSuitablePack(ctx, sticker);

    try {
        if (pack) {
            await ctx.addStickerToSet(pack.name, {
                emojis: sticker.emoji ?? '🖼',
                png_sticker: !sticker.is_animated ? sticker.file_id : undefined,
                tgs_sticker: sticker.is_animated ? { url: (await ctx.telegram.getFileLink(sticker.file_id)).href } : undefined,
            });

            const packLink = formatStickerSetLink(pack);
            ctx.replyWithHTML(`Added into ${packLink} successfully ✅\nThe sticker will take a while to show in the pack.`);
        } else {
            const packName = getCollectionName(ctx, volumeId);
            const packTitle = `${ctx.from.first_name}'s collection vol. ${volumeId}`;

            await ctx.createNewStickerSet(packName, packTitle, {
                emojis: sticker.emoji ?? '🖼',
                png_sticker: !sticker.is_animated ? sticker.file_id : undefined,
                tgs_sticker: sticker.is_animated ? { url: (await ctx.telegram.getFileLink(sticker.file_id)).href } : undefined,
            });

            const packLink = `<a href="https://t.me/addstickers/${packName}">${packTitle}</a>`;
            ctx.replyWithHTML(`Added into ${packLink} <b>(new)</b> successfully ✅`);
        }
    } catch (error) {
        console.error(error);
        ctx.reply('An error occured while cloning the sticker ⚠\nPlease wait a while and resend the sticker to retry.');
    }
});

bot.command('packs', async (ctx) => {
    const packs: StickerSet[] = [];

    ctx.replyWithChatAction('typing');

    let volumeId = 0;
    while (true) {
        try {
            const collectionName = getCollectionName(ctx, ++volumeId);
            const pack = await ctx.telegram.getStickerSet(collectionName);
            packs.push(pack);
        } catch (_) {
            break;
        }
    }

    const list = packs.map(formatStickerSetLink).join('\n');

    if (packs.length === 0) {
        ctx.reply('No packs were found ⚠');
    } else {
        ctx.replyWithHTML(list);
    }
});

bot.command('stop', (ctx) => {
    ctx.reply('It was nice to serve you sir 😊');
    bot.stop(`Requested by ${ctx.from.id}`);
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));