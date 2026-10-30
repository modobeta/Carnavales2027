# Design system — Carnavales 2027

Derived only from `client/src/styles/tokens.css` (read 2026-10-24). These are existing project values, not a proposed replacement.

## Color
- Brand action pink `--palette-pink: #E91683`; hover/deep `--palette-pink-deep: #C70F6F`; use as identity/action accents, with dark text `--text-on-primary: #000000`.
- Navigation/secondary blue `--palette-blue: #3F51B5`; secondary button ink is white.
- Success olive `--palette-green: #8BC34A`; semantic success text `#33691E`.
- Warning amber `--palette-amber: #FFC107`; text `#7A4F00`.
- Danger coral `--palette-red: #FF5252`; semantic text `#B71C1C`.
- Light surfaces: page `#FFFFFF`, alternate `#F8FAFC`, card `#FFF5FA`, panel `#F8FAFC`, raised `#FFFFFF`, sunken `#E2E8F0`; primary text `#111827`, secondary `#334155`, muted `#475569`.
- Dark theme exists: black page `#000000`, card `#14000A`, panel `#1A1A1A`, primary text `#FFFFFF`, secondary `#E5E5E5`, muted `#B3B3B3`. Official brand HEX values remain unchanged.

## Typography
- Sans: `"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`.
- Mono: system monospace stack from `--font-mono`.
- Size scale: 12, 14, 16, 18, 20, 24, 30, 36 px (`--text-xs` through `--text-4xl`). Line heights 1.25, 1.5, 1.625.

## Spacing, radius, elevation
- Spacing follows 4px base: 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64 px.
- Radii: 2, 4, 8, 12, 16, 24 px; pill 9999px.
- Minimum touch target 48px; large 56px.
- Shadows: subtle 0 1px 2px / 0.06, card 0 1px 3px / 0.08, medium 0 4px 12px / 0.1, large 0 12px 32px / 0.16. Focus ring is 3px blue with 0.85 opacity (dark theme uses 3px amber).

## Component rules
- Use semantic state colors and pair color with text/icon, never color alone.
- Primary action uses pink fill with black ink; secondary uses blue fill with white ink; destructive controls are clearly labeled and confirmed.
- Inputs and cards use pale neutral surfaces and visible borders. Focus remains prominent.
- Respect `prefers-reduced-motion`; target sizes are at least 48px.
- Source: `client/src/styles/tokens.css` (palette, theme, typography, spacing, radius, shadows, motion, contrast preferences, and layers).
