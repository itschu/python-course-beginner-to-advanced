import "server-only";

import { Pool } from "pg";

/** Vercel's Neon/Postgres integrations set DATABASE_URL or POSTGRES_URL. */
export const databaseUrl = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;

declare global {
  var __pypathPool: Pool | undefined;
}

function createPool(): Pool | null {
  if (!databaseUrl) return null;
  // Serverless functions get a few connections each; use the pooled URL from your provider.
  return new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 10_000 });
}

/** Shared connection pool, reused across hot reloads in development. */
export const pool: Pool | null = globalThis.__pypathPool ?? createPool();
if (pool && process.env.NODE_ENV !== "production") globalThis.__pypathPool = pool;
