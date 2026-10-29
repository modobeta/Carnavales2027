import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicFile = (path) => readFileSync(resolve(__dirname, "../../public", path));

describe("identidad del inicio de sesión", () => {
  it("sirve el logotipo del inicio de sesión en formato WebP", () => {
    const logo = publicFile("icons/logotipo.webp");
    expect(logo.toString("ascii", 0, 4)).toBe("RIFF");
    expect(logo.toString("ascii", 8, 12)).toBe("WEBP");
  });

  it("usa el isotipo como favicon WebP de la pestaña", () => {
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    const favicon = publicFile("icons/isotipo.webp");
    expect(html).toMatch(/<link rel="icon" type="image\/webp" href="\/icons\/isotipo\.webp" \/>/);
    expect(favicon.toString("ascii", 0, 4)).toBe("RIFF");
    expect(favicon.toString("ascii", 8, 12)).toBe("WEBP");
  });
});
