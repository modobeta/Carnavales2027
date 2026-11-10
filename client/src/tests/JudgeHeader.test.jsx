import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JudgeHeader } from "../components/JudgeHeader.jsx";

const props = {
  session: { user: { name: "Gonzalo" }, roles: ["JUDGE"] },
  roles: ["Juez"],
  night: { name: "Noche 1", specialtyName: "Baile", ballotStatus: "OPEN" },
  nightDate: "07/11/2026",
};
const originalWindowWidth = window.innerWidth;

describe("JudgeHeader", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWindowWidth });
  });

  it("mantiene contexto e identidad discretos, sin avatar ni inventar estado de jornada", () => {
    render(<JudgeHeader {...props} />);
    expect(screen.getByLabelText("Jornada actual: Noche 1, 07/11/2026")).toBeInTheDocument();
    expect(screen.getByText("Baile")).toBeInTheDocument();
    expect(screen.getByText("Planilla abierta")).toBeInTheDocument();
    expect(document.querySelector(".session-avatar")).not.toBeInTheDocument();
    expect(document.querySelector(".judge-account summary")).toHaveTextContent("GonzaloJuez");
  });

  it("agrupa tema y salida y permite cerrar la cuenta con Escape", () => {
    const onSignOut = vi.fn();
    render(<JudgeHeader {...props} onSignOut={onSignOut} />);
    const account = document.querySelector("details");
    const summary = account.querySelector("summary");
    fireEvent.click(summary);
    expect(account.open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(summary, { key: "Escape" });
    expect(account.open).toBe(false);
    expect(summary).toHaveFocus();
  });

  it("actualiza conectividad sin consultas de red", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const fetchSpy = vi.spyOn(window, "fetch");
    render(<JudgeHeader {...props} />);
    expect(screen.getByRole("status")).toHaveTextContent("Con conexión");
    online.mockReturnValue(false);
    fireEvent(window, new Event("offline"));
    expect(screen.getByRole("status")).toHaveTextContent("Sin conexión");
    online.mockReturnValue(true);
    fireEvent(window, new Event("online"));
    expect(screen.getByRole("status")).toHaveTextContent("Con conexión");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ordena inicio con identidad, noche y evento en tres áreas y LED accesible", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<JudgeHeader {...props} home nightDate="sábado 07 noviembre" adminEvent={{ activeEvent: { name: "Carnavales 2027" }, events: [{ id: "e1", name: "Carnavales 2027" }], activeEventId: "e1" }} />);
    expect(document.querySelector(".judge-home-identity summary strong")).toHaveTextContent("Gonzalo");
    expect(document.querySelector(".judge-home-identity .judge-account-role")).toHaveTextContent("Juez");
    expect(document.querySelector(".judge-home-night")).toHaveTextContent("Noche 1sábado 07 noviembre");
    expect(document.querySelector(".judge-home-night .judge-header-night-meta")).not.toBeInTheDocument();
    expect(document.querySelector(".judge-home-event")).toHaveTextContent("Carnavales 2027");
    expect(document.querySelector(".judge-home-event .judge-header-night-meta")).toHaveTextContent("Baile·Planilla abierta");
    expect(document.querySelector(".judge-home-event .event-picker-chevron svg")).toHaveAttribute("width", "14");
    expect(document.querySelector(".judge-account-arrow svg")).toHaveAttribute("width", "14");
    const connection = screen.getByRole("status");
    expect(connection).toHaveAttribute("title", "Con conexión");
    expect(connection.querySelector(".judge-connection-led")).toBeInTheDocument();
    expect(connection.querySelector(".sr-only")).toHaveTextContent("Con conexión");
    online.mockReturnValue(false);
    fireEvent(window, new Event("offline"));
    expect(connection).toHaveClass("is-offline");
    expect(connection).toHaveAttribute("title", "Sin conexión");
  });

  it("mantiene el selector de evento dentro de la pantalla en celular", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getRect() {
      if (this.classList?.contains("event-picker-trigger")) {
        return { left: 300, right: 360, top: 40, bottom: 80, width: 60, height: 40 };
      }
      return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
    });

    render(<JudgeHeader
      {...props}
      home
      adminEvent={{
        activeEvent: { name: "Carnavales 2027" },
        events: [{ id: "e1", name: "Carnavales 2027" }, { id: "e2", name: "Carnaval - Goya 3031" }],
        activeEventId: "e1",
      }}
    />);

    fireEvent.click(document.querySelector(".event-picker-trigger"));
    const popover = screen.getByRole("dialog", { name: "Cambiar de evento" });
    expect(popover.style.position).toBe("fixed");
    expect(Number.parseFloat(popover.style.left)).toBeGreaterThanOrEqual(8);
    expect(Number.parseFloat(popover.style.left) + Number.parseFloat(popover.style.width)).toBeLessThanOrEqual(367);
  });
});
