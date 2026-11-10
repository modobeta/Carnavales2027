import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { matchesAppliedChecksum } from "../migrate.js";

const legacyRubricLogos = {
  filename: "083_rubric_icons_and_troupe_logos.sql",
  appliedChecksum: "c922e1f9b1fc8e035f8b478a8b4258b77771b92ff28b091ab4081fbb9e133650",
};

test("acepta el checksum CRLF histórico comprobado de 083 solo para el SQL canónico", async () => {
  const filename = new URL(`../migrations/${legacyRubricLogos.filename}`, import.meta.url);
  const content = await readFile(filename, "utf8");
  const crlfContent = content.replace(/\r?\n/g, "\r\n");
  const crlfChecksum = createHash("sha256").update(crlfContent).digest("hex");

  assert.equal(crlfChecksum, legacyRubricLogos.appliedChecksum);
  assert.equal(
    matchesAppliedChecksum({ filename: legacyRubricLogos.filename, content }, crlfChecksum),
    true,
  );
  assert.equal(
    matchesAppliedChecksum({ filename: "084_legacy_nomination_scope.sql", content }, crlfChecksum),
    false,
  );
  assert.equal(
    matchesAppliedChecksum({ filename: legacyRubricLogos.filename, content: `${content}\n` }, crlfChecksum),
    false,
  );
});
