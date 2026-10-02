import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { Sql } from "postgres";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

function dataFolder(): string {
  return ["data", "pglite"].join(path.sep);
}

type Connection = { kind: "postgres"; client: Sql } | { kind: "pglite"; client: PGlite };

/**
 * Two modes, same schema and queries:
 *  - DATABASE_URL set   -> real PostgreSQL (production / when you scale)
 *  - DATABASE_URL empty -> built-in PGlite database stored in ./data (free, zero setup)
 */
async function openConnection(): Promise<Connection> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { default: postgres } = await import("postgres");
    return { kind: "postgres", client: postgres(url, { max: 5 }) };
  }
  // Resolved at runtime only, so build tools never copy your data into a build.
  const dataDir = process.env.PGLITE_DIR || path.resolve(/* turbopackIgnore: true */ process.cwd(), dataFolder());
  fs.mkdirSync(path.dirname(dataDir), { recursive: true });
  lockDataDir(dataDir);
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(dataDir);
  // Fail here (not on the first query) so a failed open is retried instead of cached.
  await client.waitReady;
  closeOnExit(client);
  return { kind: "pglite", client };
}

/**
 * PGlite has no locking of its own: two servers opening the same folder at once (an old
 * `npm run dev` still running while a new one starts) overwrite each other's files and
 * corrupt the database. A lock file holding our process id makes the second one stop instead.
 */
function lockDataDir(dataDir: string) {
  const lock = `${dataDir}.lock`;
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return (e as NodeJS.ErrnoException).code === "EPERM";
    }
  };
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
  } catch {
    const owner = Number(fs.readFileSync(lock, "utf8"));
    if (owner && owner !== process.pid && alive(owner)) {
      throw new Error(
        `The database in ${dataDir} is already open in another running server (process ${owner}). ` +
          `Stop the other "npm run dev" / "npm start" first; two at once would corrupt it.`,
      );
    }
    fs.writeFileSync(lock, String(process.pid)); // left behind by a server that has exited
  }
  process.once("exit", () => {
    try {
      if (fs.readFileSync(lock, "utf8") === String(process.pid)) fs.unlinkSync(lock);
    } catch {}
  });
}

/** Shut the database down cleanly on Ctrl+C / stop, so it never has to recover from a half-written state. */
function closeOnExit(client: PGlite) {
  let closing = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    client
      .close()
      .catch(() => undefined)
      .finally(() => process.kill(process.pid, signal));
  };
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, shutdown);
}

// The connection lives for the whole process (and survives dev hot-reloads);
// migrations run one at a time, however many parts of the app ask at once.
const g = globalThis as unknown as {
  __jobHuntConn?: Promise<Connection>;
  __jobHuntMigrations?: Promise<unknown>;
  /** Set by the first version of this file (it cached the whole Drizzle instance). */
  __jobHuntDb?: Promise<{ $client: unknown }>;
};

async function init(): Promise<DB> {
  // A server started on the old version already has the database open: reuse that client
  // instead of opening the same files twice.
  if (!g.__jobHuntConn && g.__jobHuntDb) {
    g.__jobHuntConn = g.__jobHuntDb.then(
      (old) => (process.env.DATABASE_URL ? { kind: "postgres", client: old.$client as Sql } : { kind: "pglite", client: old.$client as PGlite }),
    );
  }
  g.__jobHuntConn ??= openConnection().catch((err) => {
    g.__jobHuntConn = undefined;
    throw err;
  });
  const conn = await g.__jobHuntConn;

  let db: DB;
  let migrate: () => Promise<void>;
  if (conn.kind === "postgres") {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const migrator = await import("drizzle-orm/postgres-js/migrator");
    const d = drizzle({ client: conn.client, schema });
    db = d as unknown as DB;
    migrate = () => migrator.migrate(d, { migrationsFolder: MIGRATIONS });
  } else {
    const { drizzle } = await import("drizzle-orm/pglite");
    const migrator = await import("drizzle-orm/pglite/migrator");
    const d = drizzle({ client: conn.client, schema });
    db = d as unknown as DB;
    migrate = () => migrator.migrate(d, { migrationsFolder: MIGRATIONS });
  }

  const run = (g.__jobHuntMigrations ?? Promise.resolve()).catch(() => undefined).then(migrate);
  g.__jobHuntMigrations = run;
  await run;
  return db;
}

// Checked once per load of this module, so after a code update that adds a migration,
// the running app applies it without a restart (in dev, any edit to this file or the schema reloads it).
let ready: Promise<DB> | undefined;

export function getDb(): Promise<DB> {
  ready ??= init().catch((err) => {
    ready = undefined;
    throw err;
  });
  return ready;
}

export { schema };
