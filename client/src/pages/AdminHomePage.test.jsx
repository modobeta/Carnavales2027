import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminHomePage } from "./AdminHomePage.jsx";
import { AdminEventProvider, useAdminEvent } from "../context/AdminEventContext.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

const MOCK_EVENTS = [
  { id: "e1", name: "Test-Prueba-01", status: "CONFIGURING", active: true },
  { id: "e2", name: "Carnavales Goyanos 2027 – Evento Integral TEST", status: "OPEN", active: true },
  { id: "e3", name: "Carnaval cerrado", status: "CLOSED", active: true },
];

function mockApi({ events = MOCK_EVENTS, onRequest } = {}) {
  apiRequest.mockImplementation((path, options) => {
    const custom = onRequest?.(path, options);
    if (custom) return custom;
    if (path === "/api/v1/events") return Promise.resolve(events);
    if (path === "/api/v1/judges") return Promise.resolve([
      { id: "j1", registrationStatus: "REGISTERED" },
      { id: "j2", registrationStatus: "REGISTERED" },
      { id: "j3", registrationStatus: "INVITED" },
    ]);
    if (path.endsWith("/nights")) return Promise.resolve([{ id: "n1", kind: "COMPETITION" }, { id: "n2", kind: "COMPETITION" }]);
    if (path.endsWith("/troupes")) return Promise.resolve([{ id: "t1", active: true }, { id: "t2", active: true }, { id: "t3", active: true }]);
    if (path.endsWith("/rubrics")) return Promise.resolve([{ id: "r1", active: true }]);
    return Promise.resolve([]);
  });
}

function ActiveEventProbe() {
  const adminEvent = useAdminEvent();
  return <output data-testid="active-event">{adminEvent?.activeEventId}</output>;
}

function renderWithProvider() {
  return render(
    <AdminEventProvider>
      <AdminHomePage />
      <ActiveEventProbe />
    </AdminEventProvider>
  );
}

describe("AdminHomePage (Rediseño a Mis eventos)", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.localStorage.clear();
    window.location.hash = "";
  });

  it("renderiza encabezado, filtros, botón Crear evento y tarjetas con métricas", async () => {
    mockApi();
    render(<AdminHomePage />);

    expect(screen.getByRole("heading", { level: 1, name: "Mis eventos" })).toBeInTheDocument();
    expect(screen.getByText("Elegí el evento que querés administrar.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear evento/ })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Buscar evento" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filtrar por estado" })).toBeInTheDocument();

    const firstCard = await screen.findByRole("article", { name: "Test-Prueba-01" });
    expect(within(firstCard).getByText("En preparación")).toBeInTheDocument();
    expect(await within(firstCard).findByText("2 jornadas")).toBeInTheDocument();
    expect(within(firstCard).getByText("3 comparsas")).toBeInTheDocument();
    expect(within(firstCard).getByText("2 jurados")).toBeInTheDocument();
    expect(within(firstCard).getByText("1 rubro")).toBeInTheDocument();

    const secondCard = screen.getByRole("article", { name: "Carnavales Goyanos 2027 – Evento Integral TEST" });
    expect(within(secondCard).getByText("Competencia abierta")).toBeInTheDocument();
    expect(within(firstCard).getByRole("button", { name: "Administrar evento Test-Prueba-01" })).toBeInTheDocument();
  });

  it("filtra eventos por texto (insensible a acentos y mayúsculas) y por estado", async () => {
    mockApi();
    render(<AdminHomePage />);
    await screen.findByRole("article", { name: "Test-Prueba-01" });

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar evento" }), { target: { value: "GOYANOS" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Carnavales Goyanos 2027 – Evento Integral TEST" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar evento" }), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por estado" }), { target: { value: "CLOSED" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "Carnaval cerrado" })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar evento" }), { target: { value: "inexistente" } });
    expect(screen.getByText("Ningún evento coincide con la búsqueda.")).toBeInTheDocument();
  });

  it("pulsar Administrar evento establece el evento activo y navega a #/admin/events", async () => {
    mockApi();
    renderWithProvider();

    const button = await screen.findByRole("button", { name: "Administrar evento Carnavales Goyanos 2027 – Evento Integral TEST" });
    fireEvent.click(button);

    expect(screen.getByTestId("active-event")).toHaveTextContent("e2");
    expect(window.location.hash).toBe("#/admin/events");
  });

  it("menú ... muestra opciones contextuales según el estado", async () => {
    mockApi();
    render(<AdminHomePage />);
    await screen.findByRole("article", { name: "Test-Prueba-01" });

    // Tarjeta en CONFIGURING
    fireEvent.click(screen.getByRole("button", { name: "Acciones de Test-Prueba-01" }));
    let menu = screen.getByRole("menu", { name: "Acciones de Test-Prueba-01" });
    expect(within(menu).getByRole("menuitem", { name: "Ver detalle / configuración" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Eliminar" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Ir a supervisión" })).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    // Tarjeta en OPEN
    fireEvent.click(screen.getByRole("button", { name: "Acciones de Carnavales Goyanos 2027 – Evento Integral TEST" }));
    menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Ir a supervisión" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Eliminar" })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Ir a supervisión" }));
    expect(window.location.hash).toBe("#/veedor");

    // Tarjeta en CLOSED
    fireEvent.click(screen.getByRole("button", { name: "Acciones de Carnaval cerrado" }));
    menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Ver resultados" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Eliminar" })).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Ver resultados" }));
    expect(window.location.hash).toBe("#/admin/results");
  });

  it("eliminar evento requiere confirmación modal antes de llamar a la API", async () => {
    mockApi({
      onRequest: (path, options) => path === "/api/v1/events/e1" && options?.method === "DELETE"
        ? Promise.resolve({ id: "e1", active: false })
        : null,
    });
    render(<AdminHomePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Acciones de Test-Prueba-01" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar" }));

    expect(await screen.findByRole("dialog", { name: "Eliminar Test-Prueba-01" })).toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/events/e1", { method: "DELETE" });

    fireEvent.click(screen.getByRole("button", { name: "Eliminar (desactivar)" }));
    expect(await screen.findByText("Evento Test-Prueba-01 eliminado (desactivado en BD).")).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/events/e1", { method: "DELETE" });
  });

  it("cancelar modal de eliminación no invoca DELETE", async () => {
    mockApi();
    render(<AdminHomePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Acciones de Test-Prueba-01" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/events/e1", { method: "DELETE" });
  });

  it("muestra mensaje de error humano cuando la API rechaza la eliminación por historial", async () => {
    mockApi({
      onRequest: (path, options) => {
        if (path === "/api/v1/events/e1" && options?.method === "DELETE") {
          const error = new Error("EVENT_HAS_BALLOTS");
          error.code = "EVENT_HAS_BALLOTS";
          return Promise.reject(error);
        }
        return null;
      },
    });
    render(<AdminHomePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Acciones de Test-Prueba-01" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Eliminar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar (desactivar)" }));
    expect(await screen.findByText("Solo se pueden eliminar eventos sin votación ni historial operativo.")).toBeInTheDocument();
  });

  it("permite ver eventos eliminados y reactivarlos", async () => {
    mockApi({
      events: [
        { id: "e1", name: "Visible", status: "CONFIGURING", active: true },
        { id: "e2", name: "Eliminado", status: "CONFIGURING", active: false },
      ],
      onRequest: (path, options) => path === "/api/v1/events/e2" && options?.method === "PATCH"
        ? Promise.resolve({ id: "e2", active: true })
        : null,
    });
    renderWithProvider();
    expect(await screen.findByRole("article", { name: "Visible" })).toBeInTheDocument();
    expect(screen.queryByRole("article", { name: "Eliminado" })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Ver eventos eliminados" }));
    const deletedCard = await screen.findByRole("article", { name: "Eliminado" });
    expect(within(deletedCard).getByText("Eliminado", { selector: ".status-pill" })).toBeInTheDocument();

    fireEvent.click(within(deletedCard).getByRole("button", { name: "Acciones de Eliminado" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reactivar" }));
    expect(await screen.findByRole("dialog", { name: "Reactivar Eliminado" })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Reactivar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v1/events/e2", {
      method: "PATCH",
      body: JSON.stringify({ active: true }),
    }));
    expect(await screen.findByText("Evento Eliminado reactivado.")).toBeInTheDocument();
  });

  it("crea un nuevo evento desde el modal accesible", async () => {
    mockApi({
      events: [],
      onRequest: (path, options) => path === "/api/v1/events" && options?.method === "POST"
        ? Promise.resolve({ id: "e99", name: "Carnaval Nuevo", status: "CONFIGURING" })
        : null,
    });
    render(<AdminHomePage />);
    expect(await screen.findByRole("heading", { name: "Todavía no hay eventos" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Crear primer evento" }));
    const dialog = await screen.findByRole("dialog", { name: "Nuevo evento" });
    fireEvent.change(within(dialog).getByRole("textbox", { name: "Nombre del evento" }), { target: { value: "Carnaval Nuevo" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Crear evento" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/api/v1/events", {
      method: "POST",
      body: JSON.stringify({ name: "Carnaval Nuevo" }),
    }));
    expect(await screen.findByText("Evento Carnaval Nuevo creado.")).toBeInTheDocument();
  });
});

describe("AdminHomePage global", () => {
  it("ADMIN conserva funciones globales aunque tenga adminEvents", async () => {
    mockApi();
    render(<AdminHomePage session={{ status: "authenticated", roles: ["ADMIN"], adminEvents: [{ id: "e1" }] }} />);
    await screen.findByRole("article", { name: "Test-Prueba-01" });
    expect(screen.getByRole("button", { name: /Crear evento/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Administrar evento/ })).toHaveLength(3);
    await waitFor(() => expect(apiRequest.mock.calls.map(([path]) => path)).toContain("/api/v1/judges"));
  });
});
