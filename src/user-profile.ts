import { User } from 'telegraf/typings/core/types/typegram';
import redis from './redis';

export const enum Language {
    ENGLISH = 'en',
    ARABIC = 'ar',
}

export default class UserProfile {
    /**
     * @param id The Telegram id of the user.
     */
    protected constructor(public readonly id: number) { }

    /**
     * The database key of the user's hash.
     */
    protected get key(): string { return `user:${this.id}`; }

    async getLanguage(): Promise<Language> {
        const language = await redis.hget(this.key, 'language');
        return (language ?? Language.ENGLISH) as Language;
    }

    async setBlocked(value: boolean) {
        await redis.hset(this.key, 'blocked', value ? 'true' : 'false');
    }

    async setLanguage(value: Language) {
        await redis.hset(this.key, 'language', value);
    }

    async incrementStickersCount(type: 'static' | 'animated' | 'image') {
        await redis.hincrby(this.key, `${type}_stickers`, 1);
    }

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
        await pipeline.exec();

        return new UserProfile(user.id);
    }
}
