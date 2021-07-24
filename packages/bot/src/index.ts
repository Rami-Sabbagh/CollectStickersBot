import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

import chalk from 'chalk';
import { Context, Telegraf } from 'telegraf';

import redis from './redis';
import UserProfile from './user-profile';

import * as localization from './localization';

import { cloneSticker, createStickerFromImage, findPacksLinksForUser } from './stickers-utils';

interface MyContext extends Context {
    profile: UserProfile;
    localize(string_id: string, view?: Record<string, any>): string;
}

if (process.env.BOT_TOKEN === undefined) throw new Error('"BOT_TOKEN" is not set ⚠');

const bot = new Telegraf<MyContext>(process.env.BOT_TOKEN);

async function sendLanguagesMenu(ctx: MyContext) {
    await ctx.reply(ctx.localize('language_select'), {
        reply_markup: localization.languagesKeyboard(),
    });
}

async function increaseStickersCounter(type: 'static' | 'animated' | 'image') {
    return redis.hincrby('stickers_usage', type, 1);
}

async function increaseCommandCounter(command: string) {
    return redis.hincrby('commands_usage', command, 1);
}

bot.use(async (ctx, next) => {
    if (ctx.from) ctx.profile = await UserProfile.of(ctx.from);
    else ctx.profile = UserProfile.unknown;

    ctx.localize = (string_id, view) => {
        const language_code = ctx.profile.getLanguage();
        return localization.localize(language_code, string_id, view);
    }

    await next();
});

bot.on('my_chat_member', async (ctx, next) => {
    await ctx.profile.setBlocked(ctx.myChatMember.new_chat_member.status === 'kicked');
    await next();
});

bot.on('callback_query', async (ctx, next) => {
    const data = ((ctx.callbackQuery as any).data as string | undefined);
    const { message } = ctx.callbackQuery;

    if (data && data.length <= 64 && data.startsWith('set_language:')) {
        const languageCode = data.substring('set_language:'.length);

        if (localization.isValidLanguage(languageCode)) {
            await ctx.profile.setLanguage(languageCode);
            await ctx.answerCbQuery(ctx.localize('language_selected'));

            if (message) await ctx.deleteMessage(message.message_id).catch(console.error);
            ctx.reply(ctx.localize('basic_help'));
        }

        return;
    }

    await next();
});

bot.start(async (ctx) => {
    await increaseCommandCounter('start');
    await sendLanguagesMenu(ctx);
});

bot.help(async (ctx) => {
    await increaseCommandCounter('help');
    await ctx.reply(ctx.localize('basic_help'));
});

bot.command('language', async (ctx) => {
    await increaseCommandCounter('language');
    await sendLanguagesMenu(ctx);
});

bot.on('photo', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    const { photo: photos } = ctx.message;

    let response = '[INVALID]';

    try {
        const result = await createStickerFromImage(ctx, photos);

        if (result.type === 'new_pack') response = ctx.localize('stickers_add_success_new', { pack_link: result.packLink });
        else if (result.type === 'existing_pack') response = ctx.localize('stickers_add_success', { pack_link: result.packLink });

        await ctx.profile.incrementStickersCount('image');
        await increaseStickersCounter('image');
    } catch (error) {
        console.error(error);
        response = ctx.localize('sticker_image_failure');
    }

    await ctx.replyWithHTML(response);
});

bot.on('sticker', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    const { sticker } = ctx.message;

    let response = '[INVALID]';

    try {
        const result = await cloneSticker(ctx, sticker);

        if (result.type === 'new_pack') response = ctx.localize('stickers_add_success_new', { pack_link: result.packLink });
        else if (result.type === 'existing_pack') response = ctx.localize('stickers_add_success', { pack_link: result.packLink });

        await ctx.profile.incrementStickersCount(sticker.is_animated ? 'animated' : 'static');
        await increaseStickersCounter(sticker.is_animated ? 'animated' : 'static');
    } catch (error) {
        console.error(error);
        response = ctx.localize('stickers_add_failure');
    }

    await ctx.replyWithHTML(response);
});

bot.command('packs', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    await increaseCommandCounter('packs');

    const packs = await findPacksLinksForUser(ctx);

    if (packs.length === 0) await ctx.reply(ctx.localize('stickers_list_empty'));
    else await ctx.replyWithHTML(ctx.localize('stickers_list_success', {
        count: packs.length,
        packs_links: packs,
    }));
});

bot.command('ping', async (ctx) => {
    await increaseCommandCounter('ping');
    await ctx.reply('Pong 🏓');
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
    redis.quit().catch(console.error);
    bot.stop(reason);
}

async function start() {
    process.once('SIGINT', () => stop('SIGINT'));
    process.once('SIGTERM', () => stop('SIGTERM'));

    const info = chalk.blueBright;

    console.info(info('> Connecting to Redis database...'));
    await redis.ping();
    console.info(info('> Loading localization data...'));
    await localization.load();
    console.info(info('> Launching the bot...'));
    await bot.launch({ allowedUpdates: ['message', 'callback_query', 'my_chat_member'] });

    console.info(chalk.greenBright('> Ready ✔'));
}

start().catch(console.error);