import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../api/http.js";
import { AdminAssignmentsPage } from "../pages/AdminAssignmentsPage.jsx";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));

describe("AdminAssignmentsPage", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("renderiza bajo la capa de instrumento data-layer='instrument' (RF-177)", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/events") return Promise.resolve([{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }]);
      if (path === "/api/v1/judges") return Promise.resolve([]);
      if (path.endsWith("/nights")) return Promise.resolve([]);
      if (path.endsWith("/specialties")) return Promise.resolve([]);
      if (path.endsWith("/judge-assignments")) return Promise.resolve({ quotas: [], assignments: [] });
      return Promise.resolve({});
    });
    const { container } = render(<AdminAssignmentsPage />);
    expect(container.querySelector("main.admin-shell")).toHaveAttribute("data-layer", "instrument");
  });

  it("configura un cupo y conserva la gestión separada de votos", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/events") return Promise.resolve([{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }]);
      if (path === "/api/v1/judges") return Promise.resolve([{ id: "judge-1", name: "Jurado Uno", registrationStatus: "REGISTERED" }]);
      if (path.endsWith("/nights")) return Promise.resolve([{ id: "night-1", name: "Noche 1", kind: "COMPETITION", status: "DRAFT" }]);
      if (path.endsWith("/specialties")) return Promise.resolve([{ id: "specialty-1", name: "Baile", active: true }]);
      if (path.endsWith("/judge-assignments")) return Promise.resolve({ quotas: [], assignments: [] });
      return Promise.resolve({});
    });
    render(<AdminAssignmentsPage />);
    expect(await screen.findByRole("button", { name: "Noche 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Configurar cupo" }));
    fireEvent.change(screen.getByLabelText("Cupo máximo"), { target: { value: "3" } });
    fireEvent.submit(screen.getByRole("button", { name: "Guardar cupo" }).closest("form"));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/events/event-1/nights/night-1/specialties/specialty-1/judge-quota",
      { method: "PUT", body: JSON.stringify({ maxAssignments: 3 }) },
    ));
    expect(screen.queryByText(/puntuar/i)).not.toBeInTheDocument();
  });

  it("activa solo el suplente reservado con un motivo", async () => {
    const assignments = [
      { id: "primary-1", judgeName: "Titular", judgeProfileId: "judge-1", nightName: "Noche 1", specialtyName: "Baile", assignmentType: "PRIMARY", status: "ACTIVE", nightStatus: "OPEN" },
      { id: "standby-1", judgeName: "Suplente", judgeProfileId: "judge-2", nightName: "Noche 1", specialtyName: "Baile", assignmentType: "SUBSTITUTE", standbyForAssignmentId: "primary-1", status: "ACTIVE", nightStatus: "OPEN" },
    ];
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/events") return Promise.resolve([{ id: "event-1", name: "Carnaval", status: "OPEN" }]);
      if (path === "/api/v1/judges") return Promise.resolve([{ id: "judge-1", name: "Titular", registrationStatus: "REGISTERED" }, { id: "judge-2", name: "Suplente", registrationStatus: "REGISTERED" }]);
      if (path.endsWith("/nights")) return Promise.resolve([{ id: "night-1", name: "Noche 1", kind: "COMPETITION", status: "OPEN" }]);
      if (path.endsWith("/specialties")) return Promise.resolve([{ id: "specialty-1", name: "Baile", active: true }]);
      if (path.endsWith("/judge-assignments")) return Promise.resolve({ quotas: [], assignments });
      return Promise.resolve({});
    });
    render(<AdminAssignmentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Acciones para Titular" }));
    fireEvent.click(await screen.findByRole("button", { name: "Activar suplente" }));
    const dialogForm = screen.getByLabelText("Motivo de activación").closest("form");
    fireEvent.change(dialogForm.querySelector("input[name='reason']"), { target: { value: "Titular no finalizo" } });
    fireEvent.submit(dialogForm);
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/judge-assignments/primary-1/activate-substitute",
      { method: "POST", body: JSON.stringify({ reason: "Titular no finalizo" }) },
    ));
  });

  it("muestra cupo inline y falta de cobertura por especialidad", async () => {
    apiRequest.mockImplementation((path) => {
      if (path === "/api/v1/events") return Promise.resolve([{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }]);
      if (path === "/api/v1/judges") return Promise.resolve([]);
      if (path.endsWith("/nights")) return Promise.resolve([{ id: "night-1", name: "Noche 1", kind: "COMPETITION", status: "DRAFT" }]);
      if (path.endsWith("/specialties")) return Promise.resolve([
        { id: "specialty-1", name: "Baile", active: true },
        { id: "specialty-2", name: "Vestuario", active: true },
      ]);
      if (path.endsWith("/judge-assignments")) return Promise.resolve({
        quotas: [{ id: "q1", nightId: "night-1", nightName: "Noche 1", specialtyId: "specialty-1", specialtyName: "Baile", maxAssignments: 3, activeAssignments: 2 }],
        assignments: [],
      });
      return Promise.resolve({});
    });
    render(<AdminAssignmentsPage />);
    expect(await screen.findByText(/2\/3 puestos cubiertos/)).toBeInTheDocument();
    expect(screen.getByText(/Cupo máximo: 3/)).toBeInTheDocument();
    expect(screen.getByText(/Falta cubrir el puesto de Vestuario/)).toBeInTheDocument();
  });

  it("auto-selecciona el único titular al elegir suplente y crea la asignación", async () => {
    apiRequest.mockImplementation((path, options) => {
      if (path === "/api/v1/events") return Promise.resolve([{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }]);
      if (path === "/api/v1/judges") return Promise.resolve([
        { id: "judge-1", name: "Titular", registrationStatus: "REGISTERED" },
        { id: "judge-2", name: "Suplente", registrationStatus: "REGISTERED" },
      ]);
      if (path.endsWith("/nights")) return Promise.resolve([{ id: "night-1", name: "Noche 1", kind: "COMPETITION", status: "DRAFT" }]);
      if (path.endsWith("/specialties")) return Promise.resolve([{ id: "specialty-1", name: "Baile", active: true }]);
      if (path.endsWith("/judge-assignments") && !options) {
        return Promise.resolve({
          quotas: [],
          assignments: [
            { id: "primary-1", judgeName: "Titular", judgeProfileId: "judge-1", nightId: "night-1", nightName: "Noche 1", specialtyId: "specialty-1", specialtyName: "Baile", assignmentType: "PRIMARY", status: "ACTIVE", nightStatus: "DRAFT" },
          ],
        });
      }
      if (path === "/api/v1/events/event-1/judge-assignments") return Promise.resolve({});
      return Promise.resolve({});
    });
    render(<AdminAssignmentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Asignar jurado" }));
    expect(screen.queryByText(/Suplente de:/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Suplente" }));
    expect(screen.getByText(/Suplente de:/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Suplente de")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Jurado"), { target: { value: "judge-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/events/event-1/judge-assignments",
      {
        method: "POST",
        body: JSON.stringify({
          nightId: "night-1",
          specialtyId: "specialty-1",
          judgeProfileId: "judge-2",
          assignmentType: "SUBSTITUTE",
          standbyForAssignmentId: "primary-1",
        }),
      },
    ));
  });

  it("muestra selector acotado cuando hay varios titulares en la misma especialidad", async () => {
    apiRequest.mockImplementation((path, options) => {
      if (path === "/api/v1/events") return Promise.resolve([{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }]);
      if (path === "/api/v1/judges") return Promise.resolve([
        { id: "judge-1", name: "Titular A", registrationStatus: "REGISTERED" },
        { id: "judge-3", name: "Titular B", registrationStatus: "REGISTERED" },
        { id: "judge-2", name: "Suplente", registrationStatus: "REGISTERED" },
      ]);
      if (path.endsWith("/nights")) return Promise.resolve([{ id: "night-1", name: "Noche 1", kind: "COMPETITION", status: "DRAFT" }]);
      if (path.endsWith("/specialties")) return Promise.resolve([{ id: "specialty-1", name: "Baile", active: true }]);
      if (path.endsWith("/judge-assignments") && !options) {
        return Promise.resolve({
          quotas: [],
          assignments: [
            { id: "primary-1", judgeName: "Titular A", judgeProfileId: "judge-1", nightId: "night-1", nightName: "Noche 1", specialtyId: "specialty-1", specialtyName: "Baile", assignmentType: "PRIMARY", status: "ACTIVE", nightStatus: "DRAFT" },
            { id: "primary-2", judgeName: "Titular B", judgeProfileId: "judge-3", nightId: "night-1", nightName: "Noche 1", specialtyId: "specialty-1", specialtyName: "Baile", assignmentType: "PRIMARY", status: "ACTIVE", nightStatus: "DRAFT" },
          ],
        });
      }
      if (path === "/api/v1/events/event-1/judge-assignments") return Promise.resolve({});
      return Promise.resolve({});
    });
    render(<AdminAssignmentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Asignar jurado" }));
    fireEvent.click(screen.getByRole("radio", { name: "Suplente" }));
    const standby = screen.getByLabelText("Suplente de");
    expect(Array.from(standby.options).map((option) => option.value)).toEqual(["", "primary-1", "primary-2"]);
    fireEvent.change(screen.getByLabelText("Jurado"), { target: { value: "judge-2" } });
    fireEvent.change(standby, { target: { value: "primary-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Asignar" }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
      "/api/v1/events/event-1/judge-assignments",
      {
        method: "POST",
        body: JSON.stringify({
          nightId: "night-1",
          specialtyId: "specialty-1",
          judgeProfileId: "judge-2",
          assignmentType: "SUBSTITUTE",
          standbyForAssignmentId: "primary-2",
        }),
      },
    ));
  });

  it("bloquea el alta de suplente cuando no hay titular asignado", async () => {
    apiRequest.mockImplementation((path, options) => {
      if (path === "/api/v1/events") return Promise.resolve([{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }]);
      if (path === "/api/v1/judges") return Promise.resolve([{ id: "judge-2", name: "Suplente", registrationStatus: "REGISTERED" }]);
      if (path.endsWith("/nights")) return Promise.resolve([{ id: "night-1", name: "Noche 1", kind: "COMPETITION", status: "DRAFT" }]);
      if (path.endsWith("/specialties")) return Promise.resolve([{ id: "specialty-1", name: "Baile", active: true }]);
      if (path.endsWith("/judge-assignments") && !options) {
        return Promise.resolve({ quotas: [], assignments: [] });
      }
      if (path === "/api/v1/events/event-1/judge-assignments") return Promise.resolve({});
      return Promise.resolve({});
    });
    render(<AdminAssignmentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Asignar jurado" }));
    fireEvent.click(screen.getByRole("radio", { name: "Suplente" }));
    expect(screen.getByText("No hay titular asignado para esta especialidad.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asignar" })).toBeDisabled();
  });

  it("no ofrece en el selector de jurado a quienes ya están asignados en esa noche", async () => {
    apiRequest.mockImplementation((path, options) => {
      if (path === "/api/v1/events") return Promise.resolve([{ id: "event-1", name: "Carnaval", status: "CONFIGURING" }]);
      if (path === "/api/v1/judges") return Promise.resolve([
        { id: "judge-1", name: "Titular", registrationStatus: "REGISTERED" },
        { id: "judge-2", name: "Suplente", registrationStatus: "REGISTERED" },
        { id: "judge-3", name: "Libre", registrationStatus: "REGISTERED" },
      ]);
      if (path.endsWith("/nights")) return Promise.resolve([{ id: "night-1", name: "Noche 1", kind: "COMPETITION", status: "DRAFT" }]);
      if (path.endsWith("/specialties")) return Promise.resolve([{ id: "specialty-1", name: "Baile", active: true }]);
      if (path.endsWith("/judge-assignments") && !options) {
        return Promise.resolve({
          quotas: [],
          assignments: [
            { id: "primary-1", judgeName: "Titular", judgeProfileId: "judge-1", nightId: "night-1", nightName: "Noche 1", specialtyId: "specialty-1", specialtyName: "Baile", assignmentType: "PRIMARY", status: "ACTIVE", nightStatus: "DRAFT" },
          ],
        });
      }
      if (path === "/api/v1/events/event-1/judge-assignments") return Promise.resolve({});
      return Promise.resolve({});
    });
    render(<AdminAssignmentsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "+ Asignar jurado" }));
    const select = screen.getByLabelText("Jurado");
    expect(Array.from(select.options).map((option) => option.value)).toEqual(["", "judge-2", "judge-3"]);
  });
});
