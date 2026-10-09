import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog.jsx";

afterEach(cleanup);

it("indica procesamiento y bloquea confirmaciones duplicadas", () => {
  const onConfirm = vi.fn();
  const props = { isOpen: true, title: "Confirmación", confirmLabel: "Guardar", onClose: vi.fn(), onConfirm };
  const { rerender } = render(<ConfirmDialog {...props} confirming />);
  const processing = screen.getByRole("button", { name: "Procesando…" });
  expect(processing).toBeDisabled();
  expect(processing).toHaveAttribute("aria-busy", "true");
  fireEvent.click(processing);
  expect(onConfirm).not.toHaveBeenCalled();
  rerender(<ConfirmDialog {...props} confirming={false} />);
  const ready = screen.getByRole("button", { name: "Guardar" });
  expect(ready).toBeEnabled();
  expect(ready).not.toHaveAttribute("aria-busy");
  fireEvent.click(ready);
  expect(onConfirm).toHaveBeenCalledOnce();
});
