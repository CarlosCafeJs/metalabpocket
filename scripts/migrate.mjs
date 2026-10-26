import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import nextEnv from '@next/env';

// Next loads .env files automatically; this standalone script must do the same.
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const { Client } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('Migração não iniciada: DATABASE_URL não configurada.');
  process.exitCode = 1;
} else {
  const ca = process.env.DATABASE_CA?.replace(/\\n/g, '\n');
  // Keep certificate verification enabled in production. The opt-in exists
  // only to let local development connect to Railway's self-signed TCP proxy.
  const allowInsecureLocalTls =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false' &&
    process.env.NODE_ENV !== 'production' &&
    process.env.VERCEL !== '1';
  const rejectUnauthorized = !allowInsecureLocalTls;
  const ssl = process.env.DATABASE_SSL === 'false'
    ? false
    : ca ? { ca, rejectUnauthorized } : { rejectUnauthorized };
  const client = new Client({
    connectionString,
    ssl,
    connectionTimeoutMillis: 10000
  });

  try {
    const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
    const migrationFiles = (await readdir(migrationsDir))
      .filter(file => /^\d+_.+\.sql$/.test(file))
      .sort((left, right) => left.localeCompare(right));

    await client.connect();
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('metalab-pocket-migrations')::bigint)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS metalab_schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedResult = await client.query('SELECT name FROM metalab_schema_migrations');
    const applied = new Set(appliedResult.rows.map(row => row.name));

    for (const file of migrationFiles) {
      if (applied.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO metalab_schema_migrations (name) VALUES ($1)', [file]);
      console.log(`Migração aplicada: ${file}`);
    }

    await client.query('COMMIT');
    if (migrationFiles.every(file => applied.has(file))) console.log('Banco já estava atualizado.');
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* conexão pode não ter sido aberta */ }
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`Falha ao aplicar migrações (${code}).`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
