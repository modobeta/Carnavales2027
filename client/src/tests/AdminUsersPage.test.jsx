import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminUsersPage } from "../pages/AdminUsersPage.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

const currentUser = { id: "u-current-admin", name: "Admin Actual", email: "admin@carnaval.local" };

vi.mock("../auth/session-context.jsx", () => ({
  useSession: () => ({ status: "authenticated", user: currentUser, roles: ["ADMIN"] }),
}));

const users = [
  { ...currentUser, roles: ["ADMIN"], isPrimaryAdmin: true },
  { id: "u-other-admin", name: "Segundo Admin", email: "admin2@carnaval.local", roles: ["ADMIN"], isPrimaryAdmin: false },
  { id: "u-candidate", name: "Candidato Auxiliar", email: "candidato@carnaval.local", roles: ["VEEDOR"], isPrimaryAdmin: false },
];

// Simula el backend: la lista de administradores y la búsqueda cambian tras cada promoción o revocación.
function fakeBackend(initialUsers) {
  let state = initialUsers.map((user) => ({ ...user }));
  const adminsOf = () => state.filter((user) => user.roles.includes("ADMIN"));
  return (path, options = {}) => {
    const url = new URL(path, "http://test.local");
    if (url.pathname === "/api/v1/users" && options.method === undefined) {
      if (url.searchParams.get("role") === "ADMIN") return Promise.resolve(adminsOf());
      const q = url.searchParams.get("q")?.toLowerCase() ?? "";
      return Promise.resolve(state
        .filter((user) => !user.roles.includes("ADMIN"))
        .filter((user) => user.name.toLowerCase().includes(q) || user.email.toLowerCase().includes(q))
        .slice(0, Number(url.searchParams.get("limit") ?? 50)));
    }
    const match = url.pathname.match(/^\/api\/v1\/users\/([^/]+)\/roles\/admin$/);
    if (match) {
      state = state.map((user) => (user.id === match[1]
        ? { ...user, roles: options.method === "POST" ? ["ADMIN"] : user.roles.filter((role) => role !== "ADMIN") }
        : user));
      return Promise.resolve({ ok: true });
    }
    return Promise.reject(new Error(`ruta no simulada: ${path}`));
  };
}

function renderPage() {
  return render(<AdminUsersPage />);
}

async function searchFor(term) {
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar usuario existente" }), { target: { value: term } });
  return screen.findByRole("list", { name: "Resultados de búsqueda" });
}

describe("AdminUsersPage", () => {
  beforeEach(() => {
    apiRequest.mockImplementation(fakeBackend(users));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renderiza bajo la capa de instrumento y mantiene la navegación de usuarios", async () => {
    const { container } = renderPage();
    expect(container.querySelector("main.container")).toHaveAttribute("data-layer", "instrument");
    expect(screen.getByRole("navigation", { name: "Secciones de usuarios" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Administradores" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Crear e invitar" })).toHaveAttribute("href", "#/admin/judges");
    await screen.findByText("Admin Actual");
  });

  it("lista solo administradores, con conteo y sin botón de revocar para la cuenta principal ni la sesión actual", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Administradores activos" });

    expect(screen.getByText("2 activos")).toBeInTheDocument();
    expect(within(list).getByText("Segundo Admin")).toBeInTheDocument();
    expect(within(list).queryByText("Candidato Auxiliar")).not.toBeInTheDocument();
    expect(within(list).getByText("Administrador principal")).toBeInTheDocument();
    expect(within(list).getByText("Sesión actual")).toBeInTheDocument();
    expect(within(list).getAllByRole("button", { name: "Revocar administrador" })).toHaveLength(1);
  });

  it("no carga todos los usuarios al entrar, solo busca al escribir", async () => {
    renderPage();
    await screen.findByRole("list", { name: "Administradores activos" });
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/users?role=ADMIN");
    expect(apiRequest.mock.calls.some(([path]) => path === "/api/v1/users")).toBe(false);
  });

  it("busca usuarios sin rol ADMIN y los promueve con confirmación", async () => {
    renderPage();
    const results = await searchFor("candidato");
    expect(within(results).getByText("Candidato Auxiliar")).toBeInTheDocument();

    fireEvent.click(within(results).getByRole("button", { name: "Promover a administrador" }));
    expect(await screen.findByRole("dialog", { name: "Promover a administrador" })).toBeInTheDocument();
    expect(screen.getByText(/¿Confirmás que Candidato Auxiliar tendrá permisos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar promoción" }));

    expect(await screen.findByText("Administrador promovido.")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/users/u-candidate/roles/admin", { method: "POST" });
    expect(await screen.findByText("3 activos")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("list", { name: "Resultados de búsqueda" })).not.toBeInTheDocument());
  });

  it("al revocar, el usuario sale de la lista de administradores", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Administradores activos" });
    fireEvent.click(within(list).getByRole("button", { name: "Revocar administrador" }));

    expect(await screen.findByRole("dialog", { name: "Revocar administrador" })).toBeInTheDocument();
    expect(screen.getByText(/¿Confirmás que Segundo Admin dejará de tener permisos/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar revocación" }));

    expect(await screen.findByText("Rol ADMIN revocado.")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/users/u-other-admin/roles/admin", { method: "DELETE" });
    await waitFor(() => expect(screen.getByText("1 activo")).toBeInTheDocument());
    expect(screen.queryByText("Segundo Admin")).not.toBeInTheDocument();
  });

  it("después de revocar, el usuario vuelve a aparecer en la búsqueda para poder promoverlo otra vez", async () => {
    renderPage();
    const list = await screen.findByRole("list", { name: "Administradores activos" });
    fireEvent.click(within(list).getByRole("button", { name: "Revocar administrador" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar revocación" }));
    await screen.findByText("Rol ADMIN revocado.");

    const results = await searchFor("segundo");
    expect(within(results).getByText("Segundo Admin")).toBeInTheDocument();
  });

  it("explica la búsqueda corta y los resultados vacíos", async () => {
    renderPage();
    await screen.findByRole("list", { name: "Administradores activos" });
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar usuario existente" }), { target: { value: "c" } });
    expect(screen.getByText("Escribí al menos 2 caracteres.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar usuario existente" }), { target: { value: "zzz-sin-coincidencias" } });
    expect(await screen.findByText("No hay usuarios sin rol ADMIN que coincidan.")).toBeInTheDocument();
  });

  it("invita una cuenta nueva solo con ADMIN y muestra el enlace de aceptación", async () => {
    apiRequest.mockImplementation((path, options) => (options?.method === "POST" && path === "/api/v1/users/invitations"
      ? Promise.resolve({ id: "invite-1", token: "secret-token", roleCode: "ADMIN" })
      : fakeBackend(users)(path, options)));
    renderPage();
    fireEvent.change(await screen.findByRole("textbox", { name: "Correo de una cuenta nueva" }), { target: { value: "nuevo@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear invitación ADMIN" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v1/users/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "nuevo@example.test", roleCode: "ADMIN" }),
    }));
    expect(await screen.findByRole("link", { name: "Abrir invitación" })).toHaveAttribute("href", expect.stringContaining("#/invitations/role/accept?token=secret-token"));
    expect(screen.getByRole("button", { name: "Copiar enlace de invitación" })).toBeInTheDocument();
  });

  it("muestra mensaje humano ante error PRIMARY_ADMIN_PROTECTED", async () => {
    const error = new Error("PRIMARY_ADMIN_PROTECTED");
    error.code = "PRIMARY_ADMIN_PROTECTED";
    const backend = fakeBackend(users);
    apiRequest.mockImplementation((path, options) => (options?.method === "DELETE"
      ? Promise.reject(error)
      : backend(path, options)));

    renderPage();
    const list = await screen.findByRole("list", { name: "Administradores activos" });
    fireEvent.click(within(list).getByRole("button", { name: "Revocar administrador" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar revocación" }));

    expect(await screen.findByText("La cuenta principal está protegida y no se puede revocar su rol ADMIN.")).toBeInTheDocument();
  });
});
