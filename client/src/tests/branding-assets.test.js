import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const publicFile = (path) => readFileSync(resolve(__dirname, "../../public", path));

describe("identidad del inicio de sesión", () => {
  it("sirve el logo del inicio de sesión en formato WebP", () => {
    const logo = publicFile("icons/carnaval-logo.webp");
    expect(logo.toString("ascii", 0, 4)).toBe("RIFF");
    expect(logo.toString("ascii", 8, 12)).toBe("WEBP");
  });

  it("usa el nuevo emblema cuadrado como favicon PNG compatible", () => {
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    const favicon = publicFile("icons/carnaval-favicon.png");
    expect(html).toMatch(/<link rel="icon" type="image\/png" href="\/icons\/carnaval-favicon\.png" \/>/);
    expect(favicon.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  });
});
