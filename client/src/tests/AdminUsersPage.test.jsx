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
  },
  {
    id: "u-other-admin",
    name: "Segundo Admin",
    email: "admin2@carnaval.local",
    roles: ["ADMIN"],
  },
  {
    id: "u-candidate",
    name: "Candidato Auxiliar",
    email: "candidato@carnaval.local",
    roles: ["VEEDOR"],
  },
];

function renderPage() {
  return render(<AdminUsersPage />);
}

describe("AdminUsersPage", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renderiza bajo la capa de instrumento data-layer='instrument'", async () => {
    apiRequest.mockResolvedValueOnce([]);
    const { container } = renderPage();
    expect(container.querySelector("main.container")).toHaveAttribute("data-layer", "instrument");
  });

  it("lista los usuarios y distingue la sesión actual y roles", async () => {
    apiRequest.mockResolvedValueOnce(sampleUsers);
    renderPage();

    expect(await screen.findByText("Admin Actual")).toBeInTheDocument();
    expect(screen.getByText("Segundo Admin")).toBeInTheDocument();
    expect(screen.getByText("Candidato Auxiliar")).toBeInTheDocument();

    const currentBtn = screen.getByRole("button", { name: "Sesión actual" });
    expect(currentBtn).toBeDisabled();

    expect(screen.getByRole("button", { name: "Revocar administrador" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Promover a administrador" })).toBeInTheDocument();
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

  it("muestra mensaje humano ante error LAST_ADMIN_REQUIRED", async () => {
    const error = new Error("LAST_ADMIN_REQUIRED");
    error.code = "LAST_ADMIN_REQUIRED";

    apiRequest
      .mockResolvedValueOnce(sampleUsers)
      .mockRejectedValueOnce(error);

    renderPage();
    const revokeBtn = await screen.findByRole("button", { name: "Revocar administrador" });
    fireEvent.click(revokeBtn);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar revocación" }));

    expect(await screen.findByText("No se puede revocar al ultimo administrador.")).toBeInTheDocument();
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
