import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { findBrokenRelativeLinks } from "./check-doc-links.mjs";

const document = path.resolve("docs/guide.md");
const readme = path.resolve("README.md");
const fileExists = (candidate) => candidate === readme;

test("acepta enlaces relativos, fragmentos, URLs externas y referencias válidas", () => {
  const markdown = [
    "[inicio](../README.md#inicio)",
    "![logo](../README.md)",
    "[sitio](https://example.com)",
    "[sección](#titulo)",
    "[guía][ref]",
    "[ref]: ../README.md",
  ].join("\n");
  assert.deepEqual(findBrokenRelativeLinks(markdown, document, fileExists), []);
});

test("señala ruta y línea de un enlace faltante", () => {
  assert.deepEqual(
    findBrokenRelativeLinks("Texto\n[perdido](../falta.md)", document, fileExists),
    [{ line: 2, target: "../falta.md" }],
  );
});

test("ignora ejemplos dentro de bloques y código en línea", () => {
  const markdown = [
    "`[ejemplo](../falta.md)`",
    "```md",
    "[ejemplo](../falta.md)",
    "```",
    "[real](../README.md)",
  ].join("\n");
  assert.deepEqual(findBrokenRelativeLinks(markdown, document, fileExists), []);
});
