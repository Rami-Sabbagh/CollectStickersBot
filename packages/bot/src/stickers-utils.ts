import axios from 'axios';
import sharp from 'sharp';

import { Context } from 'telegraf';
import { InputFile, PhotoSize, Sticker, StickerSet, Update } from 'telegraf/typings/core/types/typegram';

/**
 * Gets the collection volume name for a specific user.
 *
 * @param ctx The Telegram context for an update originated from a user.
 * @param volumeId The number of the collection volume to get it's name.
 * @returns The collection volume name.
 */
function getCollectionName(ctx: Context, volumeId: number): string {
    if (!ctx.from) throw new Error("The context doesn't belong to a user!");

    const { id: userId } = ctx.from;
    const { username: botUsername } = ctx.botInfo;

    return `Collection_${volumeId}_${userId}_by_${botUsername}`;
}

/**
 * Formats a HTML link for a stickers set.
 *
 * @param pack The stickers set to generate the link for.
 * @returns A HTML formatted link for the sticker set.
 */
function formatStickerSetLink(pack: StickerSet): string {
    return `<a href="https://t.me/addstickers/${pack.name}">${pack.title}</a>`;
}

/**
 * Finds the suitable stickers pack which the sticker can be added to.
 * It searches through the user's packs, checks that the pack has space for new stickers
 * and matches the sticker type.
 *
 * @param ctx The Telegram context for an update originated from the user.
 * @param isAnimated Whether the targetted sticker is animated or not.
 * @returns The StickerSet suitable for adding a new sticker of the specified type if available, null otherwise,
 * And the number of the collection volume that the sticker would be added to (existing or new).
 */
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

/**
 * Finds the most suitable photo size for convertion into a sticker.
 * It searches for the smallest size available that's larger or equal to 512x512.
 * So it's not too large to process, and doesn't get bad quality when contained in 512x512 box.
 *
 * @param photos The photos to search in.
 * @returns The most suitable photo.
 */
function findMostSuitablePhoto(photos: PhotoSize[]): PhotoSize {
    photos.sort((a, b) => Math.max(a.width, a.height) - Math.max(b.width, b.height));

    let bestPhoto = photos[0];

    photos.forEach((photo) => {
        const photoLength = Math.max(photo.width, photo.height);
        const bestLength = Math.max(bestPhoto.width, bestPhoto.height);

        if (bestLength < 512 && photoLength > bestLength) bestPhoto = photo;
    });

    return bestPhoto;
}

interface StickerAdditionResult {
    /**
     * Whether the sticker was added to an existing pack or a new one was created.
     */
    type: 'new_pack' | 'existing_pack';
    /**
     * A HTML formatted link for the pack, suitable for sending to the user.
     */
    packLink: string;
};

/**
 * Adds a new sticker to the user's collections.
 *
 * @param ctx A Telegram context of an update which originates from the user.
 * @param emojis The emojis which represents the sticker.
 * @param png The PNG image that represents the **static** sticker, shouldn't be set when it's an animated sticker.
 * @param tgs The TGS image that represents the **animated** sticker, shouldn't be set when it's a static sticker.
 * 
 * @throws If the addition failed to some reason (connection issues, api errors, ...).
 */
async function addStickerToCollections(ctx: Context, emojis: string, png?: string | InputFile, tgs?: InputFile): Promise<StickerAdditionResult> {
    if (png === undefined && tgs === undefined) throw new Error('Both PNG and TGS are undefined!');
    if (png !== undefined && tgs !== undefined) throw new Error('Both PNG and TGS are defined!');

    if (!ctx.from) throw new Error("The context doesn't come from a user message!");

    const isAnimated = tgs !== undefined;
    const [pack, volumeId] = await findSuitablePack(ctx, isAnimated);

    if (pack) { // Adding to an existing pack.
        await ctx.addStickerToSet(pack.name, {
            emojis: emojis,
            png_sticker: png,
            tgs_sticker: tgs,
        });

        return { type: 'existing_pack', packLink: formatStickerSetLink(pack) };
    } else { // Adding to a new pack.
        const packName = getCollectionName(ctx, volumeId);
        const packTitle = `${ctx.from.first_name}'s collection vol. ${volumeId}`;

        await ctx.createNewStickerSet(packName, packTitle, {
            emojis: emojis,
            png_sticker: png,
            tgs_sticker: tgs,
        });

        return { type: 'new_pack', packLink: `<a href="https://t.me/addstickers/${packName}">${packTitle}</a>` };
    }
}

/**
 * Clones a sticker into the user's collections.
 * @param ctx A Telegram context of an update which belongs to the user.
 * @param sticker The sticker to clones.
 * @returns The sticker addition to collections result.
 */
export async function cloneSticker(ctx: Context, sticker: Sticker): Promise<StickerAdditionResult> {
    if (sticker.emoji !== undefined) {
        return addStickerToCollections(ctx, sticker.emoji,
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

        return addStickerToCollections(ctx, '🖼', { source: convertedBuffer });
    }
}

/**
 * Creates a sticker from an image, and adds it to the user's collections.
 *
 * @param ctx A Telegram context of an update which belongs to the user.
 * @param photos The list of available photo sizes of the image to use.
 * @returns The sticker addition to collections result.
 */
export async function createStickerFromImage(ctx: Context, photos: PhotoSize[]): Promise<StickerAdditionResult> {
    const photo = findMostSuitablePhoto(photos);

    // Download the suitable photo.
    const photoUrl = await ctx.telegram.getFileLink(photo.file_id);
    const photoResponse = await axios.get<ArrayBuffer>(photoUrl.href, {
        responseType: 'arraybuffer',
        maxContentLength: 512 * 1024, // Allow 512kb maximum.
    });

    // Convert and resize the photo.
    const photoBuffer = Buffer.from(photoResponse.data);
    const stickerBuffer = await sharp(photoBuffer)
        .resize(512, 512, { fit: 'inside' })
        .png({ compressionLevel: 9 }).toBuffer();

    return addStickerToCollections(ctx, '🖼', { source: stickerBuffer });
}

/**
 * Finds the collection packs of a user, and formats a list of HTML links to them.
 * @param ctx A Telegram context of an update which belongs to the user.
 * @returns A list of HTML formatted links for the user's collections packs.
 */
export async function findPacksLinksForUser(ctx: Context): Promise<string[]> {
    const packs: StickerSet[] = [];

    let volumeId = 0;
    while (true) {
        try {
            const collectionName = getCollectionName(ctx, ++volumeId);
            packs.push(await ctx.telegram.getStickerSet(collectionName));
        } catch (_) {
            break;
        }
    }

    return packs.map(formatStickerSetLink);
}