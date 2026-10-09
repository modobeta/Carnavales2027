import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "../db/pool.js";

const renames = [
  ["084", "085", "event_open_operation_evidence"],
  ["085", "086", "event_open_operation_truncate_guard"],
  ["086", "087", "admin_event_assignments"],
];

// Explicit repair of migration metadata from the pre-merge deploy branch.
// SQL bodies and checksums remain byte-for-byte unchanged; no domain SQL runs.
export async function reconcileDeployMigrations({ pool = getPool() } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["carnavales2027_v2_migrations"]);
    const { rows: [table] } = await client.query("SELECT to_regclass('public.schema_migrations') AS name");
    if (!table.name) {
      await client.query("COMMIT");
      return { renamed: [] };
    }
    await client.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
    const { rows } = await client.query(
      "SELECT version, filename, checksum FROM schema_migrations WHERE version IN ('084', '085', '086', '087') ORDER BY version",
    );
    if (!rows.some((row) => row.filename === "084_event_open_operation_evidence.sql")) {
      // Fresh/main/canonical history needs no repair. Normal migrate validates it.
      await client.query("COMMIT");
      return { renamed: [] };
    }
    const expected = await Promise.all(renames.map(async ([oldVersion, version, name]) => {
      const filename = `${version}_${name}.sql`;
      const sql = await readFile(new URL(`../db/migrations/${filename}`, import.meta.url));
      return { oldVersion, version, filename, oldFilename: `${oldVersion}_${name}.sql`, checksum: createHash("sha256").update(sql).digest("hex") };
    }));
    // Only accept an exact prefix of the known branch history. Mixed histories,
    // occupied destinations and edited SQL abort before any metadata is changed.
    if (rows.length > expected.length || rows.some((row, index) => {
      const item = expected[index];
      return row.version !== item.oldVersion || row.filename !== item.oldFilename || row.checksum !== item.checksum;
    })) {
      throw new Error("DEPLOY_MIGRATION_HISTORY_MISMATCH: reconcile requires unchanged 084/085/086 deploy migrations");
    }
    for (const item of expected.slice(0, rows.length).reverse()) {
      const result = await client.query(
        "UPDATE schema_migrations SET version = $1, filename = $2 WHERE version = $3 AND filename = $4 AND checksum = $5",
        [item.version, item.filename, item.oldVersion, item.oldFilename, item.checksum],
      );
      if (result.rowCount !== 1) throw new Error("DEPLOY_MIGRATION_HISTORY_MISMATCH");
    }
    await client.query("COMMIT");
    return { renamed: expected.slice(0, rows.length).map(({ oldFilename, filename }) => ({ from: oldFilename, to: filename })) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await reconcileDeployMigrations();
    console.log(result.renamed.length ? `Reconciled: ${result.renamed.map(({ from, to }) => `${from} -> ${to}`).join(", ")}` : "No deploy migration metadata to reconcile");
  } catch (error) {
    console.error("Reconciliation failed:", error.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
