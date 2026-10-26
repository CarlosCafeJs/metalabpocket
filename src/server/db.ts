import 'server-only';
import { Pool, type PoolClient } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var metalabPool: Pool | undefined;
}

function sslConfig() {
  if (process.env.DATABASE_SSL === 'false') return false;
  const ca = process.env.DATABASE_CA?.replace(/\\n/g, '\n');
  // Railway's stock public TCP proxy uses a self-signed certificate. This opt-in
  // is for local development only; production and Vercel always verify TLS.
  const allowInsecureLocalTls =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false' &&
    process.env.NODE_ENV !== 'production' &&
    process.env.VERCEL !== '1';
  const rejectUnauthorized = !allowInsecureLocalTls;
  return ca ? { ca, rejectUnauthorized } : { rejectUnauthorized };
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL_NOT_CONFIGURED');
  if (!globalThis.metalabPool) {
    globalThis.metalabPool = new Pool({
      connectionString,
      max: 3,
      connectionTimeoutMillis: 7000,
      idleTimeoutMillis: 15000,
      ssl: sslConfig()
    });
  }
  return globalThis.metalabPool;
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
