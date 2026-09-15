import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export async function buildServiceWorker(directory, templatePath) {
  const files = [];
  async function walk(relative = "") {
    for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) await walk(name);
      else if (name !== "sw.js" && !name.endsWith(".map")) files.push(name);
    }
  }
  await walk();
  files.sort();
  const template = await readFile(templatePath, "utf8");
  const hash = createHash("sha256").update(template);
  for (const name of files) hash.update(name).update(await readFile(path.join(directory, name)));
  const version = hash.digest("hex").slice(0, 20);
  const output = template.replace("__BUILD_ID__", version)
    .replace("/*__PRECACHE__*/[]", JSON.stringify(files.map((name) => "/" + name)));
  await writeFile(path.join(directory, "sw.js"), output);
  return version;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  await buildServiceWorker(path.join(root, "dist"), path.join(root, "public/sw.js"));
  console.log("Service worker versioned from production content.");
}
