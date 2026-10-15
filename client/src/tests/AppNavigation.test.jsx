import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AppNavigation } from "../components/AppNavigation.jsx";
import { AdminEventProvider } from "../context/AdminEventContext.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

const originalMatchMedia = window.matchMedia;

function mockMatchMedia(matches) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Abrir menu de navegacion" }));
}

describe("AppNavigation", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.location.hash = "";
    window.localStorage.removeItem("carnavales.sidebar.collapsed");
    document.body.style.overflow = "";
    window.matchMedia = originalMatchMedia;
  });

  it("no simula un cierre de sesión cuando el servidor falla", async () => {
    const clear = vi.fn();
    apiRequest.mockRejectedValue({ code: "NETWORK_ERROR" });
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"], clear }} />);
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tu acceso continúa activo");
    expect(clear).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
  });

  it("omite el menú lateral para el Jurado, manteniendo las acciones de sesión", () => {
    mockMatchMedia(false);
    render(<AppNavigation session={{ user: { name: "Jurado" }, roles: ["JUDGE"] }} />);

    expect(screen.queryByRole("navigation", { name: "Navegacion principal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir menu de navegacion" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
    expect(screen.getByText("Jurado")).toBeInTheDocument();
  });

  it("agrupa las rutas existentes por etapa y marca la sección activa", () => {
    window.location.hash = "#/admin/competencia?step=participantes";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    openMenu();
    expect(screen.getByText("Inicio", { selector: ".nav-section-label" })).toBeInTheDocument();
    expect(screen.getByText("Preparación")).toBeInTheDocument();
    expect(screen.getByText("En vivo")).toBeInTheDocument();
    expect(screen.getByText("Finalización")).toBeInTheDocument();
    expect(screen.getByText("Resultados y actas")).toBeInTheDocument();
    expect(screen.getByText("Usuarios", { selector: ".nav-section-label" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute("href", "#/admin/judges");
    expect(screen.queryByRole("link", { name: "Crear Usuario" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Administradores" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Accesos" })).not.toBeInTheDocument();
  });

  it("marca activo el ítem Evaluación dentro de Comparsas y jurados al navegar por step=rubros", () => {
    window.location.hash = "#/admin/competencia?step=rubros";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    openMenu();
    expect(screen.getByRole("link", { name: "Evaluación" })).toHaveAttribute("href", "#/admin/competencia?step=rubros");
    expect(screen.getByRole("link", { name: "Evaluación" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Comparsas" })).not.toHaveAttribute("aria-current");
  });

  it("marca activo el ítem Jurados y especialidades al navegar por step=jurados", () => {
    window.location.hash = "#/admin/competencia?step=jurados";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    openMenu();
    expect(screen.getByRole("link", { name: "Jurados y especialidades" })).toHaveAttribute("href", "#/admin/competencia?step=jurados");
    expect(screen.getByRole("link", { name: "Jurados y especialidades" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Comparsas" })).not.toHaveAttribute("aria-current");
  });

  it("mantiene navegación global sin atajos contextuales en Inicio aunque haya un evento recordado", async () => {
    window.location.hash = "#/admin/home";
    window.localStorage.setItem("carnavales.event.admin-user.operational", "e1");
    apiRequest.mockResolvedValue([{ id: "e1", name: "Evento recordado", status: "CONFIGURING" }]);
    render(
      <AdminEventProvider session={{ user: { id: "admin-user" }, roles: ["ADMIN"] }}>
        <AppNavigation session={{ user: { id: "admin-user", name: "Admin" }, roles: ["ADMIN"] }} />
      </AdminEventProvider>,
    );
    openMenu();

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "#/admin/home");
    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute("href", "#/admin/judges");
    expect(screen.queryByText("Preparación")).not.toBeInTheDocument();
    expect(screen.queryByText("En vivo")).not.toBeInTheDocument();
    expect(screen.queryByText("Finalización")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Jornadas" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Evento actual/ })).not.toBeInTheDocument();
  });

  it("muestra la navegación contextual con Jornadas activo en #/admin/events", () => {
    window.location.hash = "#/admin/events";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    openMenu();

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "#/admin/home");
    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute("href", "#/admin/judges");
    expect(screen.getByRole("link", { name: "Jornadas" })).toHaveAttribute("href", "#/admin/events");
    expect(screen.getByRole("link", { name: "Jornadas" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Control de votación" })).toHaveAttribute("href", "#/admin/voting");
  });

  it("muestra la navegación contextual una vez dentro de una función del evento", () => {
    window.location.hash = "#/admin/voting";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    openMenu();

    expect(screen.getByRole("link", { name: "Jornadas" })).toHaveAttribute("href", "#/admin/events");
    expect(screen.getByRole("link", { name: "Control de votación" })).toHaveAttribute("href", "#/admin/voting");
    expect(screen.getByRole("link", { name: "Usuarios" })).toHaveAttribute("href", "#/admin/judges");
  });

  it("muestra el enlace de Penalizaciones para el rol COMISARIO", () => {
    window.location.hash = "#/admin/penalties";
    render(<AppNavigation session={{ user: { name: "Comisario" }, roles: ["COMISARIO"] }} />);
    openMenu();
    expect(screen.queryByText("En vivo")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Penalizaciones" })).toHaveAttribute("href", "#/admin/penalties");
    expect(screen.getByRole("link", { name: "Penalizaciones" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Evento" })).not.toBeInTheDocument();
  });

  it("muestra Supervision para el rol VEEDOR", () => {
    window.location.hash = "#/veedor";
    render(<AppNavigation session={{ user: { name: "Veedor" }, roles: ["VEEDOR"] }} />);
    openMenu();
    expect(screen.getByRole("link", { name: "Supervisión" })).toHaveAttribute("href", "#/veedor");
    expect(screen.getByRole("link", { name: "Supervisión" })).toHaveAttribute("aria-current", "page");
  });

  it("en desktop no muestra el enlace de Inicio para el rol VEEDOR ni en #/veedor", () => {
    mockMatchMedia(true);
    window.location.hash = "#/veedor";
    render(<AppNavigation session={{ user: { name: "Veedor" }, roles: ["VEEDOR"] }} />);
    expect(screen.queryByRole("link", { name: "Inicio" })).not.toBeInTheDocument();
    expect(screen.getByText("Supervisión", { selector: ".breadcrumb-current" })).toBeInTheDocument();
  });

  it("abre y cierra el drawer lateral con el boton hamburguesa", () => {
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    const toggle = screen.getByRole("button", { name: "Abrir menu de navegacion" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "app-drawer");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const drawer = screen.getByRole("navigation", { name: "Navegacion principal" });
    expect(drawer).toHaveClass("is-open");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("cierra el drawer con Escape y devuelve el foco al boton hamburguesa", () => {
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    const toggle = screen.getByRole("button", { name: "Abrir menu de navegacion" });
    fireEvent.click(toggle);
    expect(screen.getByRole("navigation", { name: "Navegacion principal" })).toHaveClass("is-open");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("cierra el drawer al pulsar el backdrop", () => {
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    const toggle = screen.getByRole("button", { name: "Abrir menu de navegacion" });
    fireEvent.click(toggle);
    expect(screen.getByRole("navigation", { name: "Navegacion principal" })).toHaveClass("is-open");
    fireEvent.click(document.querySelector(".app-drawer-backdrop"));
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("mantiene brand y acciones de sesion visibles en el header con el drawer cerrado", () => {
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    const brand = screen.getByRole("link", { name: "Carnavales 2027" });
    expect(brand).toHaveAttribute("href", "#");
    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Salir" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir menu de navegacion" })).toBeInTheDocument();
  });

  it("en desktop muestra el menu lateral sin hamburguesa ni backdrop", () => {
    mockMatchMedia(true);
    window.location.hash = "#/admin/voting";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    expect(screen.queryByRole("button", { name: "Abrir menu de navegacion" })).not.toBeInTheDocument();
    expect(document.querySelector(".app-drawer-backdrop")).not.toBeInTheDocument();
    const drawer = screen.getByRole("navigation", { name: "Navegacion principal" });
    expect(drawer).toHaveClass("is-open");
    expect(drawer).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByRole("link", { name: "Control de votación" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Preparación")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Usuarios" })).toBeInTheDocument();
  });

  it("en movil el menu exige abrir la hamburguesa", () => {
    mockMatchMedia(false);
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    expect(screen.getByRole("button", { name: "Abrir menu de navegacion" })).toBeInTheDocument();
    expect(document.querySelector("#app-drawer")).not.toHaveClass("is-open");
  });

  it("en desktop el botón Menú lateral contrae el menú a solo iconos sin perder los nombres de los enlaces", () => {
    mockMatchMedia(true);
    window.location.hash = "#/admin/voting";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    const toggle = screen.getByRole("button", { name: "Menú lateral" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(toggle);

    const drawer = screen.getByRole("navigation", { name: "Navegacion principal" });
    expect(drawer).toHaveClass("is-collapsed");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Control de votación" })).toHaveAttribute("title", "Control de votación");

    fireEvent.click(toggle);

    expect(drawer).not.toHaveClass("is-collapsed");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("recuerda el estado contraído del menú lateral entre montajes", () => {
    mockMatchMedia(true);
    window.location.hash = "#/admin/voting";
    const { unmount } = render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Menú lateral" }));
    unmount();

    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    expect(screen.getByRole("navigation", { name: "Navegacion principal" })).toHaveClass("is-collapsed");
  });

  it("al pulsar un grupo con el menú contraído, lo expande para mostrar sus enlaces", () => {
    mockMatchMedia(true);
    window.location.hash = "#/admin/voting";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    fireEvent.click(screen.getByRole("button", { name: "Menú lateral" }));

    fireEvent.click(screen.getByText("Resultados y actas").closest("summary"));

    expect(screen.getByRole("navigation", { name: "Navegacion principal" })).not.toHaveClass("is-collapsed");
  });

  it("no ofrece el modo solo iconos a roles sin menú de Administrador", () => {
    mockMatchMedia(true);
    render(<AppNavigation session={{ user: { name: "Veedor" }, roles: ["VEEDOR"] }} />);
    expect(screen.queryByRole("button", { name: "Menú lateral" })).not.toBeInTheDocument();
  });

  it("muestra el selector global del evento para ADMIN", async () => {
    apiRequest.mockImplementation(async (path) => path === "/api/v1/public/events" ? { events: [] } : [
      { id: "e1", name: "Carnaval 2027", status: "CONFIGURING" },
      { id: "e2", name: "Prueba 2027", status: "OPEN" },
    ]);
    render(
      <AdminEventProvider>
        <AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />
      </AdminEventProvider>,
    );

    const selector = await screen.findByRole("button", { name: /^Evento actual/ });
    expect(selector).toHaveTextContent("Carnaval 2027");
    fireEvent.click(selector);
    expect(screen.getByRole("button", { name: /Crear nuevo evento/ })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("option", { name: "Prueba 2027" }));
    await waitFor(() => expect(selector).toHaveTextContent("Prueba 2027"));
  });
});
