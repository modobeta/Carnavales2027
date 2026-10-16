import assert from "node:assert/strict";
import test from "node:test";
import { prepareDemoSeedTest } from "./demo-seed-test-environment.js";
import { migrate } from "../migrate.js";
import { reconcileMigrationChecksums } from "../../scripts/reconcile-migration-checksums.js";

const target = "001_extensions.sql";

test("reconciles drifted checksums without running domain SQL", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { pool } = await prepareDemoSeedTest(t);
  await migrate();

  const { rows: [canonical] } = await pool.query(
    "SELECT checksum FROM schema_migrations WHERE filename = $1",
    [target],
  );
  const snapshot = async () => (await pool.query("SELECT * FROM schema_migrations ORDER BY version")).rows;

  assert.deepEqual(await reconcileMigrationChecksums({ pool }), { updated: [], checked: (await snapshot()).length });

  await pool.query("UPDATE schema_migrations SET checksum = 'drifted' WHERE filename = $1", [target]);
  const drifted = await snapshot();

  const dryRun = await reconcileMigrationChecksums({ pool, dryRun: true });
  assert.deepEqual(dryRun.updated.map(({ filename, from, to }) => ({ filename, from, to })),
    [{ filename: target, from: "drifted", to: canonical.checksum }]);
  assert.deepEqual(await snapshot(), drifted);

  const result = await reconcileMigrationChecksums({ pool });
  assert.deepEqual(result.updated.map(({ filename }) => filename), [target]);
  const { rows: [restored] } = await pool.query("SELECT checksum FROM schema_migrations WHERE filename = $1", [target]);
  assert.equal(restored.checksum, canonical.checksum);

  assert.deepEqual(await reconcileMigrationChecksums({ pool }), { updated: [], checked: (await snapshot()).length });

  await pool.query("UPDATE schema_migrations SET filename = '001_unexpected.sql' WHERE filename = $1", [target]);
  const beforeFailure = await snapshot();
  await assert.rejects(reconcileMigrationChecksums({ pool }), /MIGRATION_FILENAME_MISMATCH/);
  assert.deepEqual(await snapshot(), beforeFailure);
});

test("returns an empty result when schema_migrations is absent", {
  skip: !process.env.TEST_DATABASE_URL,
}, async (t) => {
  const { pool } = await prepareDemoSeedTest(t);

  assert.deepEqual(await reconcileMigrationChecksums({ pool }), { updated: [], checked: 0 });
});
