import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminUsersPage } from "../pages/AdminUsersPage.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

let currentSession = {
  status: "authenticated",
  user: { id: "u-current-admin", name: "Admin Actual", email: "admin@carnaval.local" },
  roles: ["ADMIN"],
};

vi.mock("../auth/session-context.jsx", () => ({
  useSession: () => currentSession,
}));

const sampleUsers = [
  {
    id: "u-current-admin",
    name: "Admin Actual",
    email: "admin@carnaval.local",
    roles: ["ADMIN"],
    isPrimaryAdmin: true,
  },
  {
    id: "u-other-admin",
    name: "Segundo Admin",
    email: "admin2@carnaval.local",
    roles: ["ADMIN"],
    isPrimaryAdmin: false,
  },
  {
    id: "u-candidate",
    name: "Candidato Auxiliar",
    email: "candidato@carnaval.local",
    roles: ["VEEDOR"],
    isPrimaryAdmin: false,
  },
];

function renderPage() {
  return render(<AdminUsersPage />);
}

describe("AdminUsersPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    currentSession = {
      status: "authenticated",
      user: { id: "u-current-admin", name: "Admin Actual", email: "admin@carnaval.local" },
      roles: ["ADMIN"],
    };
  });

  it("renderiza bajo la capa de instrumento data-layer='instrument'", async () => {
    apiRequest.mockResolvedValueOnce([]);
    const { container } = renderPage();
    expect(container.querySelector("main.container")).toHaveAttribute("data-layer", "instrument");
    expect(screen.getByRole("navigation", { name: "Secciones de usuarios" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Administradores" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Crear e invitar" })).toHaveAttribute("href", "#/admin/judges");
  });

  it("lista los usuarios y distingue la sesión actual y roles", async () => {
    apiRequest.mockResolvedValueOnce(sampleUsers);
    renderPage();

    expect(await screen.findByText("Admin Actual")).toBeInTheDocument();
    expect(screen.getByText("Segundo Admin")).toBeInTheDocument();
    expect(screen.getByText("Candidato Auxiliar")).toBeInTheDocument();

    const currentBtn = screen.getByRole("button", { name: "Sesión actual" });
    expect(currentBtn).toBeDisabled();
    expect(screen.getByText("Administrador principal")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Revocar administrador" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Promover a administrador" })).toBeInTheDocument();
  });

  it("invita una cuenta nueva solo con ADMIN y muestra el enlace de aceptación", async () => {
    apiRequest.mockResolvedValueOnce(sampleUsers).mockResolvedValueOnce({
      id: "invite-1", token: "secret-token", roleCode: "ADMIN", expiresAt: "2026-10-19T12:00:00.000Z",
    });
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Correo del nuevo administrador" }), { target: { value: "nuevo@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear invitación ADMIN" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v1/users/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "nuevo@example.test", roleCode: "ADMIN" }),
    }));
    expect(await screen.findByRole("link", { name: "Abrir invitación" })).toHaveAttribute("href", expect.stringContaining("#/invitations/role/accept?token=secret-token"));
    expect(screen.getByRole("button", { name: "Copiar enlace de invitación" })).toBeInTheDocument();
  });

  it("no ofrece revocar ADMIN a la cuenta principal aunque sea otra sesión", async () => {
    const users = [{ ...sampleUsers[0], id: "u-primary", isPrimaryAdmin: true }, { ...sampleUsers[1], isPrimaryAdmin: false }];
    apiRequest.mockResolvedValueOnce(users);
    currentSession = { ...currentSession, user: { id: "u-current-admin", name: "Otro admin" } };
    renderPage();
    const primary = await screen.findByText("Administrador principal");
    const row = primary.closest("li");
    expect(row).toHaveTextContent("Admin Actual");
    expect(row.querySelector("button")).toHaveTextContent("Cuenta principal protegida");
    expect(row.querySelector("button")).toBeDisabled();
    currentSession = { status: "authenticated", user: { id: "u-current-admin", name: "Admin Actual", email: "admin@carnaval.local" }, roles: ["ADMIN"] };
  });

  it("promueve a un usuario a administrador con confirmación accesible", async () => {
    apiRequest
      .mockResolvedValueOnce(sampleUsers)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(sampleUsers);

    renderPage();
    const promoteBtn = await screen.findByRole("button", { name: "Promover a administrador" });
    fireEvent.click(promoteBtn);

    expect(await screen.findByRole("dialog", { name: "Promover a administrador" })).toBeInTheDocument();
    expect(screen.getByText(/¿Confirmás que Candidato Auxiliar tendrá permisos de administración/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar promoción" }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("/api/v1/users/u-candidate/roles/admin", {
        method: "POST",
      });
    });
    expect(await screen.findByText("Administrador promovido.")).toBeInTheDocument();
  });

  it("revoca el rol administrador a otro usuario con confirmación", async () => {
    apiRequest
      .mockResolvedValueOnce(sampleUsers)
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce(sampleUsers);

    renderPage();
    const revokeBtn = await screen.findByRole("button", { name: "Revocar administrador" });
    fireEvent.click(revokeBtn);

    expect(await screen.findByRole("dialog", { name: "Revocar administrador" })).toBeInTheDocument();
    expect(screen.getByText(/¿Confirmás que Segundo Admin dejará de tener permisos de administración/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirmar revocación" }));

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith("/api/v1/users/u-other-admin/roles/admin", {
        method: "DELETE",
      });
    });
    expect(await screen.findByText("Rol ADMIN revocado.")).toBeInTheDocument();
  });

  it("muestra mensaje humano ante error PRIMARY_ADMIN_PROTECTED", async () => {
    const error = new Error("PRIMARY_ADMIN_PROTECTED");
    error.code = "PRIMARY_ADMIN_PROTECTED";

    apiRequest
      .mockResolvedValueOnce(sampleUsers)
      .mockRejectedValueOnce(error);

    renderPage();
    const revokeBtn = await screen.findByRole("button", { name: "Revocar administrador" });
    fireEvent.click(revokeBtn);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar revocación" }));

    expect(await screen.findByText("La cuenta principal está protegida y no se puede revocar su rol ADMIN.")).toBeInTheDocument();
  });

  it("actualiza el listado al pulsar el botón Actualizar", async () => {
    apiRequest.mockResolvedValue(sampleUsers);
    renderPage();

    await screen.findByText("Admin Actual");
    const refreshBtn = screen.getByRole("button", { name: "Actualizar" });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledTimes(2);
    });
  });
});
