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

  it("agrupa las rutas existentes por etapa y marca la sección activa", () => {
    window.location.hash = "#/admin/judges";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    openMenu();
    expect(screen.getByText("Inicio", { selector: ".nav-section-label" })).toBeInTheDocument();
    expect(screen.getByText("Preparación")).toBeInTheDocument();
    expect(screen.getByText("En vivo")).toBeInTheDocument();
    expect(screen.getByText("Finalización")).toBeInTheDocument();
    expect(screen.getByText("Resultados y actas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Crear Usuario" })).toHaveAttribute("href", "#/admin/judges");
    expect(screen.getByRole("link", { name: "Crear Usuario" })).toHaveAttribute("aria-current", "page");
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

  it("simplifica el menú administrativo y conserva destinos agrupados", () => {
    window.location.hash = "#/admin/events";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    openMenu();

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "#/admin/home");
    expect(screen.getByRole("link", { name: "Evento y jornadas" })).toHaveAttribute("href", "#/admin/events");
    expect(screen.getByRole("link", { name: "Control de votación" })).toHaveAttribute("href", "#/admin/voting");
    expect(screen.getByText("Comparsas y jurados")).toBeInTheDocument();
    expect(screen.getByText("Supervisión y penalizaciones")).toBeInTheDocument();
    expect(screen.getByText("Resultados y actas")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Comparsas y jurados"));
    expect(screen.getByRole("link", { name: "Comparsas" })).toHaveAttribute("href", "#/admin/competencia?step=participantes");
    expect(screen.getByRole("link", { name: "Jurados y especialidades" })).toHaveAttribute("href", "#/admin/competencia?step=jurados");
    expect(screen.getByRole("link", { name: "Evaluación" })).toHaveAttribute("href", "#/admin/competencia?step=rubros");
    expect(screen.getByRole("link", { name: "Asignar Jurados" })).toHaveAttribute("href", "#/admin/assignments");
    expect(screen.getByRole("link", { name: "Crear Usuario" })).toHaveAttribute("href", "#/admin/judges");

    fireEvent.click(screen.getByText("Supervisión y penalizaciones"));
    expect(screen.getByRole("link", { name: "Supervisión" })).toHaveAttribute("href", "#/veedor");
    expect(screen.getByRole("link", { name: "Penalizaciones" })).toHaveAttribute("href", "#/admin/penalties");

    fireEvent.click(screen.getByText("Resultados y actas"));
    expect(screen.getByRole("link", { name: "Escrutinio" })).toHaveAttribute("href", "#/admin/results");
    expect(screen.getByRole("link", { name: "Acta oficial" })).toHaveAttribute("href", "#/admin/record");
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
    window.location.hash = "#/admin/judges";
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    expect(screen.queryByRole("button", { name: "Abrir menu de navegacion" })).not.toBeInTheDocument();
    expect(document.querySelector(".app-drawer-backdrop")).not.toBeInTheDocument();
    const drawer = screen.getByRole("navigation", { name: "Navegacion principal" });
    expect(drawer).toHaveClass("is-open");
    expect(drawer).toHaveAttribute("aria-hidden", "false");
    expect(screen.getByRole("link", { name: "Crear Usuario" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Preparación")).toBeInTheDocument();
  });

  it("en movil el menu exige abrir la hamburguesa", () => {
    mockMatchMedia(false);
    render(<AppNavigation session={{ user: { name: "Admin" }, roles: ["ADMIN"] }} />);
    expect(screen.getByRole("button", { name: "Abrir menu de navegacion" })).toBeInTheDocument();
    expect(document.querySelector("#app-drawer")).not.toHaveClass("is-open");
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

    const selector = await screen.findByRole("combobox", { name: "Evento activo" });
    await waitFor(() => expect(selector).toHaveValue("e1"));
    fireEvent.change(selector, { target: { value: "e2" } });
    expect(selector).toHaveValue("e2");
  });
});
