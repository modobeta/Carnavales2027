import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../db/pool.js";

const migrationsDirectory = fileURLToPath(new URL("../db/migrations/", import.meta.url));

async function loadMigrations() {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();

  return Promise.all(filenames.map(async (filename) => {
    const content = await readFile(path.join(migrationsDirectory, filename));
    const [version] = filename.split("_");
    return { filename, version, checksum: createHash("sha256").update(content).digest("hex") };
  }));
}

// Metadata-only repair: aligns schema_migrations.checksum with the byte-identical
// migration bodies hashed as UTF-8 LF. It never runs domain SQL and never touches
// the schema. A filename that does not match the canonical file aborts instead of
// silently masking an edited migration.
export async function reconcileMigrationChecksums({ pool = getPool(), dryRun = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["carnavales2027_v2_migrations"]);
    const { rows: [table] } = await client.query("SELECT to_regclass('public.schema_migrations') AS name");
    if (!table.name) {
      await client.query("COMMIT");
      return { updated: [], checked: 0 };
    }
    await client.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");

    const migrations = await loadMigrations();
    const { rows } = await client.query("SELECT version, filename, checksum FROM schema_migrations");
    const appliedByVersion = new Map(rows.map((row) => [row.version, row]));
    const updated = [];

    for (const migration of migrations) {
      const applied = appliedByVersion.get(migration.version);
      if (!applied) continue;
      if (applied.filename !== migration.filename) {
        throw new Error(`MIGRATION_FILENAME_MISMATCH: version ${migration.version} has ${applied.filename}, expected ${migration.filename}`);
      }
      if (applied.checksum === migration.checksum) continue;
      updated.push({ version: migration.version, filename: migration.filename, from: applied.checksum, to: migration.checksum });
      if (!dryRun) {
        await client.query("UPDATE schema_migrations SET checksum = $1 WHERE version = $2 AND filename = $3", [migration.checksum, migration.version, migration.filename]);
      }
    }

    if (dryRun) await client.query("ROLLBACK");
    else await client.query("COMMIT");
    return { updated, checked: migrations.length };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes("--dry-run");
  try {
    const result = await reconcileMigrationChecksums({ dryRun });
    for (const item of result.updated) {
      console.log(`${dryRun ? "[dry-run] " : ""}reconcile ${item.filename}: ${item.from} -> ${item.to}`);
    }
    console.log(result.updated.length
      ? `${dryRun ? "Would reconcile" : "Reconciled"} ${result.updated.length} checksum(s)`
      : "No checksum reconciliation needed");
  } catch (error) {
    console.error("Checksum reconciliation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
