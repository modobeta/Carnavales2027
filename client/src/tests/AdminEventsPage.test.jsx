import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminEventsPage } from "../pages/AdminEventsPage.jsx";
import { AdminEventProvider } from "../context/AdminEventContext.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

describe("AdminEventsPage", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("renderiza bajo la capa de instrumento data-layer='instrument' (RF-177)", async () => {
    apiRequest.mockResolvedValueOnce([]);
    const { container } = render(<AdminEventsPage />);
    expect(container.querySelector("main.container")).toHaveAttribute("data-layer", "instrument");
  });

  it("espera las noches antes de habilitar la configuracion", async () => {
    const pending = [];
    apiRequest
      .mockResolvedValueOnce([{ id: "e1", name: "Goya", status: "CONFIGURING" }])
      .mockImplementation(() => new Promise((resolve) => pending.push(resolve)));

    render(<AdminEventsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Usar este evento" }));

    expect(await screen.findByText("Cargando configuracion...")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Jornadas" })).not.toBeInTheDocument();

    pending.forEach((resolve) => resolve([]));
    expect(await screen.findByRole("heading", { name: "Jornadas" })).toBeInTheDocument();
  });

  it("muestra error cuando las noches no pueden cargarse", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/events") return Promise.resolve([{ id: "e1", name: "Goya", status: "CONFIGURING" }]);
      if (path === "/api/v1/users" || path === "/api/v1/judges") return Promise.resolve([]);
      if (path === "/api/v1/events/e1/nights") {
        return Promise.reject(new Error("network"));
      }
      return Promise.resolve([]);
    });

    render(<AdminEventsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Usar este evento" }));
    expect(await screen.findByRole("heading", { name: "No se pudo cargar la configuracion" })).toBeInTheDocument();
  });

  it("muestra directamente la configuración de jornadas cuando hay un evento activo en el contexto", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/events") return Promise.resolve([
        { id: "e1", name: "Carnaval 2027", status: "CONFIGURING" },
      ]);
      if (path === "/api/v1/events/e1/nights") return Promise.resolve([{ id: "n1", name: "Noche 1", kind: "COMPETITION" }]);
      if (path.endsWith("/troupes") || path.endsWith("/rubrics") || path.endsWith("/judges")) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    render(
      <AdminEventProvider>
        <AdminEventsPage />
      </AdminEventProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Carnaval 2027" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Jornadas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "← Mis eventos" })).toBeInTheDocument();
  });

  it("muestra estado vacío amigable con enlace a Mis eventos cuando no hay evento activo", async () => {
    apiRequest.mockResolvedValueOnce([]);
    render(<AdminEventsPage />);
    expect(await screen.findByText("Primero seleccioná un evento")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir a Mis eventos" })).toHaveAttribute("href", "#/admin/home");
  });
});
