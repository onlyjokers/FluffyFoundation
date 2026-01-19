import { createClient, type RedisClientType } from 'redis';

export type RedisHandle = {
  client: RedisClientType;
  connected: boolean;
};

export async function connectRedis(url: string): Promise<RedisHandle> {
  const client = createClient({ url }) as RedisClientType;
  client.on('error', (err) => {
    console.error('[Redis] client error:', err?.message ?? err);
  });
  await client.connect();
  return { client, connected: true };
}
