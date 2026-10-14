import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path) => readFileSync(resolve(__dirname, path), "utf8").replace(/\r\n/g, "\n");

describe("visual hierarchy system", () => {
  const tokens = source("../styles/tokens.css");
  const index = source("../index.css");
  const components = source("../styles/components.css");
  const admin = source("../styles/admin.css");
  const competencia = source("../styles/competencia.css");

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

  it("gives dialog headers a clear title/close hierarchy and styles the night kind select", () => {
    const headerStyles = components.match(/\.app-dialog-header\s*\{[^}]*\}/)?.[0] ?? "";
    const titleStyles = components.match(/\.app-dialog-title\s*\{[^}]*\}/)?.[0] ?? "";
    const closeStyles = components.match(/\.app-dialog-close-btn\s*\{[^}]*\}/)?.[0] ?? "";
    const closeActiveStyles = components.match(/\.app-dialog-close-btn:active\s*\{[^}]*\}/)?.[0] ?? "";
    const selectStyles = components.match(/\.night-form__kind\s*\{[^}]*\}/)?.[0] ?? "";
    const selectFocusStyles = components.match(/\.night-form__kind:focus-visible\s*\{[^}]*\}/)?.[0] ?? "";
    const selectActiveStyles = components.match(/\.night-form__kind:active\s*\{[^}]*\}/)?.[0] ?? "";

    expect(headerStyles).toContain("align-items: center;");
    expect(headerStyles).toContain("position: sticky;");
    expect(headerStyles).toContain("inset-block-start: calc(-1 * var(--space-4));");
    expect(headerStyles).toContain("background: var(--surface-modal);");
    expect(headerStyles).toContain("border-block-end: 1px solid var(--border-subtle);");
    expect(titleStyles).toContain("line-height: var(--leading-tight);");
    expect(closeStyles).toContain("min-inline-size: var(--touch-target-min);");
    expect(closeActiveStyles).toContain("transform: scale(0.96);");
    expect(selectStyles).toContain("appearance: none;");
    expect(selectStyles).toContain("background-image:");
    expect(selectStyles).toContain("min-block-size: var(--touch-target-min);");
    expect(selectFocusStyles).toContain("box-shadow: var(--shadow-focus);");
    expect(selectActiveStyles).toContain("border-color: var(--modal-violet);");
  });

  it("starts dialogs as mobile bottom sheets and restores centered layout on wider screens", () => {
    const dialogStyles = components.match(/\.app-dialog\s*\{[^}]*\}/)?.[0] ?? "";
    const mobileFooterStyles = components.match(/\.dialog-footer-actions\s*\{[^}]*\}/)?.[0] ?? "";
    const desktopDialogStyles = components.match(/@media\s*\(min-width:\s*40rem\)[\s\S]*?\.app-dialog\s*\{[^}]*\}/)?.[0] ?? "";
    const desktopFooterStyles = components.match(/@media\s*\(min-width:\s*40rem\)[\s\S]*?\.dialog-footer-actions\s*\{[^}]*\}/)?.[0] ?? "";

    expect(dialogStyles).toContain("margin: auto 0 0;");
    expect(dialogStyles).toContain("inline-size: 100%;");
    expect(dialogStyles).toContain("max-block-size: min(90vh, 90dvh);");
    expect(mobileFooterStyles).toContain("flex-direction: column;");
    expect(desktopDialogStyles).toContain("margin: auto;");
    expect(desktopDialogStyles).toContain("max-inline-size: min(90vw, 34rem);");
    expect(desktopFooterStyles).toContain("flex-direction: row;");
  });

  it("keeps the troupe drawer actions visible while its fields scroll", () => {
    const stickyActions = admin.match(/\.entity-drawer \.dialog-footer-actions\s*\{[^}]*\}/)?.[0] ?? "";

    expect(stickyActions).toContain("position: sticky;");
    expect(stickyActions).toContain("inset-block-end: 0;");
    expect(stickyActions).toContain("background: var(--surface-modal);");
    expect(stickyActions).toContain("env(safe-area-inset-bottom");
  });

  it("gives the global event picker a stacked label, a custom chevron and press feedback", () => {
    const pickerStyles = admin.match(/\.global-event-picker\s*\{[^}]*\}/)?.[0] ?? "";
    const pickerDot = admin.match(/\.global-event-picker::before\s*\{[^}]*\}/)?.[0] ?? "";
    const pickerLabel = admin.match(/\.global-event-picker span\s*\{[^}]*\}/)?.[0] ?? "";
    const pickerSelect = admin.match(/\.global-event-picker select\s*\{[^}]*\}/)?.[0] ?? "";
    const pickerActive = admin.match(/\.global-event-picker:active\s*\{[^}]*\}/)?.[0] ?? "";
    const pickerFocus = admin.match(/\.global-event-picker:focus-within\s*\{[^}]*\}/)?.[0] ?? "";
    const reducedMotion = admin.match(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.global-event-picker:active\s*\{[^}]*\}/)?.[0] ?? "";

    expect(pickerStyles).toContain("display: inline-grid;");
    expect(pickerStyles).toContain("min-block-size: 2.75rem;");
    expect(pickerDot).toContain("background: var(--modal-violet);");
    expect(pickerLabel).toContain("grid-row: 1;");
    expect(pickerSelect).toContain("appearance: none;");
    expect(pickerSelect).toContain("background-image:");
    expect(pickerSelect).toContain("min-block-size: 0;");
    expect(pickerActive).toContain("transform: scale(0.98);");
    expect(pickerFocus).toContain("box-shadow: var(--shadow-focus);");
    expect(reducedMotion).toContain("transform: none;");
  });

  it("keeps event, profile and sign-out controls aligned in the navigation row", () => {
    const assignmentPicker = admin.match(/\.assignment-page \.event-picker\s*\{[^}]*\}/)?.[0] ?? "";
    const navActionLayout = admin.match(/@media \(min-width: 36\.01rem\)\s*\{[\s\S]*?\.app-navigation \.session-actions\s*\{[^}]*\}/)?.[0] ?? "";

    expect(assignmentPicker).toContain("min-inline-size: min(100%, 18rem);");
    expect(navActionLayout).toContain("flex-wrap: nowrap;");
    expect(navActionLayout).toContain("align-items: center;");
  });

  it("gives participant catalogs a responsive heading and filter toolbar", () => {
    const typesHeading = competencia.match(/\.participants-type-heading\s*\{[^}]*\}/)?.[0] ?? "";
    const troupeToolbar = competencia.match(/\.participants-troupes-block \.competencia-card-toolbar\s*\{[^}]*\}/)?.[0] ?? "";
    const mobileRefinement = competencia.match(/@media \(max-width: 40rem\)[\s\S]*?\.participants-troupes-block \.competencia-card-toolbar[\s\S]*?\}/)?.[0] ?? "";

    expect(typesHeading).toContain("display: flex;");
    expect(typesHeading).toContain("justify-content: space-between;");
    expect(troupeToolbar).toContain("display: grid;");
    expect(mobileRefinement).toContain("grid-template-columns: 1fr;");
  });

  it("presents the person roster as compact rows with aligned status and actions", () => {
    const rowCard = admin.match(/\.roster-page \.judge-card\s*\{[^}]*\}/)?.[0] ?? "";
    const heading = admin.match(/\.roster-page \.judge-card-heading\s*\{[^}]*\}/)?.[0] ?? "";
    const meta = admin.match(/\.roster-page \.invitation-state\s*\{[^}]*\}/)?.[0] ?? "";
    const actions = admin.match(/\.roster-page \.judge-actions\s*\{[^}]*\}/)?.[0] ?? "";
    const narrowGrid = admin.match(/@container \(min-width: 38rem\) and \(max-width: 52\.99rem\)[\s\S]*?grid-template-columns: 1fr;/)?.[0] ?? "";

    expect(rowCard).toContain("grid-template-columns: minmax(0, 1fr) auto;");
    expect(rowCard).toContain("background: var(--card-bg);");
    expect(heading).toContain("grid-column: 1 / -1;");
    expect(meta).toContain("grid-column: 1;");
    expect(meta).toContain("margin: 0 !important;");
    expect(actions).toContain("grid-column: 2;");
    expect(actions).toContain("justify-content: flex-end;");
    expect(narrowGrid).toContain("grid-template-columns: 1fr;");
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
