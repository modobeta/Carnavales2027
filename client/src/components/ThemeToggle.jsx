import { useTheme } from "../context/ThemeContext.jsx";

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

/**
 * Control de tema claro/oscuro (STYLES.md §11).
 *
 * - `theme` es la preferencia: "system" (por defecto), "light" o "dark".
 * - El tema efectivo se resuelve con `prefers-color-scheme` cuando la
 *   preferencia es "system", de modo que la app sigue al dispositivo.
 * - `showSystemReset` permite volver a la adaptación automática.
 */
export function ThemeToggle({
  className = "",
  iconOnly = false,
  floating = false,
  showSystemReset = false,
}) {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const nextLabel = isDark ? "claro" : "oscuro";

  return (
    <div
      className={[
        "theme-toggle",
        iconOnly ? "theme-toggle--icon" : "",
        floating ? "theme-toggle--floating" : "",
        className,
      ].filter(Boolean).join(" ")}
    >
      <button
        type="button"
        className="theme-toggle__switch"
        onClick={toggleTheme}
        aria-pressed={isDark}
        aria-label={`Tema ${isDark ? "oscuro" : "claro"} activo. Cambiar a tema ${nextLabel}`}
        title={`Cambiar a tema ${nextLabel}`}
      >
        <span className="theme-toggle__icon" aria-hidden="true">
          {isDark ? <MoonIcon /> : <SunIcon />}
        </span>
        {!iconOnly && <span className="theme-toggle__label">{isDark ? "Oscuro" : "Claro"}</span>}
      </button>
      {showSystemReset && theme !== "system" && (
        <button
          type="button"
          className="theme-toggle__auto"
          onClick={() => setTheme("system")}
        >
          Usar tema del dispositivo
        </button>
      )}
    </div>
  );
}
