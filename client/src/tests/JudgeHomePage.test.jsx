import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { JudgeHomePage } from "../pages/JudgeHomePage.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

describe("JudgeHomePage", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("aclara que un jurado registrado todavía no tiene planillas habilitadas", () => {
    render(<JudgeHomePage session={{ judgeProfile: { registrationStatus: "REGISTERED" } }} />);
    expect(screen.getByText(/no tenés planillas habilitadas/)).toBeInTheDocument();
    expect(screen.queryByText(/puntuar comparsa/i)).not.toBeInTheDocument();
  });

  it("muestra suspensión sin capacidades operativas", () => {
    render(<JudgeHomePage session={{ judgeProfile: { registrationStatus: "SUSPENDED" } }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Acceso suspendido");
  });

  it("deriva el progreso y el estado de cada planilla desde sus decisiones", async () => {
    apiRequest.mockImplementation((path) => {
      if (path.startsWith("/api/v1/judge/ballots")) {
        if (path.endsWith("ballot-1")) return Promise.resolve({ scores: [
          { nightScheduleId: "schedule-1", troupeName: "Ara Berá", presentationOrder: 1, evaluationState: "SCORED" },
          { nightScheduleId: "schedule-1", troupeName: "Ara Berá", presentationOrder: 1, evaluationState: "PENDING" },
        ] });
        if (path.endsWith("ballot-2")) return Promise.resolve({ scores: [
          { nightScheduleId: "schedule-2", troupeName: "Porambá", presentationOrder: 2, evaluationState: "SCORED" },
        ] });
        return Promise.resolve([
          { id: "ballot-1", eventName: "Carnaval", nightName: "Noche 1", specialtyName: "Baile", status: "OPEN" },
          { id: "ballot-2", eventName: "Carnaval", nightName: "Noche 2", specialtyName: "Vestuario", status: "SUBMITTED" },
        ]);
      }
      return Promise.resolve({});
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    expect(await screen.findByText("En progreso")).toBeInTheDocument();
    expect(screen.getByText(/^Planilla confirmada/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ara Berá", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continuar/ })).toHaveAttribute("href", "#/judge/ballot?ballotId=ballot-1&troupeId=schedule-1");
    expect(screen.getByRole("region", { name: "Progreso general" })).toHaveTextContent("Avance de tus planillas");
  });

  it("renderiza progreso y comparsas directamente con include=progress sin llamadas N+1 (RF-183)", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/judge/ballots?include=progress") {
        return Promise.resolve([
          {
            id: "ballot-1",
            eventName: "Carnaval Goya",
            nightName: "Noche 1",
            specialtyName: "Baile",
            status: "OPEN",
            totalScores: 4,
            resolvedScores: 2,
            troupes: [
              {
                troupeId: "sched-1",
                troupeName: "Ara Berá",
                brandColor: "#10B981",
                presentationOrder: 1,
                total: 2,
                resolved: 2,
              },
              {
                troupeId: "sched-2",
                troupeName: "Sapucay",
                brandColor: "#3B82F6",
                presentationOrder: 2,
                total: 2,
                resolved: 0,
              },
            ],
          },
        ]);
      }
      return Promise.reject(new Error(`Llamada inesperada: ${path}`));
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    expect(await screen.findByRole("heading", { name: "Ara Berá", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sapucay", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Progreso general" })).toHaveTextContent("1 de 2 comparsas");
    expect(screen.getByRole("progressbar", { name: "Comparsas puntuadas" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("progressbar", { name: "Comparsas puntuadas" })).toHaveAttribute("aria-valuemax", "2");
    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(apiRequest).toHaveBeenCalledWith("/api/v1/judge/ballots?include=progress");
  });

  it.each([0, 1, 2])("cuenta %s de 2 comparsas puntuadas sin confundir puntuación con cierre", async (scored) => {
    apiRequest.mockResolvedValue([{
      id: "ballot-progress", nightName: "Noche 1", specialtyName: "Baile", status: "OPEN",
      troupes: [0, 1].map((index) => ({
        troupeId: `schedule-${index}`, troupeName: `Comparsa ${index + 1}`,
        presentationOrder: index + 1, total: 2, resolved: index < scored ? 2 : index === scored ? 1 : 0,
      })),
    }]);
    render(<JudgeHomePage session={{ user: { id: "judge-1" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);
    const progress = await screen.findByRole("progressbar", { name: "Comparsas puntuadas" });
    expect(progress).toHaveAttribute("aria-valuenow", String(scored));
    expect(progress).toHaveAttribute("aria-valuemax", "2");
    expect(screen.getByRole("region", { name: "Progreso general" })).toHaveTextContent(`${scored} de 2 comparsas`);
    expect(screen.queryByText("Votación completada")).not.toBeInTheDocument();
    if (scored === 2) expect(screen.getByRole("region", { name: "Progreso general" })).toHaveTextContent("cierre pendiente");
  });

  it("muestra un círculo con el color asignado cuando no hay logo", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/judge/ballots?include=progress") {
        return Promise.resolve([
          {
            id: "ballot-1", eventName: "Carnaval Goya", nightName: "Noche 1", specialtyName: "Música",
            status: "OPEN", totalScores: 2, resolvedScores: 0,
            troupes: [{ troupeId: "sched-1", eventTroupeId: "troupe-1", troupeName: "Ara Berá", brandColor: "#10B981", hasLogo: false, logoSha256: null, presentationOrder: 1, total: 2, resolved: 0 }],
          },
        ]);
      }
      return Promise.reject(new Error(`Llamada inesperada: ${path}`));
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    expect(await screen.findByRole("heading", { name: "Ara Berá", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Logo de/ })).not.toBeInTheDocument();
    expect(document.querySelector(".judge-now-color-dot")).not.toBeNull();
    expect(document.querySelector(".judge-now-brand")).toHaveClass("is-branded");
  });

  it("muestra solo el nombre cuando no hay color ni logo", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/judge/ballots?include=progress") {
        return Promise.resolve([
          {
            id: "ballot-1", eventName: "Carnaval Goya", nightName: "Noche 1", specialtyName: "Música",
            status: "OPEN", totalScores: 2, resolvedScores: 0,
            troupes: [{ troupeId: "sched-1", eventTroupeId: "troupe-1", troupeName: "Ara Berá", brandColor: null, hasLogo: false, logoSha256: null, presentationOrder: 1, total: 2, resolved: 0 }],
          },
        ]);
      }
      return Promise.reject(new Error(`Llamada inesperada: ${path}`));
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    expect(await screen.findByRole("heading", { name: "Ara Berá", level: 3 })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Logo de/ })).not.toBeInTheDocument();
    expect(document.querySelector(".judge-now-color-dot")).toBeNull();
    expect(document.querySelector(".judge-now-brand")).not.toHaveClass("is-branded");
  });

  it("muestra el logo de la comparsa dentro del círculo con su color", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/judge/ballots?include=progress") {
        return Promise.resolve([
          {
            id: "ballot-1", eventName: "Carnaval Goya", nightName: "Noche 1", specialtyName: "Música",
            status: "OPEN", totalScores: 2, resolvedScores: 0,
            troupes: [{ troupeId: "sched-1", eventTroupeId: "troupe-1", troupeName: "Ara Berá", brandColor: "#10B981", hasLogo: true, logoSha256: "hash-logo", presentationOrder: 1, total: 2, resolved: 0 }],
          },
        ]);
      }
      return Promise.reject(new Error(`Llamada inesperada: ${path}`));
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    expect(await screen.findByRole("img", { name: "Logo de Ara Berá" })).toHaveAttribute(
      "src",
      "/api/v1/troupes/troupe-1/logo?v=hash-logo",
    );
    expect(document.querySelector(".judge-now-logo")).not.toBeNull();
    expect(document.querySelector(".judge-now-color-dot")).toBeNull();
  });

  it("renderiza bajo la capa de instrumento data-layer='instrument'", () => {
    const { container } = render(<JudgeHomePage session={{ user: { id: "judge-1" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);
    expect(container.querySelector("main.judge-home")).toHaveAttribute("data-layer", "instrument");
  });

  it("permite evaluar comparsas manuales aunque todavía no estén en pista", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/judge/ballots?include=progress") {
        return Promise.resolve([
          {
            id: "ballot-1",
            eventName: "Carnaval Goya",
            nightName: "Noche 1",
            specialtyName: "Música",
            status: "OPEN",
            releaseMode: "MANUAL",
            totalScores: 4,
            resolvedScores: 1,
            troupes: [
              {
                troupeId: "sched-1",
                troupeName: "Ara Berá",
                presentationOrder: 1,
                releaseOrder: 1,
                total: 2,
                resolved: 1,
              },
              {
                troupeId: "sched-2",
                troupeName: "Sapucay",
                presentationOrder: 2,
                releaseOrder: null,
                total: 2,
                resolved: 0,
              },
            ],
          },
        ]);
      }
      return Promise.reject(new Error(`Llamada inesperada: ${path}`));
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    // Comparsa 1: Habilitada para continuar
    expect(await screen.findByRole("heading", { name: "Ara Berá", level: 3 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continuar/ })).toHaveAttribute("href", "#/judge/ballot?ballotId=ballot-1&troupeId=sched-1");

    // El orden de pista no es un permiso para votar.
    expect(screen.getByRole("heading", { name: "Sapucay", level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Comenzar evaluación/ }).find((link) => link.getAttribute("href").endsWith("sched-2"))).toBeInTheDocument();
  });

  it("permite entrar a cualquier comparsa aunque haya otras pendientes", async () => {
    apiRequest.mockResolvedValue([{
      id: "ballot-1", eventName: "Carnaval Goya", nightName: "Noche 1", specialtyName: "Música",
      status: "OPEN", releaseMode: "MANUAL", totalScores: 6, resolvedScores: 1,
      troupes: [
        { troupeId: "sched-1", troupeName: "Ara Berá", presentationOrder: 1, releaseOrder: 1, total: 2, resolved: 1 },
        { troupeId: "sched-2", troupeName: "Sapucay", presentationOrder: 2, releaseOrder: 2, total: 2, resolved: 0 },
        { troupeId: "sched-3", troupeName: "Kamarr", presentationOrder: 3, releaseOrder: null, total: 2, resolved: 0 },
      ],
    }]);

    render(<JudgeHomePage session={{ user: { id: "judge-1" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    const current = await screen.findByRole("region", { name: "Comparsa actual" });
    expect(current).toHaveTextContent("Ara Berá");
    expect(current.querySelector("a.judge-now-cta")).toHaveAttribute("href", "#/judge/ballot?ballotId=ballot-1&troupeId=sched-1");
    expect(screen.getAllByRole("link", { name: /Comenzar evaluación/ }).find((link) => link.getAttribute("href").endsWith("sched-2"))).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Comenzar evaluación/ }).find((link) => link.getAttribute("href").endsWith("sched-3"))).toBeInTheDocument();
  });

  it("mantiene accesibles todas las comparsas sin depender de la puesta en pista", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/judge/ballots?include=progress") {
        return Promise.resolve([
          {
            id: "ballot-1",
            eventName: "Carnaval Goya",
            nightName: "Noche 1",
            specialtyName: "Música",
            status: "OPEN",
            releaseMode: "MANUAL",
            totalScores: 6,
            resolvedScores: 2,
            troupes: [
              {
                troupeId: "sched-1",
                troupeName: "Ara Berá",
                presentationOrder: 1,
                releaseOrder: 1,
                total: 2,
                resolved: 2, // Completa al 100%
              },
              {
                troupeId: "sched-2",
                troupeName: "Sapucay",
                presentationOrder: 2,
                releaseOrder: 2,
                total: 2,
                resolved: 0, // Habilitada porque la anterior terminó
              },
              {
                troupeId: "sched-3",
                troupeName: "Kamarr",
                presentationOrder: 3,
                releaseOrder: null,
                total: 2,
                resolved: 0, // Bloqueada porque Sapucay aún no terminó
              },
            ],
          },
        ]);
      }
      return Promise.reject(new Error(`Llamada inesperada: ${path}`));
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    // Comparsa actual = la que se está votando (Sapucay, 0/2), no la ya votada (Ara Berá, 2/2)
    const nowSection = await screen.findByRole("region", { name: "Comparsa actual" });
    expect(nowSection).toHaveTextContent("Sapucay");
    expect(nowSection.querySelector("a.judge-now-cta")).toHaveAttribute("href", "#/judge/ballot?ballotId=ballot-1&troupeId=sched-2");

    // Comparsa 2: Desbloqueada y lista para comenzar
    expect(screen.getByRole("heading", { name: "Sapucay", level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Comenzar/ }).find((link) => link.getAttribute("href").endsWith("sched-2"))).toBeInTheDocument();

    // Comparsa 3: disponible aunque todavía no tenga releaseOrder.
    expect(screen.getByRole("heading", { name: "Kamarr", level: 3 })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Comenzar evaluación/ }).find((link) => link.getAttribute("href").endsWith("sched-3"))).toBeInTheDocument();
  });

  it("muestra una única comparsa protagonista con CTA primario (TAREA 2)", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/judge/ballots?include=progress") {
        return Promise.resolve([
          {
            id: "ballot-1",
            eventName: "Carnaval Goya",
            nightName: "Noche 1",
            specialtyName: "Música",
            status: "OPEN",
            totalScores: 4,
            resolvedScores: 1,
            troupes: [
                { troupeId: "sched-1", troupeName: "Ara Berá", presentationOrder: 1, total: 2, resolved: 1 },
                { troupeId: "sched-2", troupeName: "Sapucay", presentationOrder: 2, total: 2, resolved: 0 },
            ],
          },
        ]);
      }
      return Promise.reject(new Error(`Llamada inesperada: ${path}`));
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    const nowSection = await screen.findByRole("region", { name: "Comparsa actual" });
    const cta = nowSection.querySelector("a.judge-now-cta");
    expect(cta).not.toBeNull();
    expect(cta).toHaveTextContent(/Continuar evaluación →/);
    expect(cta).toHaveAttribute("href", "#/judge/ballot?ballotId=ballot-1&troupeId=sched-1");
    // Un solo CTA primario en toda la pantalla
    expect(document.querySelectorAll("a.judge-now-cta")).toHaveLength(1);
  });

  it("no muestra votación completada si todo está puntuado pero falta el cierre (7 de 7 real exige SUBMITTED)", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/judge/ballots?include=progress") {
        return Promise.resolve([
          {
            id: "ballot-1", eventName: "Carnaval Goya", nightName: "Noche 1", specialtyName: "Baile",
            status: "OPEN", totalScores: 2, resolvedScores: 2,
            troupes: [{ troupeId: "sched-1", troupeName: "Ara Berá", presentationOrder: 1, total: 2, resolved: 2 }],
          },
          {
            id: "ballot-2", eventName: "Carnaval Goya", nightName: "Noche 1", specialtyName: "Baile",
            status: "SUBMITTED", totalScores: 2, resolvedScores: 2,
            troupes: [{ troupeId: "sched-2", troupeName: "Sapucay", presentationOrder: 2, total: 2, resolved: 2 }],
          },
        ]);
      }
      return Promise.reject(new Error(`Llamada inesperada: ${path}`));
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    const progress = await screen.findByRole("region", { name: "Progreso general" });
    // Barra al 100% de ítems pero solo 1 de 2 comparsas confirmadas.
    expect(progress).toHaveTextContent("Puntuación completa · cierre pendiente");
    expect(screen.queryByText("Votación completada")).not.toBeInTheDocument();
    // En cambio ofrece revisar/confirmar la pendiente.
    expect(await screen.findByRole("region", { name: "Planilla lista para cerrar" })).toBeInTheDocument();
  });

  it("muestra votación completada solo con todas las comparsas confirmadas", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/judge/ballots?include=progress") {
        return Promise.resolve([
          {
            id: "ballot-1", eventName: "Carnaval Goya", nightName: "Noche 1", specialtyName: "Baile",
            status: "SUBMITTED", totalScores: 4, resolvedScores: 4,
            troupes: [
              { troupeId: "sched-1", troupeName: "Ara Berá", presentationOrder: 1, total: 2, resolved: 2 },
              { troupeId: "sched-2", troupeName: "Sapucay", presentationOrder: 2, total: 2, resolved: 2 },
            ],
          },
        ]);
      }
      return Promise.reject(new Error(`Llamada inesperada: ${path}`));
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    const progress = await screen.findByRole("region", { name: "Progreso general" });
    expect(progress).toHaveTextContent("Cierre confirmado");
    expect(screen.getByText("Votación completada")).toBeInTheDocument();
    expect(screen.getByText("No tenés votaciones pendientes.")).toBeInTheDocument();
  });

  it("mantiene acceso a planillas cerradas con acción secundaria (TAREA 2)", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/judge/ballots?include=progress") {
        return Promise.resolve([
          {
            id: "ballot-1",
            eventName: "Carnaval Goya",
            nightName: "Noche 1",
            specialtyName: "Baile",
            status: "SUBMITTED",
            totalScores: 2,
            resolvedScores: 2,
            troupes: [
                { troupeId: "sched-1", troupeName: "Ara Berá", presentationOrder: 1, total: 2, resolved: 2 },
            ],
          },
        ]);
      }
      return Promise.reject(new Error(`Llamada inesperada: ${path}`));
    });

    render(<JudgeHomePage session={{ user: { id: "judge-1", name: "Juana Pérez" }, judgeProfile: { registrationStatus: "REGISTERED" } }} />);

    const evaluated = await screen.findByRole("region", { name: "Comparsas evaluadas" });
    const verPlanilla = evaluated.querySelector("a.judge-list-action");
    expect(verPlanilla).not.toBeNull();
    expect(verPlanilla).toHaveTextContent(/Ver planilla →/);
    expect(verPlanilla).toHaveAttribute("href", "#/judge/ballot?ballotId=ballot-1&troupeId=sched-1");
    // Sin sección protagonista cuando todo está confirmado
    expect(screen.queryByRole("region", { name: "Comparsa actual" })).not.toBeInTheDocument();
  });
});
