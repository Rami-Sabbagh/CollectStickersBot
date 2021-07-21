import { User } from 'telegraf/typings/core/types/typegram';
import redis from './redis';

export const enum Language {
    ENGLISH = 'en',
    ARABIC = 'ar',
}

export default class UserProfile {
    /**
     * @param id The Telegram id of the user.
     * @param _firstName The first name of the user.
     * @param _lastName The last name of the user.
     * @param _userName The username of the user.
     * @param _language The configured language of the user.
     * @param _blocked Whether the user has the bot blocked or not.
     * @param _firstInteraction Timestamp of the first interaction with the bot.
     * @param _staticStickersCount The number of static stickers cloned by this user.
     * @param _animatedStickersCount The number of animated stickers cloned by this user.
     * @param _imageStickersCount The number of images stickers cloned by this user.
     */
    protected constructor(
        public readonly id: number,

        protected _firstName: string,
        protected _lastName?: string,
        protected _userName?: string,

        protected _language = Language.ENGLISH,
        protected _blocked = false,

        protected _firstInteraction = Date.now(),
        protected _staticStickersCount = 0,
        protected _animatedStickersCount = 0,
        protected _imageStickersCount = 0,
    ) { }

    get firstName() { return this._firstName; }
    get lastName() { return this._lastName; }
    get userName() { return this._userName; }
    get language() { return this._language; }
    get blocked() { return this._blocked; }
    get firstInteraction() { return this._firstInteraction; }
    get staticStickersCount() { return this._staticStickersCount; }
    get animatedStickersCount() { return this._animatedStickersCount; }
    get imageStickersCount() { return this._imageStickersCount; }

    /**
     * The database key of the user's hash.
     */
    protected get key(): string { return `user:${this.id}`; }

    async setBlocked(value: boolean) {
        if (value === this.blocked) return;
        await redis.hset(this.key, 'blocked', value ? 'true' : 'false');
        this._blocked = value;
    }

    async setLanguage(value: Language) {
        if (value === this.language) return;
        await redis.hset(this.key, 'language', value);
        this._language = value;
    }

    async incrementStickersCount(type: 'static' | 'animated' | 'image') {
        await redis.hincrby(this.key, `${type}_stickers`, 1);

        switch (type) {
            case 'static':
                this._staticStickersCount++;
                break;
            case 'animated':
                this._animatedStickersCount++;
                break;
            case 'image':
                this._imageStickersCount++;
                break;
        }
    }

    protected async saveAll() {
        const pipeline = redis.multi();

        // Clear the existing profile.
        pipeline.del(this.key);

        // Save the new profile.
        pipeline.hmset(this.key, {
            first_name: this.firstName,
            last_name: this.lastName,
            user_name: this.userName,
            language: this.language,
            blocked: this.blocked,
            first_interaction: this.firstInteraction,
            static_stickers: this._staticStickersCount,
            animated_stickers: this._animatedStickersCount,
            image_stickers: this._imageStickersCount,
        });

        await pipeline.exec();
    }

    static readonly invalid = new UserProfile(0, '[INVALID]', undefined, undefined, undefined, undefined, 0);

    /**
     * Loads a user's profile from the database if it exists.
     *
     * @param id The Telegram ID of the user to load.
     * @returns The user's profile if it exists, null otherwise.
     */
    static async load(id: number): Promise<UserProfile | null> {
        const userKey = `user:${id}`;

        const [
            first_name, last_name, user_name, language, blocked, first_interaction, static_stickers, animated_stickers, image_stickers
        ] = await redis.hmget(userKey,
            'first_name', 'last_name', 'user_name', 'language', 'blocked', 'first_interaction', 'static_stickers', 'animated_stickers', 'image_stickers'
        );

        if (!first_name && !(await redis.exists(userKey))) return null;

        return new UserProfile(
            id,
            first_name ?? '[INVALID]',
            last_name ?? undefined,
            user_name ?? undefined,
            (language ?? Language.ENGLISH) as Language,
            blocked === 'true',
            Number.parseInt(first_interaction ?? `${Date.now()}`),
            Number.parseInt(static_stickers ?? '0'),
            Number.parseInt(animated_stickers ?? '0'),
            Number.parseInt(image_stickers ?? '0'),
        );
    }

    /**
     * Loads/Creates and updates a user profile from the database.
     *
     * @param user The Telegram user to get his/her profile.
     * @returns The user's profile.
     */
    static async of(user: User): Promise<UserProfile> {
        const key = `user:${user.id}`;

        const [
            language, blocked, first_interaction, static_stickers, animated_stickers, image_stickers
        ] = await redis.hmget(key,
            'language', 'blocked', 'first_interaction', 'static_stickers', 'animated_stickers', 'image_stickers'
        );

        const profile = new UserProfile(user.id, user.first_name, user.last_name, user.username,
            (language ?? Language.ENGLISH) as Language,
            blocked === 'true',
            Number.parseInt(first_interaction ?? `${Date.now()}`),
            Number.parseInt(static_stickers ?? '0'),
            Number.parseInt(animated_stickers ?? '0'),
            Number.parseInt(image_stickers ?? '0'),
        );
        await profile.saveAll();

        return profile;
    }
}
