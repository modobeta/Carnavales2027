import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

describe("Especificación PWA y Metadatos Accesibles (Spec 020 / RF-181)", () => {
  const manifestPath = resolve(__dirname, "../../public/manifest.webmanifest");
  const htmlPath = resolve(__dirname, "../../index.html");

  it("el manifest existe y tiene estructura JSON válida", () => {
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest.name).toBe("Carnavales 2027");
    expect(manifest.start_url).toBe("/#/login");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#E91683");
    expect(manifest.background_color).toBe("#FFFFFF");
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  it("los iconos referenciados en el manifest existen físicamente", () => {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    for (const icon of manifest.icons) {
      const iconFile = resolve(__dirname, "../../public", icon.src.replace(/^\//, ""));
      expect(existsSync(iconFile)).toBe(true);
    }
  });

  it("index.html incluye meta theme-color blanco y enlace al manifest", () => {
    const html = readFileSync(htmlPath, "utf8");
    expect(html).toContain('<meta name="theme-color" content="#FFFFFF" />');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(html).toContain('localStorage.getItem("carnavales.theme")');
  });

  it("index.html incluye skip-link accesible hacia #main-content", () => {
    const html = readFileSync(htmlPath, "utf8");
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('class="skip-link"');
  });
});
