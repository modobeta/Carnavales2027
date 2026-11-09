import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssignmentReasonField, assignmentReasonFromForm } from "./AssignmentReasonField.jsx";

describe("AssignmentReasonField", () => {
  it("permite seleccionar un motivo frecuente y lo convierte en texto auditable", () => {
    const { container } = render(<form><AssignmentReasonField /></form>);
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "ABSENCE" } });

    expect(assignmentReasonFromForm(new FormData(container.querySelector("form")))).toBe("Ausencia");
    expect(screen.queryByLabelText("Detalle del motivo")).not.toBeInTheDocument();
  });

  it("pide detalle cuando se elige Otro y conserva ese detalle para auditoría", () => {
    render(<AssignmentReasonField />);
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "OTHER" } });
    const details = screen.getByLabelText("Detalle del motivo");
    fireEvent.change(details, { target: { value: "  Motivo particular  " } });
    expect(details).toHaveAttribute("pattern", ".*\\S.*");

    expect(assignmentReasonFromForm(new Map([
      ["reasonType", "OTHER"],
      ["reasonOther", "  Motivo particular  "],
    ]))).toBe("Otro: Motivo particular");
  });
});
