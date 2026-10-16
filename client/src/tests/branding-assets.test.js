import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicFile = (path) => readFileSync(resolve(__dirname, "../../public", path));

describe("identidad del inicio de sesión", () => {
  it("sirve el logo del inicio de sesión en formato WebP", () => {
    const logo = publicFile("icons/logo.webp");
    expect(logo.toString("ascii", 0, 4)).toBe("RIFF");
    expect(logo.toString("ascii", 8, 12)).toBe("WEBP");
  });

  it("usa el logo como favicon WebP de la pestaña", () => {
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    const favicon = publicFile("icons/logo.webp");
    expect(html).toMatch(/<link rel="icon" type="image\/webp" href="\/icons\/logo\.webp" \/>/);
    expect(favicon.toString("ascii", 0, 4)).toBe("RIFF");
    expect(favicon.toString("ascii", 8, 12)).toBe("WEBP");
  });
});
