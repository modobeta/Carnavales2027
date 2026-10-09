import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { prepareDemoSeedTest } from "./demo-seed-test-environment.js";
import { getMigrationStatus, migrate } from "../migrate.js";
import { reconcileDeployMigrations } from "../../scripts/reconcile-deploy-migrations.js";

for (const lastVersion of [85, 86, 87]) {
  test(`reconciles applied deploy history through ${lastVersion} without rerunning SQL`, { skip: !process.env.TEST_DATABASE_URL }, async (t) => {
    const { pool } = await prepareDemoSeedTest(t);
    assert.deepEqual(await reconcileDeployMigrations({ pool }), { renamed: [] });
    const directory = new URL("../migrations/", import.meta.url);
    const files = (await readdir(directory)).filter((name) => /^\d+_.+\.sql$/.test(name)).sort();
    await pool.query("CREATE TABLE schema_migrations(version TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    for (const filename of files.filter((name) => name !== "084_legacy_nomination_scope.sql" && Number(name.split("_")[0]) <= lastVersion)) {
      const sql = await readFile(new URL(filename, directory));
      await pool.query(sql.toString());
      const version = filename.slice(0, 3);
      const oldVersion = Number(version) >= 85 ? String(Number(version) - 1).padStart(3, "0") : version;
      await pool.query("INSERT INTO schema_migrations(version, filename, checksum) VALUES($1,$2,$3)", [oldVersion, oldVersion + filename.slice(3), createHash("sha256").update(sql).digest("hex")]);
    }
    const snapshot = async () => (await pool.query("SELECT * FROM schema_migrations ORDER BY filename")).rows;
    const before = await snapshot();
    const { rows: [old] } = await pool.query("SELECT checksum FROM schema_migrations WHERE version='084'");
    await pool.query("UPDATE schema_migrations SET checksum='changed' WHERE version='084'");
    const invalid = await snapshot();
    await assert.rejects(reconcileDeployMigrations({ pool }), /DEPLOY_MIGRATION_HISTORY_MISMATCH/);
    assert.deepEqual(await snapshot(), invalid);
    await pool.query("UPDATE schema_migrations SET checksum=$1 WHERE version='084'", [old.checksum]);
    await pool.query("INSERT INTO schema_migrations(version,filename,checksum) VALUES('087','087_unrelated.sql','unrelated')");
    const mixed = await snapshot();
    await assert.rejects(reconcileDeployMigrations({ pool }), /DEPLOY_MIGRATION_HISTORY_MISMATCH/);
    assert.deepEqual(await snapshot(), mixed);
    await pool.query("DELETE FROM schema_migrations WHERE version='087'");
    const result = await reconcileDeployMigrations({ pool });
    assert.equal(result.renamed.length, lastVersion - 84);
    const after = await snapshot();
    assert.deepEqual(after, before.map((row) => Number(row.version) < 84 ? row : {
      ...row,
      version: String(Number(row.version) + 1).padStart(3, "0"),
      filename: String(Number(row.version) + 1).padStart(3, "0") + row.filename.slice(3),
    }));
    assert.deepEqual(await reconcileDeployMigrations({ pool }), { renamed: [] });
    const status = await getMigrationStatus();
    assert.deepEqual(status.filter(({ applied }) => !applied).map(({ filename }) => filename), files.filter((name) => name === "084_legacy_nomination_scope.sql" || Number(name.slice(0, 3)) > lastVersion));
    assert.deepEqual((await migrate()).applied, status.filter(({ applied }) => !applied).map(({ filename }) => filename));
    assert.deepEqual((await migrate()).applied, []);
  });
}
