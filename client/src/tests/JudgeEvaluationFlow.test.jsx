import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "../App.jsx";
import { JudgeBallotPage } from "../pages/JudgeBallotPage.jsx";
import { apiRequest } from "../api/http.js";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

const score = { id: "s1", nightScheduleId: "schedule-1", troupeId: "troupe-1", troupeName: "Aimara", presentationOrder: 1, releaseOrder: 1, rubricId: "r1", rubricName: "Baile", itemName: "Comisión de frente", evaluationState: "PENDING", status: "DRAFT", score: null };
const ballot = { id: "b1", eventId: "e1", nightId: "n1", nightName: "Noche 1", eventDate: "2026-11-07", specialtyName: "Baile", status: "OPEN", revision: 1, scores: [score] };
const session = { status: "authenticated", roles: ["JUDGE"], user: { id: "j1", name: "Gonzalo" }, judgeProfile: { registrationStatus: "REGISTERED" } };

describe("Acceso a la evaluación del jurado", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); window.location.hash = ""; window.localStorage.clear(); });

  it.each([["ALL", "schedule-1"], ["MANUAL", "schedule-1"]])( "resuelve entrada desde inicio en modo %s y pasada activa %s", async (releaseMode, activeScheduleId) => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/judge/profile") return { assignments: [{ status: "ACTIVE", eventId: "e1", eventName: "Carnavales 3037" }] };
      if (path === "/api/v1/judge/ballots?include=progress") return [{ ...ballot, releaseMode, totalScores: 1, resolvedScores: 0, troupes: [{ troupeId: "schedule-1", troupeName: "Aimara", presentationOrder: 1, releaseOrder: releaseMode === "MANUAL" && !activeScheduleId ? null : 1, total: 1, resolved: 0 }] }];
      if (path === "/api/v1/judge/ballots/b1") return { ...ballot, releaseMode, activeScheduleId, scores: [{ ...score, releaseOrder: activeScheduleId ? 1 : null }] };
      return [];
    });
    window.location.hash = "#/judge";
    render(<StrictMode><App session={session} /></StrictMode>);
    const start = await screen.findByRole("link", { name: "Comenzar evaluación →" });
    fireEvent.click(start);
    await waitFor(() => expect(window.location.hash).toContain("#/judge/ballot?"));
    expect(await screen.findByRole("heading", { name: "Comisión de frente", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Votar 8" })).toBeEnabled();
    expect(apiRequest.mock.calls.every(([, options]) => !options)).toBe(true);
  });

  it("ofrece iniciar una comparsa manual aunque administración todavía no la puso en pista", async () => {
    apiRequest.mockImplementation(async (path) => {
      if (path === "/api/v1/judge/profile") return { assignments: [{ status: "ACTIVE", eventId: "e1", eventName: "Carnavales 3037" }] };
      if (path === "/api/v1/judge/ballots?include=progress") return [{ ...ballot, releaseMode: "MANUAL", totalScores: 1, resolvedScores: 0, troupes: [{ troupeId: "schedule-1", troupeName: "Aimara", presentationOrder: 1, releaseOrder: null, total: 1, resolved: 0 }] }];
      return [];
    });
    window.location.hash = "#/judge";
    render(<StrictMode><App session={session} /></StrictMode>);
    expect(await screen.findByRole("region", { name: "Comparsa actual" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Comenzar evaluación →" })).toHaveAttribute("href", "#/judge/ballot?ballotId=b1&troupeId=schedule-1");
  });

  it("abre una planilla manual sin troupeId mientras se selecciona la comparsa activa", async () => {
    apiRequest.mockResolvedValue({ ...ballot, releaseMode: "MANUAL", activeScheduleId: "schedule-1" });
    render(<JudgeBallotPage ballotId="b1" />);
    expect(await screen.findByRole("heading", { name: "Comisión de frente", level: 2 })).toBeInTheDocument();
  });

  it.each([null, "schedule-2"])("permite votar una pasada manual sin releaseOrder si la activa es %s", async (activeScheduleId) => {
    apiRequest.mockResolvedValue({ ...ballot, releaseMode: "MANUAL", activeScheduleId, scores: [{ ...score, releaseOrder: null }] });
    render(<JudgeBallotPage ballotId="b1" troupeId="schedule-1" />);
    expect(await screen.findByRole("heading", { name: "Comisión de frente", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Votar 8" })).toBeEnabled();
  });

  it("permite votar una comparsa ya liberada aunque administración haya avanzado a otra", async () => {
    apiRequest.mockResolvedValue({ ...ballot, releaseMode: "MANUAL", activeScheduleId: "schedule-2", scores: [{ ...score, releaseOrder: 1 }] });
    render(<JudgeBallotPage ballotId="b1" troupeId="schedule-1" />);
    expect(await screen.findByRole("heading", { name: "Comisión de frente", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Votar 8" })).toBeEnabled();
    expect(screen.queryByRole("heading", { name: "Comparsa en espera de pasada" })).not.toBeInTheDocument();
  });

  it("no rompe el acceso manual con un troupeId que ya no existe en la planilla", async () => {
    apiRequest.mockResolvedValue({ ...ballot, releaseMode: "MANUAL", activeScheduleId: "schedule-1" });
    render(<JudgeBallotPage ballotId="b1" troupeId="schedule-removed" />);
    expect(await screen.findByRole("heading", { name: "Comisión de frente", level: 2 })).toBeInTheDocument();
  });
});
