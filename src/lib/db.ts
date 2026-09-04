/**
 * Database access.
 *
 * Two drivers sit behind one interface. When `DATABASE_URL` is set we talk to a
 * real Postgres over `pg` — that is the production path, and Neon and Supabase
 * both ship the `vector` extension we need. When it is unset we fall back to
 * PGlite, an in-process WASM Postgres that loads the same extension and speaks
 * the same SQL, so local development and tests need no database server.
 *
 * Both drivers use `$1`-style placeholders and return plain row objects, so
 * every query in the codebase is written once and runs unmodified on either.
 */

import type { Pool as PgPool } from 'pg';

export interface Db {
  /** Run a parameterised query and return its rows. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Run one or more statements with no parameters. Used by migrations. */
  exec(sql: string): Promise<void>;
  /** Which driver is in use, for diagnostics. */
  readonly driver: 'pg' | 'pglite';
}

class PostgresDb implements Db {
  readonly driver = 'pg' as const;

  constructor(private readonly pool: PgPool) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query(sql, params as never[]);
    return result.rows as T[];
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }
}

interface PgliteLike {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

class PgliteDb implements Db {
  readonly driver = 'pglite' as const;

  constructor(private readonly client: PgliteLike) {}

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.client.query<T>(sql, params);
    return result.rows;
  }

  async exec(sql: string): Promise<void> {
    await this.client.exec(sql);
  }
}

async function createPostgres(connectionString: string): Promise<Db> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString,
    max: 5,
    // Managed Postgres providers terminate idle connections; keep the pool small
    // and let it recycle rather than holding sockets open across invocations.
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return new PostgresDb(pool);
}

async function createPglite(): Promise<Db> {
  const [{ PGlite }, { vector }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('@electric-sql/pglite/vector'),
  ]);
  const client = await PGlite.create({
    dataDir: process.env.PGLITE_DATA_DIR ?? '.pgdata',
    extensions: { vector },
  });
  return new PgliteDb(client as unknown as PgliteLike);
}

// Cached on globalThis so Next.js hot reloads and repeated script runs reuse one
// connection. PGlite in particular holds an exclusive lock on its data
// directory, so a second instance in the same process would fail.
const globalCache = globalThis as typeof globalThis & {
  __fyiDb?: Promise<Db>;
};

export function getDb(): Promise<Db> {
  if (!globalCache.__fyiDb) {
    const connectionString = process.env.DATABASE_URL;
    globalCache.__fyiDb = connectionString
      ? createPostgres(connectionString)
      : createPglite();
  }
  return globalCache.__fyiDb;
}

/** Convenience wrapper: acquire the database and run one query. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getDb();
  return db.query<T>(sql, params);
}

/** Run a query expected to return at most one row. */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Serialise an embedding for pgvector. Both drivers accept the textual
 * `[1,2,3]` form, which avoids depending on a binary codec.
 */
export function toVector(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
