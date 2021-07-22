import Redis from 'ioredis';

/**
 * The redis client instance of the bot.
 * (singleton pattern).
 */
export default new Redis(process.env.REDIS_URL, { keyPrefix: process.env.REDIS_PREFIX });