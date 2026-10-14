import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import { JuradosPorJornadaSection } from "../features/JuradosPorJornadaSection.jsx";
import { apiRequest } from "../api/http.js";

vi.mock("../api/http.js", () => ({
  apiRequest: vi.fn(),
}));

describe("JuradosPorJornadaSection — Rediseño Paso 2", () => {
  const event = { id: "event-1", name: "Carnaval 2027", status: "CONFIGURING" };
  const nights = [
    { id: "night-1", name: "Primera Jornada", kind: "COMPETITION", status: "OPEN" },
    { id: "night-2", name: "Segunda Jornada", kind: "COMPETITION", status: "OPEN" },
  ];
  const specialties = [
    { id: "spec-1", name: "Baile", active: true, displayOrder: 1 },
    { id: "spec-2", name: "Vestimenta", active: true, displayOrder: 2 },
    { id: "spec-3", name: "Batería", active: true, displayOrder: 3 },
  ];
  const judges = [
    { id: "j-1", name: "Alejandro Ramírez", registrationStatus: "REGISTERED" },
    { id: "j-2", name: "Diego Cáceres", registrationStatus: "REGISTERED" },
    { id: "j-3", name: "Carla Gómez", registrationStatus: "REGISTERED" },
    { id: "j-4", name: "Esteban Paz", registrationStatus: "REGISTERED" },
  ];
  const quotas = [
    { nightId: "night-1", specialtyId: "spec-1", maxAssignments: 2 },
    { nightId: "night-1", specialtyId: "spec-2", maxAssignments: 1 },
    { nightId: "night-1", specialtyId: "spec-3", maxAssignments: 1 },
  ];
  const assignments = [
    {
      id: "a-1",
      nightId: "night-1",
      specialtyId: "spec-1",
      judgeProfileId: "j-1",
      judgeName: "Alejandro Ramírez",
      assignmentType: "PRIMARY",
      status: "ACTIVE",
    },
    {
      id: "a-2",
      nightId: "night-1",
      specialtyId: "spec-1",
      judgeProfileId: "j-2",
      judgeName: "Diego Cáceres",
      assignmentType: "PRIMARY",
      status: "ACTIVE",
    },
    {
      id: "a-3",
      nightId: "night-1",
      specialtyId: "spec-2",
      judgeProfileId: "j-3",
      judgeName: "Carla Gómez",
      assignmentType: "PRIMARY",
      status: "ACTIVE",
    },
    // spec-3 tiene 0 asignados en night-1
    {
      id: "a-old",
      nightId: "night-1",
      specialtyId: "spec-2",
      judgeProfileId: "j-4",
      judgeName: "Esteban Paz",
      assignmentType: "PRIMARY",
      status: "REVOKED",
      reason: "Incompatibilidad de horario",
    },
  ];

  beforeEach(() => {
    apiRequest.mockImplementation(async (url) => {
      if (url === `/api/v1/events/${event.id}/nights`) return nights;
      if (url === `/api/v1/events/${event.id}/specialties`) return specialties;
      if (url === "/api/v1/judges") return judges;
      if (url === `/api/v1/events/${event.id}/judge-assignments`) {
        return { quotas, assignments };
      }
      throw new Error(`Unhandled apiRequest: ${url}`);
    });
  });

  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it("renderiza la estructura principal: encabezado, selector de jornada y tabla de 4 columnas", async () => {
    const onOpenSpecialties = vi.fn();
    render(<JuradosPorJornadaSection event={event} onOpenSpecialties={onOpenSpecialties} />);

    // Encabezado
    expect(await screen.findByRole("heading", { name: "Jurados por jornada" })).toBeInTheDocument();

    const specBtn = screen.getByRole("button", { name: "Gestionar especialidades" });
    expect(specBtn).toBeInTheDocument();
    fireEvent.click(specBtn);
    expect(onOpenSpecialties).toHaveBeenCalledTimes(1);

    // Selector de jornada con etiqueta visible
    expect(screen.getByLabelText("Jornada")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Seleccionar jornada" })).toHaveValue("night-1");

    // Tabla con 4 columnas
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent.trim());
    expect(headers).toEqual(["Especialidad", "Jurados asignados", "Puestos cubiertos", "Acción"]);
  });

  it("calcula la cobertura real y adapta el mensaje y la acción por fila", async () => {
    render(<JuradosPorJornadaSection event={event} />);

    // Fila 1: Baile (completa: 2 de 2)
    const rowBaile = (await screen.findByText("Baile")).closest("tr");
    expect(within(rowBaile).getByText(/Completa · 2 de 2/)).toBeInTheDocument();
    expect(within(rowBaile).getByRole("button", { name: /Editar asignación Baile/ })).toBeInTheDocument();
    expect(within(rowBaile).getByText("Alejandro Ramírez")).toBeInTheDocument();
    expect(within(rowBaile).getByText("Diego Cáceres")).toBeInTheDocument();

    // Fila 2: Vestimenta (completa: 1 de 1)
    const rowVestimenta = screen.getByText("Vestimenta").closest("tr");
    expect(within(rowVestimenta).getByText(/Completa · 1 de 1/)).toBeInTheDocument();
    expect(within(rowVestimenta).getByRole("button", { name: /Editar asignación Vestimenta/ })).toBeInTheDocument();
    expect(within(rowVestimenta).getByText("Carla Gómez")).toBeInTheDocument();

    // Fila 3: Batería (sin asignar: 0 de 1)
    const rowBateria = screen.getByText("Batería").closest("tr");
    expect(within(rowBateria).getByText(/Sin asignar · 0 de 1/)).toBeInTheDocument();
    expect(within(rowBateria).getByRole("button", { name: /Asignar jurados Batería/ })).toBeInTheDocument();
    expect(within(rowBateria).getByText("Sin jurados asignados")).toBeInTheDocument();
  });

  it("no cuenta suplentes como titulares para el cupo de cobertura", async () => {
    // Especialidad con 1 titular y 1 suplente para un cupo de 2: falta 1 titular
    const customAssignments = [
      {
        id: "a-1",
        nightId: "night-1",
        specialtyId: "spec-1",
        judgeProfileId: "j-1",
        judgeName: "Alejandro Ramírez",
        assignmentType: "PRIMARY",
        status: "ACTIVE",
      },
      {
        id: "a-sub",
        nightId: "night-1",
        specialtyId: "spec-1",
        judgeProfileId: "j-2",
        judgeName: "Diego Cáceres",
        assignmentType: "SUBSTITUTE",
        standbyForAssignmentId: "a-1",
        status: "ACTIVE",
      },
    ];

    apiRequest.mockImplementation(async (url) => {
      if (url === `/api/v1/events/${event.id}/nights`) return nights;
      if (url === `/api/v1/events/${event.id}/specialties`) return [specialties[0]];
      if (url === "/api/v1/judges") return judges;
      if (url === `/api/v1/events/${event.id}/judge-assignments`) {
        return { quotas: [{ nightId: "night-1", specialtyId: "spec-1", maxAssignments: 2 }], assignments: customAssignments };
      }
      throw new Error(`Unhandled apiRequest: ${url}`);
    });

    render(<JuradosPorJornadaSection event={event} />);

    const rowBaile = (await screen.findByText("Baile")).closest("tr");
    expect(within(rowBaile).getByText(/Falta 1 jurado · 1 de 2/)).toBeInTheDocument();
    expect(within(rowBaile).getByRole("button", { name: /Completar asignación Baile/ })).toBeInTheDocument();
  });

  it("muestra el historial de la jornada desplegable cerrado inicialmente y el resumen de cobertura", async () => {
    render(<JuradosPorJornadaSection event={event} />);

    // Resumen de la jornada (falta Batería)
    expect(
      await screen.findByText("Falta completar la asignación de jurados en 1 especialidad.")
    ).toBeInTheDocument();

    // Historial cerrado inicialmente
    const historyDetails = screen.getByText(/Ver historial de esta jornada/).closest("details");
    expect(historyDetails).not.toHaveAttribute("open");

    // Al abrir el historial se muestran las asignaciones inactivas
    fireEvent.click(within(historyDetails).getByText(/Ver historial de esta jornada/));
    expect(within(historyDetails).getByText("Esteban Paz")).toBeInTheDocument();
    expect(within(historyDetails).getByText(/Incompatibilidad de horario/)).toBeInTheDocument();
    expect(within(historyDetails).getByText("Revocada")).toBeInTheDocument();
  });

  it("abre el diálogo 'Jurados de [especialidad] — [jornada]', permite gestionar y devuelve el foco", async () => {
    render(<JuradosPorJornadaSection event={event} />);

    const editBtn = await screen.findByRole("button", { name: /Editar asignación Baile/ });
    editBtn.focus();
    expect(document.activeElement).toBe(editBtn);

    fireEvent.click(editBtn);

    // Diálogo abierto con título correcto
    const dialog = await screen.findByRole("dialog", { name: "Jurados de Baile — Primera Jornada" });
    expect(dialog).toBeInTheDocument();

    // Contenido del diálogo: cupo, jurados actuales y explicación al quitar
    expect(within(dialog).getByText(/2 puesto\(s\)/)).toBeInTheDocument();
    expect(within(dialog).getByText("Alejandro Ramírez")).toBeInTheDocument();
    expect(within(dialog).getByText("Diego Cáceres")).toBeInTheDocument();

    // Quitar asignación
    const quitarBtns = within(dialog).getAllByRole("button", { name: "Quitar" });
    fireEvent.click(quitarBtns[0]);
    expect(
      within(dialog).getByText(
        "Al quitar la asignación, se retira al jurado de esta especialidad y jornada; no elimina su usuario del padrón."
      )
    ).toBeInTheDocument();

    // Cerrar diálogo
    fireEvent.click(within(dialog).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    // Foco restaurado
    expect(document.activeElement).toBe(editBtn);
  });

  it("cambiar de jornada actualiza las asignaciones sin mostrar datos de la anterior", async () => {
    render(<JuradosPorJornadaSection event={event} />);

    expect(await screen.findByText("Baile")).toBeInTheDocument();

    const select = screen.getByRole("combobox", { name: "Seleccionar jornada" });
    fireEvent.change(select, { target: { value: "night-2" } });

    // En night-2 no hay asignaciones configuradas
    await waitFor(() => {
      const rowBaile = screen.getByText("Baile").closest("tr");
      expect(within(rowBaile).getByText(/Sin asignar · 0 de 1/)).toBeInTheDocument();
    });
  });

  it("muestra estado vacío accesible si no hay jornadas ni especialidades", async () => {
    apiRequest.mockImplementation(async (url) => {
      if (url.endsWith("/nights")) return [];
      if (url.endsWith("/specialties")) return [];
      return [];
    });

    render(<JuradosPorJornadaSection event={event} />);

    expect(await screen.findByText("No hay jornadas de competencia configuradas.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Eventos y jornadas" })).toHaveAttribute("href", "#/admin/events");
  });

  it("muestra estado de error comprensible y permite reintentar", async () => {
    let shouldFail = true;
    apiRequest.mockImplementation(async (url) => {
      if (shouldFail) throw new Error("Fallo de red");
      if (url.endsWith("/nights")) return nights;
      if (url.endsWith("/specialties")) return specialties;
      return [];
    });

    render(<JuradosPorJornadaSection event={event} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar las asignaciones del evento.");
    const retryBtn = screen.getByRole("button", { name: "Reintentar" });

    shouldFail = false;
    fireEvent.click(retryBtn);

    expect(await screen.findByRole("heading", { name: "Jurados por jornada" })).toBeInTheDocument();
  });
});
