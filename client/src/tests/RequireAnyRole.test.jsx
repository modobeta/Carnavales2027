import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RequireAnyRole } from "../auth/RequireAnyRole.jsx";
import { getDefaultRouteForRoles, ROLE_DEFAULT_ROUTES } from "../auth/role-routes.js";

describe("RequireAnyRole y Mapeo de Rutas (Spec 020 / RF-179)", () => {
  afterEach(() => { cleanup(); });
  it("muestra 'Cargando sesión…' si session.status es loading", () => {
    render(
      <RequireAnyRole session={{ status: "loading" }} allowedRoles={["ADMIN"]}>
        <p>Contenido protegido</p>
      </RequireAnyRole>
    );
    expect(screen.getByText("Cargando sesión…")).toBeInTheDocument();
    expect(screen.queryByText("Contenido protegido")).toBeNull();
  });

  it("muestra mensaje de inicio de sesión si session.status es anonymous", () => {
    render(
      <RequireAnyRole session={{ status: "anonymous" }} allowedRoles={["ADMIN"]}>
        <p>Contenido protegido</p>
      </RequireAnyRole>
    );
    expect(screen.getByText(/Iniciá sesión para continuar/)).toBeInTheDocument();
    expect(screen.queryByText("Contenido protegido")).toBeNull();
  });

  it("muestra aviso de sesión expirada con link a login si anonymous + sessionExpired", () => {
    render(
      <RequireAnyRole session={{ status: "anonymous", sessionExpired: true }} allowedRoles={["JUDGE"]}>
        <p>Contenido protegido</p>
      </RequireAnyRole>
    );
    expect(screen.getByText(/Tu sesión ha expirado/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ir al inicio de sesión/ })).toHaveAttribute("href", "#/login?reason=session-expired");
    expect(screen.queryByText("Contenido protegido")).toBeNull();
  });

  it("ofrece reintentar y link a login si no se pudo verificar la sesión", () => {
    render(
      <RequireAnyRole session={{ status: "error", refresh: () => {} }} allowedRoles={["JUDGE"]}>
        <p>Contenido protegido</p>
      </RequireAnyRole>
    );
    expect(screen.getByText(/No se pudo verificar la sesión/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ir al inicio de sesión/ })).toBeInTheDocument();
    expect(screen.queryByText("Contenido protegido")).toBeNull();
  });

  it("muestra mensaje de 2FA requerido si status es second-factor-required", () => {
    render(
      <RequireAnyRole session={{ status: "second-factor-required" }} allowedRoles={["ADMIN"]}>
        <p>Contenido protegido</p>
      </RequireAnyRole>
    );
    expect(screen.getByText(/Completá la verificación en dos pasos/)).toBeInTheDocument();
    expect(screen.queryByText("Contenido protegido")).toBeNull();
  });

  it("deniega acceso si el usuario no tiene ninguno de los roles permitidos", () => {
    render(
      <RequireAnyRole
        session={{ status: "authenticated", roles: ["JUDGE"] }}
        allowedRoles={["ADMIN", "COMISARIO"]}
        deniedMessage="Acceso prohibido para este rol."
      >
        <p>Contenido protegido</p>
      </RequireAnyRole>
    );
    expect(screen.getByText("Acceso prohibido para este rol.")).toBeInTheDocument();
    expect(screen.queryByText("Contenido protegido")).toBeNull();
  });

  it("permite acceso si el usuario posee al menos uno de los roles permitidos", () => {
    render(
      <RequireAnyRole
        session={{ status: "authenticated", roles: ["VEEDOR", "JUDGE"] }}
        allowedRoles={["ADMIN", "JUDGE"]}
      >
        <p>Contenido protegido</p>
      </RequireAnyRole>
    );
    expect(screen.getByText("Contenido protegido")).toBeInTheDocument();
  });

  describe("getDefaultRouteForRoles", () => {
    it("devuelve #/login para lista vacía", () => {
      expect(getDefaultRouteForRoles([])).toBe("#/login");
    });

    it("resuelve ruta de mayor privilegio según la prioridad", () => {
      expect(getDefaultRouteForRoles(["VEEDOR", "ADMIN"])).toBe(ROLE_DEFAULT_ROUTES.ADMIN);
      expect(getDefaultRouteForRoles(["VEEDOR", "JUDGE"])).toBe(ROLE_DEFAULT_ROUTES.JUDGE);
      expect(getDefaultRouteForRoles(["COMISARIO"])).toBe(ROLE_DEFAULT_ROUTES.COMISARIO);
      expect(getDefaultRouteForRoles(["SCRUTINEER"])).toBe(ROLE_DEFAULT_ROUTES.SCRUTINEER);
    });
  });
});
