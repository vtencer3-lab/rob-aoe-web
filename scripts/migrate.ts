import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("Chybí DATABASE_URL.");

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

const dir = join(import.meta.dirname, "..", "database");
const soubory = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const { rows } = await client.query<{ version: string }>("SELECT version FROM schema_migrations");
const hotove = new Set(rows.map((r) => r.version));

for (const soubor of soubory) {
  const version = soubor.replace(/\.sql$/, "");
  if (hotove.has(version)) continue;
  const sql = await readFile(join(dir, soubor), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
    await client.query("COMMIT");
    console.log(`applied ${version}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

await client.end();
