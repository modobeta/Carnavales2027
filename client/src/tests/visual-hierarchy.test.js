import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path) => readFileSync(resolve(__dirname, path), "utf8").replace(/\r\n/g, "\n");

describe("visual hierarchy system", () => {
  const tokens = source("../styles/tokens.css");
  const index = source("../index.css");
  const components = source("../styles/components.css");

  it("uses restrained Carnaval surfaces and keeps turquoise as an accent, not a modal canvas", () => {
    expect(tokens).toContain("--palette-page: #24102b;");
    expect(tokens).toContain("--palette-card: #351744;");
    expect(tokens).toContain("--palette-panel: #452252;");
    expect(tokens).toContain("--surface-modal: var(--palette-card);");
    expect(tokens).toContain("--text-on-modal: #ffffff;");
  });

  it("removes decorative page texture and heavy elevation from the shared shell", () => {
    expect(index).not.toContain("radial-gradient(circle, rgba(255, 255, 255, 0.14)");
    expect(index).not.toContain("radial-gradient(circle at 92% -10%");
    expect(index).toContain("background: var(--surface-base);");
    expect(index).toContain("box-shadow: none;");
  });

  it("keeps dialogs readable on a quiet surface and supports reduced transparency", () => {
    expect(components).toContain("background: var(--surface-modal);");
    expect(components).toContain("color: var(--text-on-modal);");
    expect(tokens).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(components).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(components).toContain("backdrop-filter: none;");
  });

  it("reduces Jurado ballot noise only on desktop and keeps voting context prominent", () => {
    const desktopRefinement = index.split("/* Jurado desktop refinement — planilla prioritaria */")[1] ?? "";

    expect(desktopRefinement).toContain("@media (min-width: 80rem)");
    expect(desktopRefinement).toContain(".ballot-layout { grid-template-columns: minmax(15rem, 0.82fr) minmax(0, 1.8fr);");
    expect(desktopRefinement).toContain(".ballot-progress {\n    display: grid;");
    expect(desktopRefinement).toContain(".ballot-footer {\n    position: sticky;");
    expect(desktopRefinement).toContain(".troupe-absent-btn {");
    expect(desktopRefinement).toContain("background: transparent;");
  });
});
