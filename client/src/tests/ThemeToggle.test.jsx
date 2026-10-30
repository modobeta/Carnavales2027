import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../context/ThemeContext.jsx";
import { ThemeToggle } from "../components/ThemeToggle.jsx";

function mockSystemTheme(dark) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: query === "(prefers-color-scheme: dark)" ? dark : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function renderToggle(props = {}) {
  return render(
    <ThemeProvider>
      <ThemeToggle {...props} />
    </ThemeProvider>,
  );
}

describe("ThemeToggle", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("adopta el tema oscuro del dispositivo cuando la preferencia es automática", async () => {
    mockSystemTheme(true);
    renderToggle();

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });

    const button = screen.getByRole("button", { name: /tema oscuro activo/i });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("alterna entre claro y oscuro, y conserva la preferencia", async () => {
    mockSystemTheme(true);
    renderToggle();

    const button = await screen.findByRole("button", { name: /tema oscuro activo/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
    expect(window.localStorage.getItem("carnavales.theme")).toBe("light");
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    });
    expect(window.localStorage.getItem("carnavales.theme")).toBe("dark");
  });

  it("permite volver a la adaptación automática del dispositivo", async () => {
    mockSystemTheme(false);
    renderToggle({ showSystemReset: true });

    const toggle = await screen.findByRole("button", { name: /tema claro activo/i });
    fireEvent.click(toggle);
    expect(screen.queryByRole("button", { name: /tema del dispositivo/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /tema del dispositivo/i }));

    await waitFor(() => {
      expect(window.localStorage.getItem("carnavales.theme")).toBe("system");
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
    expect(screen.queryByRole("button", { name: /tema del dispositivo/i })).not.toBeInTheDocument();
  });

  it("respeta el tema claro del dispositivo por defecto", async () => {
    mockSystemTheme(false);
    renderToggle();

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    });
    expect(screen.getByRole("button", { name: /tema claro activo/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
