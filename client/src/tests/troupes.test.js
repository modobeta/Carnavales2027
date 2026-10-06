import { describe, expect, it } from "vitest";
import {
  TROUPE_LOGO_MAX_BYTES,
  troupeLogoUrl,
  validateTroupeLogoFile,
} from "../api/troupes.js";

function fileOf(type, size) {
  return { type, size };
}

describe("api/troupes — helpers de logo", () => {
  it("acepta PNG, JPG, WebP y SVG dentro del límite", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp", "image/svg+xml"]) {
      expect(validateTroupeLogoFile(fileOf(type, 1024))).toBeNull();
    }
  });

  it("rechaza tipos no permitidos", () => {
    expect(validateTroupeLogoFile(fileOf("text/plain", 10))).toMatch(/PNG, JPG, WebP o SVG/);
  });

  it("rechaza archivos que superan 1 MB", () => {
    expect(validateTroupeLogoFile(fileOf("image/png", TROUPE_LOGO_MAX_BYTES + 1))).toMatch(/1 MB/);
  });

  it("rechaza la ausencia de archivo", () => {
    expect(validateTroupeLogoFile(null)).toMatch(/Seleccioná/);
  });

  it("construye la URL del logo con y sin hash de versión", () => {
    expect(troupeLogoUrl("troupe-1")).toBe("/api/v1/troupes/troupe-1/logo");
    expect(troupeLogoUrl("troupe-1", "abc123")).toBe("/api/v1/troupes/troupe-1/logo?v=abc123");
  });
});
