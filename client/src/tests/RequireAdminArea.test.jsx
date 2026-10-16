import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RequireAdminArea } from "../auth/RequireAdminArea.jsx";

afterEach(cleanup);

const renderGuard = (session) => render(<RequireAdminArea session={session}><p>Admin content</p></RequireAdminArea>);

describe("RequireAdminArea", () => {
  it("permite ADMIN global con o sin asignaciones", () => {
    const { rerender } = renderGuard({ status: "authenticated", roles: ["ADMIN"], adminEvents: [] });
    expect(screen.getByText("Admin content")).toBeInTheDocument();
    rerender(<RequireAdminArea session={{ status: "authenticated", roles: ["ADMIN"], adminEvents: [{ id: "e1" }] }}><p>Admin content</p></RequireAdminArea>);
    expect(screen.getByText("Admin content")).toBeInTheDocument();
  });

  it("permite ADMIN_EVENT vigente informado por /me", () => {
    renderGuard({ status: "authenticated", roles: ["JUDGE"], adminEvents: [{ id: "e1", active: false }] });
    expect(screen.getByText("Admin content")).toBeInTheDocument();
  });

  it.each([
    [{ status: "authenticated", roles: [], adminEvents: [] }],
    [{ status: "authenticated", roles: ["JUDGE", "COMISARIO"] }],
  ])("rechaza de forma controlada una sesión sin capacidad %#", (session) => {
    renderGuard(session);
    expect(screen.getByText("No tenés permisos de administración")).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
  });

  it("evalúa sesión, 2FA y error antes que la capacidad", () => {
    const adminEvents = [{ id: "e1" }];
    const { rerender } = renderGuard({ status: "anonymous", adminEvents });
    expect(screen.getByText(/Iniciá sesión para continuar/)).toBeInTheDocument();
    rerender(<RequireAdminArea session={{ status: "anonymous", sessionExpired: true, adminEvents }}><p>Admin content</p></RequireAdminArea>);
    expect(screen.getByText(/Tu sesión ha expirado/)).toBeInTheDocument();
    rerender(<RequireAdminArea session={{ status: "second-factor-required", adminEvents }}><p>Admin content</p></RequireAdminArea>);
    expect(screen.getByText(/verificación en dos pasos/)).toBeInTheDocument();
    rerender(<RequireAdminArea session={{ status: "error", adminEvents }}><p>Admin content</p></RequireAdminArea>);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText("Admin content")).not.toBeInTheDocument();
    expect(screen.queryByText("No tenés permisos de administración")).not.toBeInTheDocument();
  });
});
