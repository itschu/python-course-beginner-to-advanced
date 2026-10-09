// Create or update the database tables: Better Auth's tables, then db/schema.sql.
// Safe to run repeatedly. Usage:
//   npm run db:migrate                # reads DATABASE_URL from the environment or .env.local
//   node scripts/migrate.mjs --if-configured   # used by `npm run build`: skips quietly without a database
import { readFileSync } from "node:fs";
import { getMigrations } from "better-auth/db/migration";
import pg from "pg";

try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: use the real environment
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
const ifConfigured = process.argv.includes("--if-configured");

if (!url) {
  if (ifConfigured) {
    console.log("[migrate] No DATABASE_URL set: skipping (accounts stay disabled, progress is saved in the browser).");
    process.exit(0);
  }
  console.error("[migrate] DATABASE_URL is not set. Add it to .env.local or your environment.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url, max: 1 });
try {
  // The options must match lib/auth.ts wherever they affect the schema.
  const options = { database: pool, emailAndPassword: { enabled: true } };
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(options);
  if (toBeCreated.length || toBeAdded.length) {
    console.log(
      `[migrate] Better Auth: creating ${toBeCreated.map((t) => t.table).join(", ") || "no tables"}` +
        (toBeAdded.length ? `, updating ${toBeAdded.map((t) => t.table).join(", ")}` : ""),
    );
    await runMigrations();
  } else {
    console.log("[migrate] Better Auth tables are up to date.");
  }
  await pool.query(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
  console.log("[migrate] Course tables are up to date.");
} catch (error) {
  console.error("[migrate] Failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
