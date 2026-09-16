import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationPasswordFields, isRegistrationPasswordValid } from "../components/RegistrationPasswordFields.jsx";
import { AcceptJudgeInvitationPage } from "../pages/AcceptJudgeInvitationPage.jsx";
import { AcceptOperationalInvitationPage } from "../pages/AcceptOperationalInvitationPage.jsx";
import { AcceptRoleInvitationPage } from "../pages/AcceptRoleInvitationPage.jsx";
import { apiRequest } from "../api/http.js";

vi.mock("../api/http.js", () => ({ apiRequest: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("contraseña de registro", () => {
  it("muestra y oculta cada campo independientemente sin enviar", () => {
    const submit = vi.fn();
    render(<form onSubmit={submit}><RegistrationPasswordFields /></form>);
    const password = screen.getByLabelText("Nueva contraseña");
    const confirmation = screen.getByLabelText("Repetir contraseña");
    fireEvent.change(password, { target: { value: "Abcdefg1" } });
    fireEvent.click(screen.getByRole("button", { name: "Mostrar nueva contraseña" }));
    expect(password).toHaveAttribute("type", "text");
    expect(confirmation).toHaveAttribute("type", "password");
    fireEvent.click(screen.getByRole("button", { name: "Mostrar repetir contraseña" }));
    expect(confirmation).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Ocultar nueva contraseña" }));
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveValue("Abcdefg1");
    expect(submit).not.toHaveBeenCalled();
  });

  it("actualiza requisitos al escribir y vuelve a rojo al borrar", () => {
    render(<RegistrationPasswordFields />);
    expect(screen.getAllByText(/pendiente/)).toHaveLength(3);
    const input = screen.getByLabelText("Nueva contraseña");
    for (const [value, count] of [["A", 1], ["Ab", 2], ["Ab1", 3]]) {
      fireEvent.change(input, { target: { value } });
      expect(screen.getAllByText(/cumplido/)).toHaveLength(count);
      screen.getAllByText(/cumplido/).forEach((span) => expect(span).toHaveClass("requirement-met"));
    }
    fireEvent.change(input, { target: { value: "" } });
    screen.getAllByText(/pendiente/).forEach((span) => expect(span).toHaveClass("requirement-pending"));
    expect(isRegistrationPasswordValid("Ab1")).toBe(false);
    expect(isRegistrationPasswordValid("Ábcdefg1")).toBe(true);
    expect(isRegistrationPasswordValid("Aa1" + "x".repeat(126))).toBe(false);
  });

  it.each([AcceptJudgeInvitationPage, AcceptOperationalInvitationPage, AcceptRoleInvitationPage])("bloquea contraseña débil antes de llamar a la API (%s)", async (Page) => {
    apiRequest.mockResolvedValueOnce({ maskedEmail: "a***@example.test", roles: ["VEEDOR"], roleCode: "VEEDOR", expiresAt: "2027-01-01" });
    render(<Page secret="test-secret" token="test-token" />);
    const input = await screen.findByLabelText("Nueva contraseña");
    fireEvent.change(input, { target: { value: "abcdefgh" } });
    fireEvent.change(screen.getByLabelText("Repetir contraseña"), { target: { value: "abcdefgh" } });
    fireEvent.submit(input.closest("form"));
    expect(screen.getByRole("status")).toHaveTextContent("una mayúscula, una minúscula y un número");
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
