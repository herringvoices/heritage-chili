import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const profile = process.argv[2];
if (profile !== "baseline" && profile !== "full-swing") {
  throw new Error("Expected the baseline or full-swing profile.");
}

const stateDir = join(process.cwd(), ".wrangler/state/v3/d1/miniflare-D1DatabaseObject");
await mkdir(stateDir, { recursive: true });
const candidates = (await readdir(stateDir)).filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite");
if (candidates.length > 1) {
  throw new Error(`Expected no more than one local D1 database, found ${candidates.length}.`);
}

const sql = await readFile(join(process.cwd(), "scripts/reset-profiles", `${profile}.sql`), "utf8");
// This stable filename is Miniflare's key for the placeholder D1 ID in vite.config.ts.
const databaseFile = candidates[0] ?? "faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite";
const db = new DatabaseSync(join(stateDir, databaseFile));
try {
  const hasSchema = db.prepare("select count(*) as count from sqlite_master where type='table' and name='users'").get().count > 0;
  if (!hasSchema) {
    for (const migration of ["0000_parched_scream.sql", "0001_organic_shaman.sql"]) {
      const migrationSql = await readFile(join(process.cwd(), "drizzle", migration), "utf8");
      db.exec(migrationSql.replaceAll("--> statement-breakpoint", ""));
    }
  }
  db.exec(sql);
} finally {
  db.close();
}
