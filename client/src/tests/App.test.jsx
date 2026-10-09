import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App.jsx";

describe("App", () => {
  it("conserva navegación y sesión en resultados sin mandar al login", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ events: [] }) })));
    window.location.hash = "#/resultados";
    render(<App session={{ status: "authenticated", roles: ["JUDGE"], user: { name: "Jurado" } }} />);
    expect(await screen.findByText("Resultados en Proceso de Escrutinio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Acceso Operativo" })).not.toBeInTheDocument();
    expect(document.querySelector("#app-drawer")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ""; });
  it("muestra login como ruta pública inicial", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Carnavales" })).toBeInTheDocument();
    expect(screen.queryByText("Acceso seguro")).not.toBeInTheDocument();
    expect(screen.queryByText("Sistema de jurados")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ingresar" })).toBeInTheDocument();
  });

  it("protege rutas ADMIN y permite el panel informativo JUDGE", () => {
    window.location.hash = "#/admin/judges";
    const { rerender } = render(<App session={{ status: "authenticated", roles: ["JUDGE"] }} />);
    expect(screen.getByText("No tenés permisos de administración")).toBeInTheDocument();

    window.location.hash = "#/judge";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    rerender(<App session={{ status: "authenticated", roles: ["JUDGE"], judgeProfile: { registrationStatus: "REGISTERED" }, user: { name: "Jurado" } }} />);
    expect(screen.getByRole("heading", { name: "Buenas noches, Jurado" })).toBeInTheDocument();
  });

  it("mantiene una ruta segura después de aceptar una invitación", () => {
    window.location.hash = "#/invitations/accepted";
    render(<App />);
    expect(screen.getByRole("heading", { name: "Cuenta creada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuar al inicio de sesión" })).toHaveAttribute("href", "#/login");
  });

  it("protege la ruta #/admin/penalties para roles no autorizados", () => {
    window.location.hash = "#/admin/penalties";
    render(<App session={{ status: "authenticated", roles: ["JUDGE"] }} />);
    expect(screen.getByText("No tenés permisos para acceder a esta sección.")).toBeInTheDocument();
  });

  it("abre directamente Rubros desde el acceso simplificado del menú", async () => {
    const readiness = {
      ready: true,
      missing: [],
      incompleteTroupes: [],
      incompleteRubrics: [],
      incompleteSchedules: [],
      incompleteNominations: [],
      nightsWithoutJury: [],
    };
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      const path = new URL(String(url), "http://localhost").pathname;
      let data = [];
      if (path === "/api/v1/events") data = [{ id: "event-1", name: "Carnaval", status: "CONFIGURING", active: true }];
      else if (path === "/api/v1/public/events") data = { events: [] };
      else if (path === "/api/v1/events/event-1/readiness") data = readiness;
      return { ok: true, status: 200, json: async () => data };
    }));
    window.location.hash = "#/admin/competencia?step=rubros";
    render(<App session={{ status: "authenticated", roles: ["ADMIN"], user: { id: "admin-1", name: "Admin" } }} />);

    expect(await screen.findByRole("heading", { name: "Configurar evaluación" })).toBeInTheDocument();
  });
});
