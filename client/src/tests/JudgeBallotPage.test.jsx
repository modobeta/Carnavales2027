import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../api/http.js";
import { JudgeBallotPage } from "../pages/JudgeBallotPage.jsx";
import { SessionProvider } from "../auth/session-context.jsx";

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
    expect(screen.getByRole("progressbar", { name: "Avance de la comparsa" })).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByRole("progressbar", { name: "Avance de la planilla" })).toHaveAttribute("aria-valuemax", "2");

    fireEvent.click(screen.getAllByRole("button", { name: "No se presentó este rubro" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/judge/ballots/ballot-1/scores/score-1",
      expect.objectContaining({ method: "PUT" }),
    ));

    // Modelo un-ítem-por-vez (Fase 1): el banner de continuidad es la única vía
    // a la siguiente comparsa (sin Siguiente duplicado mientras está abierto).
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Avance de la comparsa" })).toHaveAttribute("aria-valuenow", "1"));
    expect(screen.getByRole("progressbar", { name: "Avance de la planilla" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("button", { name: "Confirmar votación" })).toBeDisabled();
    const continuity = await screen.findByRole("region", { name: "Pasada completada" });
    fireEvent.click(within(continuity).getByRole("button", { name: /Comenzar siguiente pasada/i }));
    expect(screen.getByRole("progressbar", { name: "Avance de la comparsa" })).toHaveAttribute("aria-valuenow", "0");
    const secondScore = screen.getByLabelText("Comparsa Dos: Presencia");
    fireEvent.click(within(secondScore).getByRole("button", { name: "Votar 8" }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Confirmación de voto" })).getByRole("button", { name: "Confirmar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/judge/ballots/ballot-1/scores/score-2",
      expect.objectContaining({ method: "PUT" }),
    ));

    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar votación" })).toBeEnabled());
    expect(screen.getByRole("progressbar", { name: "Avance de la planilla" })).toHaveAttribute("aria-valuenow", "2");
    // Sello de puntaje confirmado en grande + indicador de guardado en servidor.
    expect(screen.getByText("8", { selector: ".sealed-score-value" })).toBeInTheDocument();
    expect(screen.getByText("☁✓")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar votación" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar y cerrar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/judge/ballots/ballot-1/submit",
      { method: "POST" },
    ));
    expect(await screen.findByRole("region", { name: "Planilla confirmada" })).toBeInTheDocument();
    expect(screen.queryByText(/pendiente de sincronización/i)).not.toBeInTheDocument();
  });

  it("muestra un único título principal con h1 de apoyo, NP con alerta y modal sólido", async () => {
    apiRequest.mockResolvedValue(ballot);
    render(<JudgeBallotPage ballotId="ballot-1" />);
    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });

    // h1 de apoyo (no compite con el h2 principal de la tarjeta).
    expect(document.querySelector("h1.ballot-header-support")).toBeInTheDocument();
    // Etiquetas de progreso neutras, sin repetir el nombre de la comparsa.
    expect(screen.getByRole("progressbar", { name: "Avance de la comparsa" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Avance de la planilla" })).toBeInTheDocument();

    // Botón de excepción con ícono de alerta.
    const npBtn = screen.getAllByRole("button", { name: "No se presentó este rubro" })[0];
    expect(within(npBtn).getByText("⚠")).toBeInTheDocument();

    // Modal con el valor en pastilla sólida.
    fireEvent.click(screen.getAllByRole("button", { name: "Votar 8" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Confirmación de voto" });
    expect(within(dialog).getByText("8", { selector: ".confirm-score-value" })).toBeInTheDocument();
  });

  it("conserva el ítem pendiente cuando no hay conexión", async () => {
    apiRequest.mockImplementation((path, options) => {
      if (!options) return Promise.resolve(ballot);
      if (path.includes("/scores/")) return Promise.reject(new ApiError({ code: "NETWORK_ERROR" }));
      return Promise.resolve({});
    });
    render(<JudgeBallotPage ballotId="ballot-1" />);
    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });
    fireEvent.click(screen.getAllByRole("button", { name: "No se presentó este rubro" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText(/no hay conexión/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar votación" })).toBeDisabled();
    expect(screen.getByRole("progressbar", { name: "Avance de la planilla" })).toHaveAttribute("aria-valuenow", "0");
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

    fireEvent.click(screen.getAllByRole("button", { name: "No se presentó este rubro" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    const banner = await screen.findByRole("region", { name: "Pasada completada" });
    expect(within(banner).getByText(/¡Completaste la evaluación de Comparsa Uno!/i)).toBeInTheDocument();
    expect(within(banner).getByText(/Siguiente comparsa en pista:/i)).toBeInTheDocument();
    expect(within(banner).getByText("Comparsa Dos")).toBeInTheDocument();

    // Sin duplicar el avance: el banner es la única vía a la siguiente comparsa.
    expect(screen.queryByRole("button", { name: "Ítem siguiente" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ítem anterior" })).toBeInTheDocument();

    const nextBtn = within(banner).getByRole("button", { name: /Comenzar siguiente pasada/i });
    fireEvent.click(nextBtn);

    expect(screen.queryByRole("region", { name: "Pasada completada" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Comparsa Dos: Presencia" })).toBeInTheDocument();
  });

  it("tras cerrar el banner de continuidad vuelve el Siguiente genérico", async () => {
    onlineApi();
    render(<JudgeBallotPage ballotId="ballot-1" troupeId="schedule-1" />);
    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });

    fireEvent.click(screen.getAllByRole("button", { name: "No se presentó este rubro" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));

    const banner = await screen.findByRole("region", { name: "Pasada completada" });
    fireEvent.click(within(banner).getByRole("button", { name: "Cerrar aviso de continuidad" }));

    expect(screen.queryByRole("region", { name: "Pasada completada" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ítem siguiente" })).toBeInTheDocument();
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

    await screen.findByRole("heading", { name: /Comparsa Uno/, level: 2 });
    expect(screen.getByRole("region", { name: "Planilla confirmada" })).toBeInTheDocument();

    // Resumen de lectura con los ítems y sus valores
    const summary = screen.getByRole("region", { name: "Resumen de la planilla" });
    expect(summary).toHaveTextContent("Comparsa Uno");
    expect(summary).toHaveTextContent("Comparsa Dos");
    expect(screen.getByText(/solo para consulta/)).toBeInTheDocument();

    // Sin grilla 1–10 (ni siquiera deshabilitada) y sin navegación por ítems
    expect(screen.queryByRole("button", { name: /Votar \d/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "No se presentó este rubro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Navegación de planilla" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Faltantes/ })).not.toBeInTheDocument();
  });

  it("la planilla confirmada muestra héroe con total, índice y subtotales por comparsa", async () => {
    const submitted = {
      ...ballot,
      status: "SUBMITTED",
      scores: ballot.scores.map((s, i) => ({ ...s, evaluationState: "SCORED", score: 7 + i })),
    };
    apiRequest.mockResolvedValue(submitted);
    render(<JudgeBallotPage ballotId="ballot-1" />);

    const summary = await screen.findByRole("region", { name: "Resumen de la planilla" });
    // Héroe con el total general (7 + 8 = 15).
    expect(within(summary).getByText("15", { selector: "strong" })).toBeInTheDocument();
    expect(within(summary).getByText(/puntos en total/)).toBeInTheDocument();
    // Índice rápido con una vía por comparsa.
    const index = screen.getByRole("navigation", { name: "Ir a una comparsa" });
    expect(within(index).getByRole("button", { name: "Ir a Comparsa Uno" })).toBeInTheDocument();
    expect(within(index).getByRole("button", { name: "Ir a Comparsa Dos" })).toBeInTheDocument();
    // Subtotales por tarjeta.
    expect(screen.getByLabelText("Subtotal: 7 puntos")).toBeInTheDocument();
    expect(screen.getByLabelText("Subtotal: 8 puntos")).toBeInTheDocument();
  });

  it("las tarjetas de la planilla confirmada son desplegables y arrancan con poco ruido", async () => {
    const submitted = {
      ...ballot,
      status: "SUBMITTED",
      scores: ballot.scores.map((s) => ({ ...s, evaluationState: "SCORED", score: 7 })),
    };
    apiRequest.mockResolvedValue(submitted);
    render(<JudgeBallotPage ballotId="ballot-1" />);

    await screen.findByRole("region", { name: "Resumen de la planilla" });
    // Por defecto: primera abierta, segunda colapsada.
    expect(screen.getByRole("button", { name: "Ocultar votaciones de Comparsa Uno" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ampliar votaciones de Comparsa Dos" })).toBeInTheDocument();
    expect(document.getElementById("readonly-group-schedule-1").className).toMatch(/is-open/);
    expect(document.getElementById("readonly-group-schedule-2").className).toMatch(/is-collapsed/);

    // Colapsar la primera y ampliar la segunda.
    fireEvent.click(screen.getByRole("button", { name: "Ocultar votaciones de Comparsa Uno" }));
    expect(screen.getByRole("button", { name: "Ampliar votaciones de Comparsa Uno" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ampliar votaciones de Comparsa Dos" }));
    expect(screen.getByRole("button", { name: "Ocultar votaciones de Comparsa Dos" })).toBeInTheDocument();
  });

  it("al entrar con troupeId aterriza en el primer pendiente, no en notas ya votadas", async () => {
    const mixed = {
      ...ballot,
      scores: [
        { ...ballot.scores[0], id: "s1-a", itemName: "Ya votado", evaluationState: "SCORED", score: 8 },
        { ...ballot.scores[0], id: "s1-b", nightScheduleId: "schedule-1", itemName: "Pendiente actual", evaluationState: "PENDING", score: null },
        { ...ballot.scores[1], id: "s2-a" },
      ],
    };
    apiRequest.mockResolvedValue(mixed);
    render(<JudgeBallotPage ballotId="ballot-1" troupeId="schedule-1" />);
    // La tarjeta visible es el pendiente, no el ya votado
    expect(await screen.findByRole("heading", { name: "Pendiente actual", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ya votado" })).not.toBeInTheDocument();
  });

  it("en readonly resalta la comparsa pedida por troupeId dentro de la planilla completa", async () => {
    const submitted = {
      ...ballot,
      status: "SUBMITTED",
      scores: ballot.scores.map((s) => ({ ...s, evaluationState: "SCORED", score: 7 })),
    };
    apiRequest.mockResolvedValue(submitted);
    render(<JudgeBallotPage ballotId="ballot-1" troupeId="schedule-2" />);
    const selected = await screen.findByText(/Mostrando la sección de/);
    expect(selected).toHaveTextContent("Comparsa Dos");
    const group = document.getElementById("readonly-group-schedule-2");
    expect(group).not.toBeNull();
    expect(group.className).toMatch(/is-selected/);
    expect(group.getAttribute("aria-current")).toBe("true");
    // Header muestra la comparsa seleccionada, no la primera
    expect(screen.getByRole("heading", { name: "Comparsa Dos", level: 1 })).toBeInTheDocument();
  });

  it("redirige al login con aviso de sesión expirada si la sesión venció a mitad de votación", async () => {
    window.location.hash = "#/judge/ballot?ballotId=ballot-1&troupeId=schedule-1";
    apiRequest.mockRejectedValue({ code: "UNAUTHENTICATED" });
    render(<SessionProvider><JudgeBallotPage ballotId="ballot-1" troupeId="schedule-1" /></SessionProvider>);
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/login\?reason=session-expired/));
    expect(window.location.hash).toContain("returnTo=");
    expect(window.location.hash).toContain("ballot-1");
  });

  it("el modal de cierre habla de la planilla completa con todas las comparsas", async () => {
    const complete = { ...ballot, scores: ballot.scores.map((s) => ({ ...s, evaluationState: "SCORED", score: 7 })) };
    apiRequest.mockImplementation((path, options) => {
      if (!options) return Promise.resolve(complete);
      if (path.endsWith("/submit")) return Promise.resolve({ status: "SUBMITTED", revision: 1 });
      return Promise.resolve({});
    });
    render(<JudgeBallotPage ballotId="ballot-1" />);
    await screen.findByRole("heading", { name: "Comparsa Uno", level: 2 });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar votación" }));
    const dialog = await screen.findByRole("dialog", { name: "Cierre definitivo de planilla" });
    expect(within(dialog).getByText(/No se cierra una sola comparsa/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Comparsa Uno/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Comparsa Dos/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/cerrar la comparsa 2/i)).not.toBeInTheDocument();
  });
});
