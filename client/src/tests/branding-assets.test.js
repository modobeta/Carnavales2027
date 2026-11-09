import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicFile = (path) => readFileSync(resolve(__dirname, "../../public", path));

describe("identidad del inicio de sesión", () => {
  it("sirve el logotipo del inicio de sesión en formato WebP", () => {
    const logo = publicFile("assets/branding/logotipo.webp");
    expect(logo.toString("ascii", 0, 4)).toBe("RIFF");
    expect(logo.toString("ascii", 8, 12)).toBe("WEBP");
  });

  it("usa el isotipo como favicon WebP de la pestaña", () => {
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    const favicon = publicFile("assets/branding/isotipo.webp");
    expect(html).toMatch(/<link rel="icon" type="image\/webp" href="\/assets\/branding\/isotipo\.webp" \/>/);
    expect(favicon.toString("ascii", 0, 4)).toBe("RIFF");
    expect(favicon.toString("ascii", 8, 12)).toBe("WEBP");
  });

  it("usa una textura WebP de plumas en la columna de marca del login", () => {
    const css = readFileSync(resolve(__dirname, "../index.css"), "utf8");
    const texture = publicFile("assets/decorations/feathers/textura-plumas.webp");
    expect(css).toContain('url("/assets/decorations/feathers/textura-plumas.webp")');
    expect(css).not.toContain("Confeti.svg");
    expect(texture.toString("ascii", 0, 4)).toBe("RIFF");
    expect(texture.toString("ascii", 8, 12)).toBe("WEBP");
  });
});
