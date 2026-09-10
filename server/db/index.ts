/**
 * Database client for the Neon Function.
 *
 * Long-running isolate: create the `pg` pool once at module scope and reuse it
 * across requests. `attachDatabasePool` prevents idle-disconnect events from
 * becoming uncaught exceptions.
 */
import { attachDatabasePool } from "@neon/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Deploy with `neon deploy --env <file>` so the branch connection string is injected.");
}

export const pool = new Pool({ connectionString, max: 5 });
attachDatabasePool(pool);

export const db: NodePgDatabase<typeof schema> = drizzle(pool, { schema });

export type Db = typeof db;

export { schema };
