// Direct SQL probe used during migration verification (no dotenv dependency).
import { readFileSync } from "node:fs";
import pg from "pg";

// Load .env with strict KEY="value" parsing (strip surrounding quotes).
for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)="?(.*?)"?\s*$/);
  if (m) process.env[m[1]] = m[2];
}

const which = process.argv[2] === "pooled" ? "DATABASE_URL" : "DATABASE_URL_UNPOOLED";
const url = process.env[which];
if (!url) {
  console.error(`No ${which} found in .env`);
  process.exit(1);
}
// Pass the URL to pg verbatim — it performs its own URL decoding.
const pool = new pg.Pool({ connectionString: url, max: 1 });

try {
  const res = await pool.query(
    "select table_name from information_schema.tables where table_schema='public' order by 1",
  );
  console.log(res.rows.map((r) => r.table_name).join(", ") || "(no tables)");
} finally {
  await pool.end();
}
