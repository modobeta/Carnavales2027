import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionContext } from "../auth/session-context.jsx";
import { LoadingOverlay } from "../components/LoadingOverlay.jsx";
import { LoadingScreen } from "../components/LoadingScreen.jsx";
import { SessionGate } from "../components/SessionGate.jsx";
import { SkeletonLoader } from "../components/SkeletonLoader.jsx";
import { TransitionWrapper } from "../components/TransitionWrapper.jsx";
import { prefersReducedMotion } from "../motion/useReducedMotion.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (typeof window !== "undefined") delete window.matchMedia;
});

describe("Sistema de carga y movimiento", () => {
  it("muestra una pantalla de espera accesible con su detalle", () => {
    render(<LoadingScreen label="Preparando el portal" detail="Verificando tu sesión…" />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Preparando el portal");
    expect(status).toHaveTextContent("Verificando tu sesión…");
    expect(status.querySelector(".loading-orbit")).toHaveAttribute("aria-hidden", "true");
  });

  it("no renderiza el overlay inactivo y sí muestra el estado de la operación activa", () => {
    const { rerender } = render(<LoadingOverlay active={false} label="Guardando" />);
    expect(screen.queryByText("Guardando")).not.toBeInTheDocument();

    rerender(<LoadingOverlay active inline label="Guardando decisión…" detail="Esperando respuesta." />);
    const status = screen.getByRole("status");
    expect(status).toHaveClass("is-inline");
    expect(status).toHaveTextContent("Guardando decisión…");
    expect(status).toHaveTextContent("Esperando respuesta.");
  });

  it("conserva el texto de espera existente en los esqueletos", () => {
    const { container } = render(
      <SkeletonLoader variant="table" rows={2} label="Cargando padrón…" />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Cargando padrón…");
    expect(container.querySelectorAll(".skeleton-table-row")).toHaveLength(2);
    expect(container.querySelectorAll("[data-skeleton]").length).toBeGreaterThan(0);
  });

  it("envuelve el contenido de una ruta sin alterar sus hijos", () => {
    render(
      <TransitionWrapper motionKey="#/login">
        <main>Contenido de la ruta</main>
      </TransitionWrapper>,
    );

    expect(screen.getByText("Contenido de la ruta")).toBeInTheDocument();
    expect(document.querySelector(".motion-transition")).toBeInTheDocument();
  });

  it("SessionGate espera la sesión antes de renderizar la aplicación", () => {
    const { rerender } = render(
      <SessionContext.Provider value={{ status: "loading" }}>
        <SessionGate>
          <main>Portal listo</main>
        </SessionGate>
      </SessionContext.Provider>,
    );

    expect(screen.getByText("Preparando el portal")).toBeInTheDocument();
    expect(screen.queryByText("Portal listo")).not.toBeInTheDocument();

    rerender(
      <SessionContext.Provider value={{ status: "anonymous" }}>
        <SessionGate>
          <main>Portal listo</main>
        </SessionGate>
      </SessionContext.Provider>,
    );

    expect(screen.getByText("Portal listo")).toBeInTheDocument();
  });

  it("detecta movimiento reducido y deja el indicador sin animación JS", async () => {
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    expect(prefersReducedMotion()).toBe(true);

    const { container } = render(<LoadingScreen label="Cargando en modo reducido" />);
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(screen.getByText("Cargando en modo reducido")).toBeInTheDocument();
    expect(container.querySelector(".loading-orbit-ring").getAttribute("style")).toBeNull();
  });
});
