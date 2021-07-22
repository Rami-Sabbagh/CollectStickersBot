import { User } from 'telegraf/typings/core/types/typegram';
import { isValidLanguage } from './localization';
import redis from './redis';

/**
 * Represents the database stored profile of the user.
 */
export default class UserProfile {
    /**
     * @param id The Telegram id of the user.
     */
    protected constructor(
        public readonly id: number,
        protected language: string,
    ) { }

    /**
     * The database key of the user's hash.
     */
    protected get key(): string { return `user:${this.id}`; }

    /**
     * Get the language configured for the user to interact with the bot using.
     */
    getLanguage(): string { return this.language; }

    /**
     * Update whether the user has the bot blocked or not.
     */
    async setBlocked(value: boolean) {
        if (value)
            await redis.pipeline()
                .hset(this.key, 'blocked', 'true')
                .hincrby(this.key, 'blocked_times', 1)
                .exec();
        else
            await redis.hdel(this.key, 'blocked');
    }

    /**
     * Set the language for the user to interact with the bot using.
     */
    async setLanguage(value: string) {
        await redis.hset(this.key, 'language', value);
        this.language = value;
    }

    /**
     * Increment the processed stickers counter for the user.
     */
    async incrementStickersCount(type: 'static' | 'animated' | 'image') {
        await redis.hincrby(this.key, `${type}_stickers`, 1);
    }

    /**
     * A shared instance that represents an unknown/invalid user.
     */
    static readonly unknown = new UserProfile(0, 'en');

    /**
     * Loads/Creates and updates a user profile from the database.
     *
     * @param user The Telegram user to get his/her profile.
     * @returns The user's profile.
     */
    static async of(user: User): Promise<UserProfile> {
        const key = `user:${user.id}`;

        const updateFields: Record<string, string | undefined> = {
            first_name: user.first_name,
            last_name: user.last_name,
            user_name: user.username,
            language_code: user.language_code,
            last_used: `${Date.now()}`,
        };

        const toSet: Record<string, string> = {};
        const toClear: string[] = [];

        Object.entries(updateFields).forEach(([field, value]) => {
            if (value === undefined) toClear.push(field);
            else toSet[field] = value;
        });

        // Update the values in the database.
        const pipeline = redis.multi();

        if (Object.entries(toSet).length !== 0) pipeline.hmset(key, toSet);
        if (toClear.length !== 0) pipeline.hdel(key, ...toClear);

        pipeline.sadd('users', user.id);

        await pipeline.exec();

        const language = await redis.hget(key, 'language');
        const osLanguage = user.language_code;

        if (language) return new UserProfile(user.id, language);
        else if (osLanguage && isValidLanguage(osLanguage)) return new UserProfile(user.id, osLanguage);
        else return new UserProfile(user.id, 'en');
    }
}
