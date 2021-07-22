import { User } from 'telegraf/typings/core/types/typegram';
import redis from './redis';

/**
 * Represents the database stored profile of the user.
 */
export default class UserProfile {
    /**
     * @param id The Telegram id of the user.
     */
    protected constructor(public readonly id: number) { }

    /**
     * The database key of the user's hash.
     */
    protected get key(): string { return `user:${this.id}`; }

    /**
     * Get the language configured for the user to interact with the bot using.
     */
    async getLanguage(): Promise<string> {
        return await redis.hget(this.key, 'language') ?? 'en';
    }

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
    static readonly unknown = new UserProfile(0);

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
        return new UserProfile(user.id);
    }
}
