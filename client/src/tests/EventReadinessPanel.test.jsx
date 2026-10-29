import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { EventReadinessPanel } from "../features/EventReadinessPanel.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

const readiness = (overrides = {}) => ({
  ready: true,
  missing: [],
  incompleteTroupes: [],
  incompleteRubrics: [],
  incompleteSchedules: [],
  incompleteNominations: [],
  nightsWithoutJury: [],
  ...overrides,
});

describe("EventReadinessPanel", () => {
  afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.clearAllMocks(); });

  it("muestra mensajes humanos para los faltantes", async () => {
    apiRequest.mockResolvedValue(readiness({
      ready: false,
      missing: ["ACTIVE_SPECIALTY", "ACTIVE_RUBRIC"],
      incompleteTroupes: [{ id: "t1", name: "Comparsa incompleta" }],
      incompleteRubrics: [{ id: "r1", name: "Coreografia", code: "COREO" }],
    }));
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} />);
    await screen.findByText(/Creá o activá al menos una especialidad/);
    expect(screen.getByText(/Creá o activá al menos un rubro/)).toBeInTheDocument();
    expect(screen.getByText(/Comparsa incompleta/)).toBeInTheDocument();
    expect(screen.getByText(/Coreografia/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir evento" })).toBeDisabled();
  });

  it("agrupa las nominaciones pendientes sin permitir abrir el evento", async () => {
    apiRequest.mockResolvedValue(readiness({
      ready: false,
      missing: ["INCOMPLETE_NOMINATIONS"],
      incompleteNominations: [
        { rubricId: "r1", troupeId: "t1", rubricName: "Reina", troupeName: "Estrella" },
        { rubricId: "r2", troupeId: "t1", rubricName: "Rey", troupeName: "Estrella" },
      ],
    }));
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} />);

    expect(await screen.findByText("Hay 2 faltantes en 1 comparsa.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir evento" })).toBeDisabled();
    expect(screen.getAllByText(/Falta un participante para/)).toHaveLength(2);
  });

  it("muestra ok cuando todo esta completo", async () => {
    apiRequest.mockResolvedValue(readiness());
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} />);
    expect(await screen.findByText(/Se cumplen los requisitos.*listo para abrir/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir evento" })).not.toBeDisabled();
  });

  it("no trata ready true sin las colecciones oficiales requeridas como readiness interpretable", async () => {
    apiRequest.mockResolvedValue({ ready: true, missing: [], incompleteTroupes: [], incompleteRubrics: [] });
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} />);

    expect(await screen.findByText(/No se pudo revisar la configuración/)).toBeInTheDocument();
    expect(screen.queryByText(/listo para abrir/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir evento" })).not.toBeInTheDocument();
    expect(apiRequest.mock.calls.some(([path]) => path.endsWith("/open"))).toBe(false);
  });

  it("rechaza como no interpretable una colección oficial con tipo inválido", async () => {
    apiRequest.mockResolvedValue({ ...readiness(), incompleteSchedules: null });
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} />);

    expect(await screen.findByText(/No se pudo revisar la configuración/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir evento" })).not.toBeInTheDocument();
    expect(apiRequest.mock.calls.some(([path]) => path.endsWith("/open"))).toBe(false);
  });

  it("notifica la apertura exitosa para bloquear la edicion", async () => {
    const onOpened = vi.fn();
    apiRequest
      .mockResolvedValueOnce(readiness())
      .mockImplementationOnce((_path, options) => Promise.resolve({ id: "e1", name: "Evento", status: "OPEN", operation: {
        operationId: options.headers["Idempotency-Key"], eventId: "e1", intent: "OPEN_EVENT", status: "applied",
      } }))
      .mockResolvedValueOnce(readiness());
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} onOpened={onOpened} />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir evento" }));
    const confirmButtons = await screen.findAllByRole("button", { name: "Abrir evento" });
    fireEvent.click(confirmButtons.at(-1));
    await waitFor(() => expect(onOpened).toHaveBeenCalled());
    expect(screen.getByRole("link", { name: "Continuar a Control de votación" })).toHaveAttribute("href", "#/admin/voting");
  });

  it("no abre sin confirmacion explicita", async () => {
    apiRequest.mockResolvedValueOnce(readiness());
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir evento" }));
    // El dialog de confirmación se abre pero no se confirma: solo el GET de readiness.
    expect(await screen.findByText(/estado cambiará a OPEN/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("reemplaza readiness con los detalles de un rechazo concurrente", async () => {
    apiRequest
      .mockResolvedValueOnce(readiness())
      .mockImplementationOnce((_path, options) => Promise.reject({
        code: "EVENT_CONFIGURATION_INCOMPLETE",
        details: { operation: { eventId: "e1", intent: "OPEN_EVENT", operationId: options.headers["Idempotency-Key"], status: "rejected" }, details: readiness({ ready: false, missing: ["ACTIVE_SPECIALTY"] }) },
      }));
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir evento" }));
    const confirmButtons = await screen.findAllByRole("button", { name: "Abrir evento" });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);
    expect(await screen.findByText(/Creá o activá al menos una especialidad/)).toBeInTheDocument();
  });

  it("ofrece una acción específica para cada faltante", async () => {
    const onGoToNights = vi.fn();
    apiRequest.mockResolvedValue(readiness({
      ready: false,
      missing: ["COMPETITION_NIGHT", "ACTIVE_SPECIALTY"],
      incompleteTroupes: [{ id: "t1", name: "Comparsa incompleta" }],
      incompleteRubrics: [{ id: "r1", name: "Coreografia", code: "COREO" }],
    }));
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} onGoToNights={onGoToNights} />);
    await screen.findByText(/Comparsa incompleta/);
    expect(screen.getByRole("link", { name: "Ir al problema" })).toHaveAttribute("href", "#/admin/competencia?step=especialidades");
    expect(screen.getByRole("link", { name: "Corregir comparsa" })).toHaveAttribute("href", "#/admin/competencia?step=participantes");
    expect(screen.getByRole("link", { name: "Corregir evaluación" })).toHaveAttribute("href", "#/admin/competencia?step=rubros");
    fireEvent.click(screen.getByRole("button", { name: "Ir al problema" }));
    expect(onGoToNights).toHaveBeenCalledTimes(1);
  });

  it("presenta el jurado pendiente como aviso con acceso a la jornada, no como bloqueo del evento", async () => {
    apiRequest.mockResolvedValue(readiness({
      ready: true,
      missing: [],
      nightsWithoutJury: [{ nightId: "n1", nightName: "Noche inaugural" }],
    }));
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} />);

    await screen.findByRole("button", { name: "Abrir evento" });
    expect(screen.getByRole("link", { name: "Control de votación" }).parentElement.textContent).toMatch(/Noche inaugural.*todavía no tiene jurados/);
    expect(screen.getByRole("link", { name: "Control de votación" })).toHaveAttribute("href", "#/admin/voting?nightId=n1");
    expect(screen.getByRole("button", { name: "Abrir evento" })).toBeEnabled();
  });

  it("confirma la apertura nombrando el evento y envía una sola operación identificada", async () => {
    apiRequest
      .mockResolvedValueOnce(readiness())
      .mockImplementationOnce((_path, options) => Promise.resolve({ id: "e1", name: "Noche de Carnaval", status: "OPEN", operation: {
        eventId: "e1", intent: "OPEN_EVENT", operationId: options.headers["Idempotency-Key"], status: "applied",
      } }));
    render(<EventReadinessPanel event={{ id: "e1", name: "Noche de Carnaval", status: "CONFIGURING", active: true }} locked={false} />);

    fireEvent.click(await screen.findByRole("button", { name: "Abrir evento" }));
    expect(await screen.findByRole("dialog", { name: "Abrir evento" })).toHaveTextContent("Noche de Carnaval");
    expect(screen.getByRole("dialog")).toHaveTextContent(/OPEN/);
    fireEvent.click(screen.getAllByRole("button", { name: "Abrir evento" }).at(-1));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    const [path, options] = apiRequest.mock.calls[1];
    expect(path).toBe("/api/v1/events/e1/open");
    expect(options.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(apiRequest.mock.calls.filter(([url]) => url.endsWith("/open")).length).toBe(1);
  });

  it("mantiene el resultado sin confirmar y bloquea otra apertura cuando el lookup no encuentra la operación", async () => {
    localStorage.setItem("event-open-operation:e1", JSON.stringify({ eventId: "e1", intent: "OPEN_EVENT", operationId: "pending-operation" }));
    apiRequest
      .mockRejectedValueOnce({ code: "OPEN_OPERATION_NOT_FOUND", status: 404 })
      .mockResolvedValueOnce(readiness());
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento" , status: "CONFIGURING", active: true }} locked={false} />);

    expect(await screen.findByText(/resultado no confirmado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir evento" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Consultar resultado/i })).toBeEnabled();
    expect(apiRequest.mock.calls.some(([url]) => url === "/api/v1/events/e1")).toBe(false);
  });

  it("si el evento ya está abierto, ofrece continuar sin presentarlo como pendiente de apertura", async () => {
    apiRequest.mockResolvedValue(readiness());
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "OPEN" }} locked={false} />);

    expect(await screen.findByText(/La competencia está abierta/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continuar a Control de votación" })).toHaveAttribute("href", "#/admin/voting");
    expect(screen.queryByRole("button", { name: "Abrir evento" })).not.toBeInTheDocument();
    expect(screen.queryByText(/listo para abrir/)).not.toBeInTheDocument();
  });

  it("permite reconsultar readiness tras un error de lectura sin abrir automáticamente", async () => {
    apiRequest.mockRejectedValueOnce({ code: "NETWORK_ERROR" })
      .mockResolvedValueOnce(readiness());
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} />);

    expect(await screen.findByText(/No se pudo revisar la configuración/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Abrir evento" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Volver a revisar" }));
    expect(await screen.findByText(/Se cumplen los requisitos.*listo para abrir/)).toBeInTheDocument();
    expect(apiRequest).toHaveBeenCalledTimes(2);
    expect(apiRequest.mock.calls.every(([url]) => !url.endsWith("/open"))).toBe(true);
  });

  it("conserva la misma operación tras timeout y solo confirma OPEN al reconciliar el recibo", async () => {
    const onOpened = vi.fn();
    let openingRequest;
    apiRequest
      .mockResolvedValueOnce(readiness())
      .mockImplementationOnce((_path, options) => {
        openingRequest = options;
        return Promise.reject({ code: "NETWORK_ERROR", status: 0 });
      })
      .mockImplementationOnce((path) => Promise.resolve({
        operationId: path.split("/").at(-1), eventId: "e1", intent: "OPEN_EVENT", status: "applied",
        result: { event: { id: "e1", name: "Evento", status: "OPEN" } },
      }));
    render(<EventReadinessPanel event={{ id: "e1", name: "Evento", status: "CONFIGURING", active: true }} locked={false} onOpened={onOpened} />);

    fireEvent.click(await screen.findByRole("button", { name: "Abrir evento" }));
    const confirmButton = (await screen.findAllByRole("button", { name: "Abrir evento" })).at(-1);
    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(await screen.findByText(/resultado no confirmado/i)).toBeInTheDocument();
    expect(localStorage.getItem("event-open-operation:e1")).toContain(openingRequest.headers["Idempotency-Key"]);
    expect(onOpened).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Abrir evento" })).toBeDisabled();
    expect(apiRequest.mock.calls.filter(([url]) => url.endsWith("/open")).length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Consultar resultado de apertura" }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith({ id: "e1", name: "Evento", status: "OPEN" }));
    expect(localStorage.getItem("event-open-operation:e1")).toBeNull();
    expect(apiRequest.mock.calls.some(([url]) => url === "/api/v1/events/e1")).toBe(false);
  });
});
