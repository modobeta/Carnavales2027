import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { VeedorMonitorPage } from "../pages/VeedorMonitorPage.jsx";
import { getPendingIncidents } from "../offline/veedor-incidents-store.js";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

const mockEvents = [
  {
    id: "event-1",
    name: "Carnaval Goya 2027",
    status: "OPEN",
    nights: [
      {
        id: "night-1",
        name: "Noche 1 - Competencia",
        status: "OPEN",
        votingStatus: "OPEN",
        counts: { OPEN: 1, SUBMITTED: 1, REOPENED: 0, REPLACED: 0 },
        total: 2,
      },
    ],
  },
];

const mockJudges = [
  {
    judgeProfileId: "judge-1",
    judgeName: "Ana Coreógrafa",
    judgeEmail: "ana@carnaval.test",
    specialtyId: "spec-1",
    specialtyName: "Danza y Coreografía",
    assignmentType: "PRIMARY",
    ballotId: "ballot-1",
    ballotStatus: "OPEN",
    totalScores: 10,
    resolvedScores: 7,
    progress: 70,
  },
];

const mockBallots = [
  {
    ballotId: "ballot-1",
    ballotStatus: "OPEN",
    judgeProfileId: "judge-1",
    judgeName: "Ana Coreógrafa",
    specialtyName: "Danza y Coreografía",
    totalItems: 10,
    scoredItems: 7,
    absentItems: 0,
    pendingItems: 3,
    troupes: [
      {
        troupeId: "troupe-1",
        troupeName: "Poramba",
        totalItems: 5,
        scoredItems: 5,
        absentItems: 0,
        pendingItems: 0,
      },
    ],
  },
  {
    ballotId: "ballot-2",
    ballotStatus: "SUBMITTED",
    judgeProfileId: "judge-2",
    judgeName: "Carlos Batería",
    specialtyName: "Batería",
    totalItems: 8,
    scoredItems: 8,
    absentItems: 0,
    pendingItems: 0,
    custodyStatus: null,
    troupes: [
      {
        troupeId: "troupe-1",
        troupeName: "Poramba",
        totalItems: 8,
        scoredItems: 8,
        absentItems: 0,
        pendingItems: 0,
      },
    ],
  },
];

const mockIncidents = [
  {
    id: "inc-1",
    incidentType: "UNSCORED_ITEM",
    description: "Falta rubricar ítem 4 en la comparsa Poramba",
    status: "OPEN",
    reportedByName: "Veedor Gómez",
    troupeName: "Poramba",
    specialtyName: "Danza y Coreografía",
    createdAt: new Date().toISOString(),
  },
];

const mockCustody = [
  {
    ballotId: "ballot-3",
    ballotStatus: "SUBMITTED",
    specialtyName: "Vestuario",
    judgeName: "María Diseños",
    custodyStatus: "RECEIVED",
    canonicalHash: "a".repeat(64),
    receivedByName: "Veedor Central",
    receivedAt: new Date().toISOString(),
    integrityStatus: "VERIFIED",
    custodyNotes: "Recibida y firmada conforme",
  },
];

describe("VeedorMonitorModule (Capítulo V - Veeduría Integral)", () => {
  beforeEach(() => {
    localStorage.clear();
    apiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/monitor/events") return mockEvents;
      if (path.includes("/judges")) return mockJudges;
      if (path.includes("/ballots") && !path.includes("/custody")) return mockBallots;
      if (path.includes("/incidents")) return mockIncidents;
      if (path.includes("/custody")) return mockCustody;
      return [];
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renderiza pestañas de navegación y permite explorar Jurados", async () => {
    render(<VeedorMonitorPage />);

    expect(await screen.findByRole("heading", { name: "Noche 1 - Competencia" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Resumen/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Jurados/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Planillas/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Incidencias/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Custodia/i })).toBeInTheDocument();

    // Navegar a Jurados
    fireEvent.click(screen.getByRole("tab", { name: /Jurados/i }));

    expect(await screen.findByText("Ana Coreógrafa")).toBeInTheDocument();
    expect(screen.getByText("70%")).toBeInTheDocument();
    expect(screen.getByText(/7 de 10 rubros resueltos/)).toBeInTheDocument();
  });

  it("renderiza la tabla de Planillas y permite iniciar custodia de planilla confirmada", async () => {
    render(<VeedorMonitorPage />);

    expect(await screen.findByRole("heading", { name: "Noche 1 - Competencia" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Planillas/i }));

    expect(await screen.findByText("Carlos Batería")).toBeInTheDocument();
    expect(screen.getByText("Poramba (5/5)")).toBeInTheDocument();

    // Botón para recibir custodia en la planilla confirmada
    const receiveBtn = screen.getByRole("button", { name: "Recibir custodia" });
    expect(receiveBtn).toBeInTheDocument();
    fireEvent.click(receiveBtn);

    // Modal de custodia
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Recepción Formal en Custodia")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Confirmar custodia y sellar" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        expect.stringContaining("/ballots/ballot-2/custody"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("gestiona Incidencias reglamentarias y permite abrir el formulario de reporte", async () => {
    render(<VeedorMonitorPage />);

    expect(await screen.findByRole("heading", { name: "Noche 1 - Competencia" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Incidencias/i }));

    expect(await screen.findByText("Falta rubricar ítem 4 en la comparsa Poramba")).toBeInTheDocument();
    expect(screen.getByText("Rubro sin puntuar")).toBeInTheDocument();

    // Abrir modal de reporte
    const addBtn = screen.getByRole("button", { name: "+ Registrar Incidencia" });
    fireEvent.click(addBtn);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Registrar Incidencia Reglamentaria")).toBeInTheDocument();

    // Llenar descripción y enviar
    const descInput = screen.getByPlaceholderText(/Detallar claramente lo observado/);
    fireEvent.change(descInput, { target: { value: "El jurado omitió firmar la planilla en papel" } });

    const submitBtn = screen.getByRole("button", { name: "Registrar incidencia" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(apiRequest).toHaveBeenCalledWith(
        expect.stringContaining("/incidents"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("El jurado omitió firmar la planilla en papel"),
        }),
      );
    });
  });

  it("muestra la pestaña Custodia con sello SHA-256 e integridad verificada", async () => {
    render(<VeedorMonitorPage />);

    expect(await screen.findByRole("heading", { name: "Noche 1 - Competencia" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /Custodia/i }));

    expect(await screen.findByText("🛡️ INTEGRIDAD VERIFICADA")).toBeInTheDocument();
    expect(screen.getByText(/María Diseños/)).toBeInTheDocument();
    expect(screen.getByText("a".repeat(64))).toBeInTheDocument();
    expect(screen.getByText(/Recibida y firmada conforme/)).toBeInTheDocument();
  });

  it("guarda incidencia offline cuando no hay conexión de red", async () => {
    // Simular offline
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);

    render(<VeedorMonitorPage />);
    expect(await screen.findByRole("heading", { name: "Noche 1 - Competencia" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Incidencias/i }));
    fireEvent.click(screen.getByRole("button", { name: "+ Registrar Incidencia" }));

    const descInput = screen.getByPlaceholderText(/Detallar claramente lo observado/);
    fireEvent.change(descInput, { target: { value: "Incidencia detectada sin señal de red" } });

    fireEvent.click(screen.getByRole("button", { name: "Registrar incidencia" }));

    await waitFor(() => {
      const pending = getPendingIncidents("event-1", "night-1");
      expect(pending.length).toBe(1);
      expect(pending[0].description).toBe("Incidencia detectada sin señal de red");
      expect(pending[0].isOfflinePending).toBe(true);
    });
  });
});
