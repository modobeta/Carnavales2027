import "dotenv/config";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool, getPool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.join(__dirname, "migrations");
const migrationLockKey = "carnavales2027_v2_migrations";

function checksum(content) {
  return createHash("sha256").update(content).digest("hex");
}

// 084 was applied to the pilot from a file with mixed CRLF/LF endings before
// Git normalized it. Accept that exact historical byte checksum only while
// the SQL still matches the committed migration after newline normalization.
const legacyNominationScope = {
  filename: "084_legacy_nomination_scope.sql",
  canonicalChecksum: "0c6f8472f5abdc250aad40ddf155e69e020a3d9565e037eca2afcca25aede696",
  appliedChecksum: "a53d6aa87ccf55921d39eb23b01c3ef52227e93d1ced41add88c6018dd103c7e",
};

// 111 was already applied in the test database before its later guard was
// moved into 112. Accept that applied checksum only while the restored 111 SQL
// matches this known canonical content.
const frozenJuryAssignments = {
  filename: "111_freeze_jury_assignments_after_night_open.sql",
  canonicalChecksum: "aaaf79448d8f3ba02877e86360d5aa20d821f0c461b898c75bb223c8ac632510",
  appliedChecksum: "a7a9181c81cd2f55001f6b1b163f31eab464b73afa6592c094d8505e229f6ea5",
};

export function matchesAppliedChecksum(migration, appliedChecksum) {
  if (appliedChecksum === migration.checksum) return true;
  return migration.filename === legacyNominationScope.filename
    && appliedChecksum === legacyNominationScope.appliedChecksum
    && checksum(migration.content.replace(/\r\n/g, "\n")) === legacyNominationScope.canonicalChecksum
    || migration.filename === frozenJuryAssignments.filename
      && appliedChecksum === frozenJuryAssignments.appliedChecksum
      && migration.checksum === frozenJuryAssignments.canonicalChecksum;
}

async function loadMigrations() {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort();

  return Promise.all(filenames.map(async (filename) => {
    const content = await readFile(path.join(migrationsDirectory, filename), "utf8");
    const [version] = filename.split("_");

    return {
      filename,
      version,
      content,
      checksum: checksum(content),
    };
  }));
}

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function migrate() {
  const client = await getPool().connect();

  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [migrationLockKey]);
    await ensureMigrationTable(client);

    const migrations = await loadMigrations();
    const { rows: appliedRows } = await client.query(
      "SELECT version, checksum FROM schema_migrations",
    );
    const appliedByVersion = new Map(appliedRows.map((row) => [row.version, row]));
    const applied = [];

    for (const migration of migrations) {
      const existing = appliedByVersion.get(migration.version);

      if (existing) {
        if (!matchesAppliedChecksum(migration, existing.checksum)) {
          throw new Error(`MIGRATION_CHECKSUM_MISMATCH: ${migration.filename}`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migration.content);
        await client.query(
          `INSERT INTO schema_migrations (version, filename, checksum)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.filename, migration.checksum],
        );
        await client.query("COMMIT");
        applied.push(migration.filename);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    return { applied };
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext($1))", [migrationLockKey]);
    client.release();
  }
}

export async function getMigrationStatus() {
  const migrations = await loadMigrations();
  const client = await getPool().connect();

  try {
    const { rows: tableRows } = await client.query(
      "SELECT to_regclass('public.schema_migrations') AS table_name",
    );
    const appliedByVersion = new Map();

    if (tableRows[0].table_name) {
      const { rows } = await client.query("SELECT version, checksum FROM schema_migrations");
      for (const row of rows) {
        appliedByVersion.set(row.version, row);
      }
    }

    return migrations.map((migration) => {
      const applied = appliedByVersion.get(migration.version);

      if (applied && !matchesAppliedChecksum(migration, applied.checksum)) {
        throw new Error(`MIGRATION_CHECKSUM_MISMATCH: ${migration.filename}`);
      }

      return {
        filename: migration.filename,
        version: migration.version,
        applied: Boolean(applied),
      };
    });
  } finally {
    client.release();
  }
}

async function main() {
  try {
    if (process.argv.includes("--status")) {
      const status = await getMigrationStatus();
      for (const migration of status) {
        console.log(`${migration.applied ? "applied" : "pending"} ${migration.filename}`);
      }
      return;
    }

    const { applied } = await migrate();
    console.log(applied.length === 0 ? "No pending migrations" : `Applied: ${applied.join(", ")}`);
  } finally {
    await closePool();
  }
}

const isMainModule = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  });
}
