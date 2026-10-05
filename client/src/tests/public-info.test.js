import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(resolve(__dirname, "../..", path), "utf8");
const parse = (html) => new DOMParser().parseFromString(html, "text/html");

describe("Información pública y acreditación del sitio", () => {
  it("mantiene la misma etiqueta pública de propiedad en raíz y presentación", () => {
    const root = parse(read("index.html"));
    const about = parse(read("public/acerca.html"));
    const selector = 'head meta[name="google-site-verification"]';
    expect(root.querySelector(selector)?.content).toBeTruthy();
    expect(about.querySelector(selector)?.content).toBe(root.querySelector(selector)?.content);
  });

  it("presenta propósito, uso de Gmail y privacidad sin scripts ni autenticación", () => {
    const about = parse(read("public/acerca.html"));
    expect(about.body.textContent).toContain("correos transaccionales");
    expect(about.body.textContent).toContain("no lee mensajes ni contactos de Gmail");
    expect(about.querySelector('a[href="/privacidad.html"]')).not.toBeNull();
    for (const path of ["public/acerca.html", "public/privacidad.html"]) {
      const doc = parse(read(path));
      expect(doc.querySelector("script")).toBeNull();
      expect(doc.querySelector("main h1")).not.toBeNull();
      expect(doc.querySelector('a[href="/#/login"]')).not.toBeNull();
    }
  });
});
