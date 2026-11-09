import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientRoot = resolve(__dirname, "../..");
const publicRoot = join(clientRoot, "public");
const assetRoot = join(publicRoot, "assets");
const imageExtensions = new Set([".avif", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);

function imageFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return imageFiles(path);
    return imageExtensions.has(extname(entry.name).toLowerCase()) ? [path] : [];
  });
}

describe("organización de recursos gráficos públicos", () => {
  it("conserva el catálogo normalizado de logos de comparsas", () => {
    const troupeLogos = readdirSync(join(assetRoot, "troupes"), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .sort();

    expect(troupeLogos).toEqual([
      "arami.png",
      "aymara.png",
      "itavera.png",
      "oh-bahia.png",
      "poramba.png",
      "tropical.png",
    ]);
  });

  it("no deja imágenes sueltas en la raíz del cliente ni fuera de public/assets", () => {
    const looseClientImages = readdirSync(clientRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile() && imageExtensions.has(extname(entry.name).toLowerCase()))
      .map((entry) => entry.name);
    const imagesOutsideAssets = imageFiles(publicRoot)
      .filter((path) => !path.startsWith(`${assetRoot}\\`) && !path.startsWith(`${assetRoot}/`))
      .map((path) => relative(publicRoot, path));

    expect(looseClientImages).toEqual([]);
    expect(imagesOutsideAssets).toEqual([]);
  });

  it("no conserva archivos gráficos duplicados por contenido", () => {
    const filesByHash = new Map();

    for (const path of imageFiles(assetRoot)) {
      const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
      const paths = filesByHash.get(hash) ?? [];
      paths.push(relative(assetRoot, path));
      filesByHash.set(hash, paths);
    }

    const duplicates = [...filesByHash.values()].filter((paths) => paths.length > 1);
    expect(duplicates).toEqual([]);
  });
});
