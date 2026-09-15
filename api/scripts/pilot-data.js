import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

export async function readDatabaseEnvironment(file) {
  const env = dotenv.parse(await readFile(file));
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL missing in selected file");
  return env;
}
async function fingerprint(connectionString) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000, options: "-c timezone=UTC" });
  try {
    await client.connect(); await client.query("BEGIN READ ONLY");
    const { rows: tables } = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    const result = {};
    for (const { tablename } of tables) {
      const quoted = '"' + tablename.replaceAll('"', '""') + '"';
      const { rows } = await client.query(`SELECT count(*) AS count, md5(coalesce(string_agg(md5(row_to_json(t)::text), '' ORDER BY md5(row_to_json(t)::text)), '')) AS fingerprint FROM public.${quoted} t`);
      result[tablename] = rows[0];
    }
    await client.query("ROLLBACK"); return result;
  } finally { await client.end(); }
}
function runPg(program, args, connectionString) {
  const db = new URL(connectionString);
  const bin = process.env.PG_BIN;
  const executable = bin ? path.join(bin, program + (process.platform === "win32" ? ".exe" : "")) : program;
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PGHOST: db.hostname, PGPORT: db.port || "5432", PGDATABASE: decodeURIComponent(db.pathname.slice(1)),
        PGUSER: decodeURIComponent(db.username), PGPASSWORD: decodeURIComponent(db.password),
        PGSSLMODE: db.searchParams.get("sslmode") || "prefer", PGCONNECT_TIMEOUT: "10" },
    });
    // Don't print tool output: it can contain credentials or data.
    child.stdout.resume(); child.stderr.resume();
    child.on("error", () => reject(new Error(program + " could not start; configure PG_BIN")));
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(program + " failed (exit " + code + "); source/destination preserved")));
  });
}
export async function backupDatabase(connectionString, destination) {
  const file = path.resolve(destination);
  await mkdir(path.dirname(file), { recursive: true });
  // Snapshot itself is consistent; stop application writes to compare fingerprints at cutover.
  const before = await fingerprint(connectionString);
  await runPg("pg_dump", ["--format=custom", "--compress=6", "--no-owner", "--no-acl", "--file=" + file], connectionString);
  const hash = createHash("sha256").update(await readFile(file)).digest("hex");
  const after = await fingerprint(connectionString);
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("SOURCE_CHANGED_DURING_BACKUP: pause writes and retry");
  await writeFile(file + ".sha256", hash + "\n");
  await writeFile(file + ".inventory.json", JSON.stringify(after, null, 2) + "\n");
  return { file, tables: Object.keys(after).length, sha256: hash };
}
export async function restoreDatabase(connectionString, source) {
  const file = path.resolve(source);
  const expected = (await readFile(file + ".sha256", "utf8")).trim();
  const actual = createHash("sha256").update(await readFile(file)).digest("hex");
  if (expected !== actual) throw new Error("BACKUP_CHECKSUM_MISMATCH");
  const expectedInventory = JSON.parse(await readFile(file + ".inventory.json", "utf8"));
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    const { rows } = await client.query("SELECT count(*) AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%' AND c.relkind IN ('r','p','v','m','S','f')");
    if (Number(rows[0].count)) throw new Error("RESTORE_REQUIRES_EMPTY_DATABASE");
  } finally { await client.end(); }
  await runPg("pg_restore", ["--single-transaction", "--exit-on-error", "--no-owner", "--no-acl", "--dbname=" + decodeURIComponent(new URL(connectionString).pathname.slice(1)), file], connectionString);
  const restored = await fingerprint(connectionString);
  if (JSON.stringify(restored) !== JSON.stringify(expectedInventory)) throw new Error("RESTORE_INVENTORY_MISMATCH");
  return { tables: Object.keys(restored).length, sha256: actual, verified: true };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [operation, envFile, dumpFile] = process.argv.slice(2);
    if (!["backup", "restore"].includes(operation) || !envFile || !dumpFile) throw new Error("Usage: node scripts/pilot-data.js backup|restore <env-file> <dump-file>");
    const env = await readDatabaseEnvironment(envFile);
    const result = operation === "backup" ? await backupDatabase(env.DATABASE_URL, dumpFile) : await restoreDatabase(env.DATABASE_URL, dumpFile);
    console.log(JSON.stringify(result));
  } catch (error) {
    // Only our fixed diagnostics are printed. No connection strings or database payloads.
    console.error("PILOT_DATA_FAILED", ["SOURCE_CHANGED_DURING_BACKUP: pause writes and retry", "BACKUP_CHECKSUM_MISMATCH", "RESTORE_REQUIRES_EMPTY_DATABASE", "RESTORE_INVENTORY_MISMATCH"].includes(error.message) ? error.message : "Check selected files, PG_BIN, credentials and empty destination.");
    process.exitCode = 1;
  }
}
