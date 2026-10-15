import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { matchesAppliedChecksum } from "../migrate.js";

const filename = "084_legacy_nomination_scope.sql";
const historicalChecksum = "a53d6aa87ccf55921d39eb23b01c3ef52227e93d1ced41add88c6018dd103c7e";
const hash = (content) => createHash("sha256").update(content).digest("hex");

test("accepts only the verified historical 084 line-ending checksum", async () => {
  const content = await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8");
  const migration = { filename, content, checksum: hash(content) };
  const lines = content.replace(/\r\n/g, "\n").trimEnd().split("\n");
  const historicalBytes = lines.map((line, index) => (
    `${line}${index < 32 || (index >= 78 && index <= 82) ? "\n" : "\r\n"}`
  )).join("");

  assert.equal(hash(historicalBytes), historicalChecksum);
  assert.equal(matchesAppliedChecksum(migration, historicalChecksum), true);
  assert.equal(matchesAppliedChecksum(migration, migration.checksum), true);
  assert.equal(matchesAppliedChecksum(migration, "unknown"), false);
  assert.equal(matchesAppliedChecksum({ ...migration, filename: "085_other.sql" }, historicalChecksum), false);

  const modified = `${content}\n-- unexpected change`;
  assert.equal(matchesAppliedChecksum({ ...migration, content: modified, checksum: hash(modified) }, historicalChecksum), false);
});
