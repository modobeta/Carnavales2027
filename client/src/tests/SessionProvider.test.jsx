import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { SessionProvider, useSession } from "../auth/session-context.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

function SessionState() {
  const session = useSession();
  return <><p>{session.status}:{session.roles.join(",")}:{session.user?.name ?? ""}</p><p data-testid="admin-events">{JSON.stringify(session.adminEvents)}</p><button onClick={session.clear}>Limpiar</button></>;
}

function SessionExpiryProbe() {
  const session = useSession();
  return <p>{session.status}:{session.sessionExpired ? "expired" : "active"}</p>;
}

describe("SessionProvider", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("carga una sesión JUDGE sin exigir ADMIN", async () => {
    apiRequest.mockResolvedValue({
      user: { id: "u1", name: "Jurado", email: "jurado@example.test" },
      roles: ["JUDGE"],
      judgeProfile: { id: "j1", registrationStatus: "REGISTERED" },
    });
    render(<SessionProvider><SessionState /></SessionProvider>);
    expect(await screen.findByText("authenticated:JUDGE:Jurado")).toBeInTheDocument();
    expect(screen.getByTestId("admin-events")).toHaveTextContent("[]");
  });

  it("propaga adminEvents de la identidad autenticada", async () => {
    const adminEvents = [{ id: "event-1", name: "Carnaval", status: "OPEN", active: true }];
    apiRequest.mockResolvedValue({ user: { id: "u1" }, roles: [], adminEvents });
    render(<SessionProvider><SessionState /></SessionProvider>);
    expect(await screen.findByTestId("admin-events")).toHaveTextContent(JSON.stringify(adminEvents));
  });

  it("expone adminEvents vacío desde el valor por defecto del contexto", () => {
    render(<SessionState />);
    expect(screen.getByTestId("admin-events")).toHaveTextContent("[]");
  });

  it("limpia adminEvents al cerrar una sesión autenticada", async () => {
    apiRequest.mockResolvedValue({ user: { id: "u1" }, roles: [], adminEvents: [{ id: "event-1" }] });
    render(<SessionProvider><SessionState /></SessionProvider>);
    expect(await screen.findByTestId("admin-events")).toHaveTextContent('[{"id":"event-1"}]');
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    expect(screen.getByText("anonymous::")).toBeInTheDocument();
    expect(screen.getByTestId("admin-events")).toHaveTextContent("[]");
  });

  it("distingue anonimato, segundo factor y errores transitorios", async () => {
    apiRequest.mockRejectedValueOnce({ code: "UNAUTHENTICATED" });
    const first = render(<SessionProvider><SessionState /></SessionProvider>);
    expect(await screen.findByText("anonymous::")).toBeInTheDocument();
    expect(screen.getByTestId("admin-events")).toHaveTextContent("[]");
    first.unmount();

    apiRequest.mockRejectedValueOnce({ code: "TWO_FACTOR_REQUIRED" });
    const second = render(<SessionProvider><SessionState /></SessionProvider>);
    expect(await screen.findByText("second-factor-required::")).toBeInTheDocument();
    expect(screen.getByTestId("admin-events")).toHaveTextContent("[]");
    second.unmount();

    apiRequest.mockRejectedValueOnce({ code: "INTERNAL_ERROR" });
    render(<SessionProvider><SessionState /></SessionProvider>);
    expect(await screen.findByText("error::")).toBeInTheDocument();
    expect(screen.getByTestId("admin-events")).toHaveTextContent("[]");
  });

  it("marca la sesión como expirada (anónima) ante SESSION_EXPIRED", async () => {
    apiRequest.mockRejectedValueOnce({ code: "SESSION_EXPIRED" });
    render(<SessionProvider><SessionExpiryProbe /></SessionProvider>);
    expect(await screen.findByText("anonymous:expired")).toBeInTheDocument();
  });

  it("conserva el estado de error con reintento ante fallos transitorios", async () => {
    apiRequest.mockRejectedValueOnce({ code: "NETWORK_ERROR" });
    render(<SessionProvider><SessionExpiryProbe /></SessionProvider>);
    expect(await screen.findByText("error:active")).toBeInTheDocument();
  });

  it("no restaura una lectura pendiente después de limpiar la sesión", async () => {
    let resolveSession;
    apiRequest.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    render(<SessionProvider><SessionState /></SessionProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Limpiar" }));
    resolveSession({ user: { name: "Sesión vieja" }, roles: ["ADMIN"], judgeProfile: null });
    await waitFor(() => expect(screen.getByText("anonymous::")).toBeInTheDocument());
    expect(screen.getByTestId("admin-events")).toHaveTextContent("[]");
    expect(screen.queryByText(/Sesión vieja/)).not.toBeInTheDocument();
  });
});
