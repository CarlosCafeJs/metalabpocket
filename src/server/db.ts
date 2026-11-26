import 'server-only';
import { checkServerIdentity } from 'node:tls';
import { Pool, type PoolClient } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var eduCafePool: Pool | undefined;
}

function sslConfig() {
  const ca = process.env.DATABASE_CA?.replace(/\\n/g, '\n');
  const servername = process.env.DATABASE_SSL_SERVERNAME?.trim();
  return {
    ...(ca ? { ca } : {}),
    ...(servername ? {
      servername,
      checkServerIdentity: (_hostname: string, certificate: Parameters<typeof checkServerIdentity>[1]) =>
        checkServerIdentity(servername, certificate)
    } : {}),
    rejectUnauthorized: true
  };
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_NOT_CONFIGURED');
  if (!globalThis.eduCafePool) {
    globalThis.eduCafePool = new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 7000,
      idleTimeoutMillis: 15000,
      ssl: sslConfig()
    });
  }
  return globalThis.eduCafePool;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
