import dotenv from 'dotenv';
dotenv.config();

import { Context, Telegraf } from 'telegraf';

import redis from './redis';
import UserProfile from './user-profile';

import { cloneSticker, createStickerFromImage, findPacksLinksForUser } from './stickers-utils';

interface MyContext extends Context {
    profile: UserProfile
}

if (process.env.BOT_TOKEN === undefined) throw new Error('"BOT_TOKEN" is not set ⚠');

const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN);

bot.use(async (ctx, next) => {
    if (ctx.from) ctx.profile = await UserProfile.of(ctx.from);
    else ctx.profile = UserProfile.unknown;

    await next();
});

bot.on('my_chat_member', async (ctx, next) => {
    await ctx.profile.setBlocked(ctx.myChatMember.new_chat_member.status === 'kicked');
    await next();
});

bot.start((ctx) => {
    ctx.reply('🚧 The bot is being rewritten 🚧');
});

bot.on('photo', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    const { photo: photos } = ctx.message;

    let response = '[INVALID]';

    try {
        const result = await createStickerFromImage(ctx, photos);

        if (result.type === 'new_pack') response = `Added into ${result.packLink} <b>(new)</b> successfully ✅`;
        else if (result.type === 'existing_pack') response = `Added into ${result.packLink} successfully ✅\nThe sticker will take a while to show in the pack.`;

        await ctx.profile.incrementStickersCount('image');
    } catch (error) {
        console.error(error);
        response = 'An error occured while cloning the sticker ⚠\nPlease wait a while and resend the sticker to retry.';
    }

    await ctx.replyWithHTML(response);
});

bot.on('sticker', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    const { sticker } = ctx.message;

    let response = '[INVALID]';

    try {
        const result = await cloneSticker(ctx, sticker);

        if (result.type === 'new_pack') response = `Added into ${result.packLink} <b>(new)</b> successfully ✅`;
        else if (result.type === 'existing_pack') response = `Added into ${result.packLink} successfully ✅\nThe sticker will take a while to show in the pack.`;

        await ctx.profile.incrementStickersCount(sticker.is_animated ? 'animated' : 'static');
    } catch (error) {
        console.error(error);
        response = 'An error occured while cloning the sticker ⚠\nPlease wait a while and resend the sticker to retry.';
    }

    await ctx.replyWithHTML(response);
});

bot.command('packs', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    const packs = await findPacksLinksForUser(ctx);

    if (packs.length === 0) await ctx.reply('No packs were found ⚠');
    else await ctx.replyWithHTML(packs.join('\n'));
});

bot.command('ping', (ctx) => {
    ctx.reply('Pong 🏓');
});

if (process.env.DEBUG === 'true') {
    bot.command('chatid', async (ctx) => {
        ctx.replyWithHTML(`Chat id: <pre>${ctx.chat.id}</pre>`);
    });

    bot.command('profile', async (ctx) => {
        ctx.replyWithHTML(`<pre>${JSON.stringify(await redis.hgetall(`user:${ctx.from.id}`), undefined, '\t')}</pre>`);
    });

    bot.command('stop', async (ctx) => {
        await ctx.reply('It was nice to serve you sir 😊');
        stop(`Requested by ${ctx.from.id}`);
    });
}

function stop(reason?: string) {
    bot.stop(reason);
    redis.quit().catch(console.error);
}

bot.launch({ allowedUpdates: ['message', 'callback_query', 'my_chat_member'] });

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));