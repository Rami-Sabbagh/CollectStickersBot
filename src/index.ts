import axios from 'axios';
import sharp from 'sharp';
import dotenv from 'dotenv';

import { Context, Telegraf } from 'telegraf';
import { File, InputFile, PhotoSize, Sticker, StickerSet, Update } from 'telegraf/typings/core/types/typegram';

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

async function findSuitablePack(ctx: Context, isAnimated: boolean): Promise<[StickerSet | null, number]> {
    for (let volumeId = 1; true; volumeId++) {
        const collectionName = getCollectionName(ctx, volumeId);

        try {
            const pack = await ctx.telegram.getStickerSet(collectionName);

            // Skip the pack if it's filled to it's limit
            if (pack.stickers.length >= (pack.is_animated ? 50 : 120)) continue;

            // Skip the pack if it doesn't match in type.
            if (pack.is_animated !== isAnimated) continue;

            // The pack is suitable at this point.
            return [pack, volumeId];
        } catch (_) {
            return [null, volumeId];
        }
    }
}

function getMostSuitablePhoto(photos: PhotoSize[]): PhotoSize {
    photos.sort((a, b) => Math.max(a.width, a.height) - Math.max(b.width, b.height));

    let bestPhoto = photos[0];

    photos.forEach((photo) => {
        const photoLength = Math.max(photo.width, photo.height);
        const bestLength = Math.max(bestPhoto.width, bestPhoto.height);

        if (bestLength < 512 && photoLength > bestLength) bestPhoto = photo;
    });

    return bestPhoto;
}

async function addStickerToCollections(ctx: Context<Update>, emojis: string, png?: string | InputFile, tgs?: InputFile) {
    if (png === undefined && tgs === undefined) throw new Error('Both PNG and TGS are undefined!');
    if (png !== undefined && tgs !== undefined) throw new Error('Both PNG and TGS are defined!');

    if (!ctx.from) throw new Error("The context doesn't come from a user message!");

    const isAnimated = tgs !== undefined;
    const [pack, volumeId] = await findSuitablePack(ctx, isAnimated);

    try {
        if (pack) {
            await ctx.addStickerToSet(pack.name, {
                emojis: emojis,
                png_sticker: png,
                tgs_sticker: tgs,
            });

            const packLink = formatStickerSetLink(pack);
            ctx.replyWithHTML(`Added into ${packLink} successfully ✅\nThe sticker will take a while to show in the pack.`);
        } else {
            const packName = getCollectionName(ctx, volumeId);
            const packTitle = `${ctx.from.first_name}'s collection vol. ${volumeId}`;

            await ctx.createNewStickerSet(packName, packTitle, {
                emojis: emojis,
                png_sticker: png,
                tgs_sticker: tgs,
            });

            const packLink = `<a href="https://t.me/addstickers/${packName}">${packTitle}</a>`;
            ctx.replyWithHTML(`Added into ${packLink} <b>(new)</b> successfully ✅`);
        }
    } catch (error) {
        console.error(error);
        ctx.reply('An error occured while cloning the sticker ⚠\nPlease wait a while and resend the sticker to retry.');
    }
}

bot.on('photo', async (ctx) => {
    const { photo: photos } = ctx.message;
    const photo = getMostSuitablePhoto(photos);

    ctx.replyWithChatAction('typing');

    const photoUrl = await ctx.telegram.getFileLink(photo.file_id);
    const photoResponse = await axios.get<ArrayBuffer>(photoUrl.href, {
        responseType: 'arraybuffer',
        maxContentLength: 512 * 1024, // Allow 512kb maximum.
    });

    const photoBuffer = Buffer.from(photoResponse.data);
    const stickerBuffer = await sharp(photoBuffer)
        .resize(512, 512, { fit: 'inside' })
        .png().toBuffer();

    await addStickerToCollections(ctx, '🖼', { source: stickerBuffer });
});

bot.on('sticker', async (ctx) => {
    const { sticker } = ctx.message;

    ctx.replyWithChatAction('typing');

    if (sticker.emoji !== undefined) {
        await addStickerToCollections(ctx, sticker.emoji,
            !sticker.is_animated ? sticker.file_id : undefined,
            sticker.is_animated ? { url: (await ctx.telegram.getFileLink(sticker.file_id)).href } : undefined
        );
    } else {
        // The special webp sticker, needs image conversion.
        const stickerUrl = await ctx.telegram.getFileLink(sticker.file_id);
        const stickerResponse = await axios.get<ArrayBuffer>(stickerUrl.href, {
            responseType: 'arraybuffer',
            maxContentLength: 512 * 1024, // Allow 512kb maximum.
        });

        const stickerBuffer = Buffer.from(stickerResponse.data);
        const convertedBuffer = await sharp(stickerBuffer).png().toBuffer();

        await addStickerToCollections(ctx, '🖼', { source: convertedBuffer });
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