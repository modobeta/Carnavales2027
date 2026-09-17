import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../api/http.js";
import { JudgeBallotPage } from "../pages/JudgeBallotPage.jsx";

vi.mock("../api/http.js", () => ({
  ApiError: class ApiError extends Error {
    constructor({ code, details }) { super(code); this.code = code; this.details = details; }
  },
  apiRequest: vi.fn(),
}));

const ballot = {
  id: "ballot-1", nightName: "Noche 1", specialtyName: "Baile", status: "OPEN", revision: 0,
  scores: [
    { id: "score-1", nightScheduleId: "schedule-1", presentationOrder: 1, troupeName: "Comparsa Uno", rubricId: "rubric-1", rubricName: "Reina", itemName: "Presencia", score: null, evaluationState: "PENDING", status: "DRAFT" },
    { id: "score-2", nightScheduleId: "schedule-2", presentationOrder: 2, troupeName: "Comparsa Dos", rubricId: "rubric-1", rubricName: "Reina", itemName: "Presencia", score: null, evaluationState: "PENDING", status: "DRAFT" },
  ],
};

function onlineApi() {
  apiRequest.mockImplementation((path, options) => {
    if (!options) return Promise.resolve(ballot);
    if (path.endsWith("/scores/score-1")) return Promise.resolve({ id: "score-1", evaluationState: "NOT_PRESENTED", score: 0, status: "DRAFT", revision: 1 });
    if (path.endsWith("/scores/score-2")) return Promise.resolve({ id: "score-2", evaluationState: "SCORED", score: 8, status: "DRAFT", revision: 2 });
    if (path.endsWith("/submit")) return Promise.resolve({ status: "SUBMITTED", revision: 3 });
    return Promise.resolve({});
  });
}

describe("JudgeBallotPage", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("muestra solo faltantes anteriores al ítem actual y permite volver a ellos", async () => {
    const scores = [
      ["Omitido", "PENDING"], ["Votado", "SCORED"], ["Ausente", "NOT_PRESENTED"],
      ["Actual", "PENDING"], ["Futuro", "PENDING"],
    ].map(([itemName, evaluationState], index) => ({
      ...ballot.scores[0], id: `score-${index}`, itemName, evaluationState,
      score: evaluationState === "SCORED" ? 8 : evaluationState === "NOT_PRESENTED" ? 0 : null,
    }));
    apiRequest.mockResolvedValue({ ...ballot, scores });
    render(<JudgeBallotPage ballotId="ballot-1" />);
    await screen.findByRole("button", { name: "Faltantes anteriores (0)" });
    for (let index = 0; index < 3; index += 1) fireEvent.click(screen.getByRole("button", { name: "Ítem siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Faltantes anteriores (1)" }));
    const modal = within(screen.getByRole("dialog", { name: "Faltantes anteriores" }));
    expect(modal.getByText("Omitido")).toBeInTheDocument();
    for (const name of ["Votado", "Ausente", "Actual", "Futuro"]) expect(modal.queryByText(name)).not.toBeInTheDocument();
    fireEvent.click(modal.getByRole("button", { name: /Omitido/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Comparsa Uno: Omitido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Faltantes anteriores (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar votación" })).toBeDisabled();
  });

  it("no incluye el ítem actual ni futuros cuando no hay faltantes anteriores", async () => {
    apiRequest.mockResolvedValue(ballot);
    render(<JudgeBallotPage ballotId="ballot-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Faltantes anteriores (0)" }));
    const modal = within(screen.getByRole("dialog", { name: "Faltantes anteriores" }));
    expect(modal.getByText("No tenés ítems anteriores sin votar.")).toBeInTheDocument();
    expect(modal.queryByText("Presencia")).not.toBeInTheDocument();
    expect(modal.queryByText(/Podés confirmar/)).not.toBeInTheDocument();
    fireEvent.click(modal.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(screen.getByRole("button", { name: "Ítem siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Faltantes anteriores (1)" }));
    const nextModal = within(screen.getByRole("dialog", { name: "Faltantes anteriores" }));
    expect(nextModal.getByText("Comparsa Uno")).toBeInTheDocument();
    expect(nextModal.queryByText("Comparsa Dos")).not.toBeInTheDocument();
  });

  it("confirma decisiones y planilla exclusivamente mediante API online", async () => {
    onlineApi();
    render(<JudgeBallotPage ballotId="ballot-1" />);
    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });

    expect(screen.getByRole("button", { name: "Confirmar votación" })).toBeDisabled();
    expect(screen.getAllByRole("progressbar")).toHaveLength(2);
    expect(screen.getByRole("progressbar", { name: "Comparsa: Comparsa Uno" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("progressbar", { name: "0 de 2 puntuaciones completadas" })).toHaveAttribute("aria-valuemax", "2");

    fireEvent.click(screen.getAllByRole("button", { name: "No se presentó" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/judge/ballots/ballot-1/scores/score-1",
      expect.objectContaining({ method: "PUT" }),
    ));

    // Modelo un-ítem-por-vez (Fase 1): avanzar a la tarjeta del segundo ítem
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Comparsa: Comparsa Uno" })).toHaveAttribute("aria-valuenow", "1"));
    expect(screen.getByRole("progressbar", { name: "1 de 2 puntuaciones completadas" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("button", { name: "Confirmar votación" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Ítem siguiente" }));
    expect(screen.getByRole("progressbar", { name: "Comparsa: Comparsa Dos" })).toHaveAttribute("aria-valuenow", "0");
    const secondScore = screen.getByLabelText("Comparsa Dos: Presencia");
    fireEvent.click(within(secondScore).getByRole("button", { name: "Votar 8" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Confirmación de voto" })).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/judge/ballots/ballot-1/scores/score-2",
      expect.objectContaining({ method: "PUT" }),
    ));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar votación" })).toBeEnabled());
    expect(screen.getByRole("progressbar", { name: "2 de 2 puntuaciones completadas" })).toHaveAttribute("aria-valuenow", "2");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar votación" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar y cerrar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/judge/ballots/ballot-1/submit",
      { method: "POST" },
    ));
    expect(await screen.findByRole("region", { name: "Planilla confirmada" })).toBeInTheDocument();
    expect(screen.queryByText(/pendiente de sincronización/i)).not.toBeInTheDocument();
  });

  it("conserva el ítem pendiente cuando no hay conexión", async () => {
    apiRequest.mockImplementation((path, options) => {
      if (!options) return Promise.resolve(ballot);
      if (path.includes("/scores/")) return Promise.reject(new ApiError({ code: "NETWORK_ERROR" }));
      return Promise.resolve({});
    });
    render(<JudgeBallotPage ballotId="ballot-1" />);
    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });
    fireEvent.click(screen.getAllByRole("button", { name: "No se presentó" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(/no hay conexión/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar votación" })).toBeDisabled();
    expect(screen.getByRole("progressbar", { name: "0 de 2 puntuaciones completadas" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("group", { name: "Comparsa Uno: Presencia" })).toBeInTheDocument();
  });

  it("muestra pendientes sin enviar una confirmación incompleta", async () => {
    apiRequest.mockResolvedValue(ballot);
    render(<JudgeBallotPage ballotId="ballot-1" />);
    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar votación" }));
    expect(screen.getByRole("button", { name: "Confirmar votaci\u00f3n" })).toBeDisabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(apiRequest).not.toHaveBeenCalledWith("/api/v1/judge/ballots/ballot-1/submit", { method: "POST" });
  });

  it("muestra pendientes si el servidor rechaza la confirmación", async () => {
    const complete = { ...ballot, scores: ballot.scores.map((score) => ({ ...score, score: 8, evaluationState: "SCORED" })) };
    apiRequest.mockImplementation((path, options) => {
      if (!options) return Promise.resolve(complete);
      if (path.endsWith("/submit")) return Promise.reject(new ApiError({ code: "BALLOT_INCOMPLETE", details: [{ id: "score-1", name: "Presencia", code: "PRESENCIA" }] }));
      return Promise.resolve({});
    });
    render(<JudgeBallotPage ballotId="ballot-1" />);
    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar votación" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar y cerrar" }));
    expect(await screen.findByRole("dialog", { name: "Faltan decisiones por resolver" })).toBeInTheDocument();
  });

  it("bloquea acceso directo por URL a una comparsa en espera y redirige a la comparsa activa (RF-191)", async () => {
    apiRequest.mockResolvedValue(ballot);
    render(<JudgeBallotPage ballotId="ballot-1" troupeId="schedule-2" />);

    expect(await screen.findByRole("heading", { name: "Comparsa en espera de pasada", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Debes calificar y confirmar los rubros de/i)).toBeInTheDocument();
    expect(screen.getByText("Comparsa Uno")).toBeInTheDocument();

    expect(screen.queryByRole("group", { name: "Comparsa Dos: Presencia" })).not.toBeInTheDocument();

    const redirectLink = screen.getByRole("link", { name: /Ir a comparsa actual/i });
    expect(redirectLink).toHaveAttribute("href", "#/judge/ballot?ballotId=ballot-1&troupeId=schedule-1");

    fireEvent.click(redirectLink);

    expect(screen.queryByRole("heading", { name: "Comparsa en espera de pasada" })).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 })).toBeInTheDocument();
  });

  it("despliega banner de continuidad al completar el último ítem de una comparsa y avanza a la siguiente (RF-192)", async () => {
    onlineApi();
    render(<JudgeBallotPage ballotId="ballot-1" troupeId="schedule-1" />);
    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });

    fireEvent.click(screen.getAllByRole("button", { name: "No se presentó" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    const banner = await screen.findByRole("region", { name: "Pasada completada" });
    expect(within(banner).getByText(/¡Completaste la evaluación de Comparsa Uno!/i)).toBeInTheDocument();
    expect(within(banner).getByText(/Siguiente comparsa en pista:/i)).toBeInTheDocument();
    expect(within(banner).getByText("Comparsa Dos")).toBeInTheDocument();

    const nextBtn = within(banner).getByRole("button", { name: /Comenzar siguiente pasada/i });
    fireEvent.click(nextBtn);

    expect(screen.queryByRole("region", { name: "Pasada completada" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Comparsa Dos: Presencia" })).toBeInTheDocument();
  });

  it("muestra comparsa posterior como bloqueada en la barra lateral y en la lista (RF-190, RF-191)", async () => {
    apiRequest.mockResolvedValue(ballot);
    render(<JudgeBallotPage ballotId="ballot-1" troupeId="schedule-1" />);
    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });

    const sidebarItems = screen.getAllByRole("button", { name: /Comparsa/ });
    const comparsaDosSidebar = sidebarItems.find((el) => el.textContent.includes("Comparsa Dos"));
    expect(comparsaDosSidebar).toBeDisabled();
    expect(comparsaDosSidebar).toHaveAttribute("aria-disabled", "true");

    // Modelo un-ítem-por-vez (Fase 1): la tarjeta bloqueada se ve al navegar al ítem
    fireEvent.click(screen.getByRole("button", { name: "Ítem siguiente" }));
    expect(screen.getByText(/Se habilitará automáticamente al completar la comparsa anterior \(Comparsa Uno\)/i)).toBeInTheDocument();
  });

  it("en readonly muestra resumen sin grilla de voto ni navegación (Fase 3)", async () => {
    const submitted = { ...ballot, status: "SUBMITTED" };
    apiRequest.mockResolvedValue(submitted);
    render(<JudgeBallotPage ballotId="ballot-1" />);

    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });
    expect(screen.getByRole("region", { name: "Planilla confirmada" })).toBeInTheDocument();

    // Resumen de lectura con los ítems y sus valores
    const summary = screen.getByRole("region", { name: "Resumen de la planilla" });
    expect(summary).toHaveTextContent("Comparsa Uno");
    expect(summary).toHaveTextContent("Comparsa Dos");
    expect(screen.getByText(/solo para consulta/)).toBeInTheDocument();

    // Sin grilla 1–10 (ni siquiera deshabilitada) y sin navegación por ítems
    expect(screen.queryByRole("button", { name: /Votar \d/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No se presentó" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navegación de planilla" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Faltantes/ })).not.toBeInTheDocument();
  });
});
