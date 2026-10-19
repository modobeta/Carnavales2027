import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App.jsx";

describe("App", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.location.hash = ""; });

  it("muestra login como ruta pública inicial", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Carnavales" })).toBeInTheDocument();
    expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  it.each(["#/admin/home", "#/admin/events", "#/admin/competencia", "#/admin/judges", "#/admin/users", "#/admin/assignments", "#/admin/voting"])(
    "rechaza acceso administrativo directo sin ADMIN aunque /me informe asignaciones: %s",
    (route) => {
      window.location.hash = route;
      render(<App session={{ status: "authenticated", roles: ["JUDGE"], adminEvents: [{ id: "e1" }] }} />);
      expect(screen.getByText("No tenés permisos de administración")).toBeInTheDocument();
    },
  );

  it("ADMIN accede al inicio sin depender de asignaciones", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
    window.location.hash = "#/admin/home";
    render(<App session={{ status: "authenticated", roles: ["ADMIN"], adminEvents: [], user: { id: "u1", name: "Admin" } }} />);
    expect(await screen.findByRole("heading", { name: "Mis eventos" })).toBeInTheDocument();
  });

  it.each([
    ["#/admin/home", []], ["#/admin/home", [{ id: "e1" }]],
    ["#/admin/events", []], ["#/admin/events", [{ id: "e1" }]],
    ["#/admin/competencia", []], ["#/admin/competencia", [{ id: "e1" }]],
  ])("ADMIN entra a %s con adminEvents=%j", async (route, adminEvents) => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => [] }));
    vi.stubGlobal("fetch", fetchMock);
    window.location.hash = route;
    render(<App session={{ status: "authenticated", roles: ["ADMIN"], adminEvents, user: { id: "u1", name: "Admin" } }} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText("No tenés permisos de administración")).not.toBeInTheDocument();
  });

  it("un JUDGE conserva sus rutas y catálogo aunque /me incluya adminEvents", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ assignments: [] }) }));
    vi.stubGlobal("fetch", fetchMock);
    window.location.hash = "#/judge";
    render(<App session={{ status: "authenticated", roles: ["JUDGE"], adminEvents: [{ id: "e1" }], judgeProfile: { registrationStatus: "REGISTERED" }, user: { name: "Jurado" } }} />);
    expect(await screen.findByRole("heading", { name: "Buenas noches, Jurado" })).toBeInTheDocument();
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/v1/judge/profile"))).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/v1/events"))).toBe(false);
  });

  it("mantiene una ruta segura después de aceptar una invitación", () => {
    window.location.hash = "#/invitations/accepted";
    render(<App />);
    expect(screen.getByRole("heading", { name: "Cuenta creada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuar al inicio de sesión" })).toHaveAttribute("href", "#/login");
  });

  it("protege la ruta #/admin/penalties para roles no autorizados", () => {
    window.location.hash = "#/admin/penalties";
    render(<App session={{ status: "authenticated", roles: ["JUDGE"], adminEvents: [{ id: "e1" }] }} />);
    expect(screen.getByText("No tenés permisos para acceder a esta sección.")).toBeInTheDocument();
  });
});
