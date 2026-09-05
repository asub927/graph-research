/**
 * Migration runner.
 *
 * Applies every `.sql` file in db/migrations in filename order, once each,
 * recording what it applied in a `schema_migrations` table. Works against
 * whichever driver `getDb()` resolves to, so the same migrations run against
 * production Postgres and local PGlite.
 *
 * Usage: npm run db:migrate
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { finish, getDb } from '../src/lib/db.ts';
import { embeddingConfig } from '../src/lib/config.ts';

const MIGRATIONS_DIR = join(process.cwd(), 'db', 'migrations');

export async function migrate(): Promise<{ applied: string[]; skipped: string[] }> {
  const db = await getDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `);

  const alreadyApplied = new Set(
    (await db.query<{ name: string }>('SELECT name FROM schema_migrations')).map(
      (row) => row.name,
    ),
  );

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];

  for (const name of files) {
    if (alreadyApplied.has(name)) {
      skipped.push(name);
      continue;
    }

    const raw = await readFile(join(MIGRATIONS_DIR, name), 'utf8');
    const sql = raw.replaceAll(
      '{{EMBEDDING_DIMENSIONS}}',
      String(embeddingConfig.dimensions),
    );

    await db.exec(sql);
    await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    applied.push(name);
  }

  return { applied, skipped };
}

// Only run when invoked directly, so tests can import `migrate` without side
// effects.
if (import.meta.url === `file://${process.argv[1]}`) {
  const { applied, skipped } = await migrate();
  const db = await getDb();
  console.log(`driver: ${db.driver}`);
  for (const name of skipped) console.log(`  already applied  ${name}`);
  for (const name of applied) console.log(`  applied          ${name}`);
  if (applied.length === 0) console.log('schema already up to date');
  await finish();
}
