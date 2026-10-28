import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IncompleteNominationsSummary } from "./IncompleteNominationsSummary.jsx";

describe("IncompleteNominationsSummary", () => {
  afterEach(cleanup);

  it("resume los faltantes por comparsa y permite desplegar el detalle completo", () => {
    render(<IncompleteNominationsSummary nominations={[
      { rubricId: "r1", troupeId: "t1", rubricName: "Reina", troupeName: "Estrella" },
      { rubricId: "r2", troupeId: "t1", rubricName: "Rey", troupeName: "Estrella" },
      { rubricId: "r1", troupeId: "t2", rubricName: "Reina", troupeName: "Imperio" },
    ]} />);

    expect(screen.getByText("Hay 3 faltantes en 2 comparsas.")).toBeInTheDocument();
    const details = screen.getByText("Ver faltantes").closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getAllByText(/Falta un participante para/)).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Ir a Participantes" })).toHaveAttribute("href", "#/admin/competencia?step=participantes");
  });

  it("no presenta un resumen si no hay faltantes", () => {
    const { container } = render(<IncompleteNominationsSummary nominations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
