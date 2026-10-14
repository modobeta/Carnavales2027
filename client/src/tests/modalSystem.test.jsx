import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

import { Dialog } from "../components/Dialog.jsx";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { NoticeDialog } from "../components/NoticeDialog.jsx";
import { UnsavedChangesDialog } from "../components/UnsavedChangesDialog.jsx";
import { NotificationProvider, useNotify } from "../components/Notifications.jsx";

beforeAll(() => {
  if (typeof HTMLDialogElement !== "undefined") {
    HTMLDialogElement.prototype.showModal =
      HTMLDialogElement.prototype.showModal ||
      function showModal() {
        this.open = true;
      };
    HTMLDialogElement.prototype.close =
      HTMLDialogElement.prototype.close ||
      function close() {
        this.open = false;
      };
  }
});

afterEach(() => {
  cleanup();
});

describe("Sistema unificado de modales (Spec 027/RF-UX-03)", () => {
  describe("<Dialog tone>", () => {
    it("aplica la clase de tono violeta para creación/edición", () => {
      render(
        <Dialog isOpen onClose={() => {}} title="Crear noche" tone="violet">
          <p>Formulario</p>
        </Dialog>,
      );
      expect(screen.getByRole("dialog")).toHaveClass("app-dialog--violet");
    });

    it("cae a tono neutro si el tono no es válido", () => {
      render(
        <Dialog isOpen onClose={() => {}} title="Modal" tone="weird">
          <p>Contenido</p>
        </Dialog>,
      );
      expect(screen.getByRole("dialog")).toHaveClass("app-dialog--default");
    });
  });

  describe("<ConfirmDialog>", () => {
    it("usa tono de advertencia y acción afirmativa naranja por defecto", () => {
      render(
        <ConfirmDialog
          isOpen
          onClose={() => {}}
          onConfirm={() => {}}
          title="Cerrar votación"
          description="No se podrán registrar más votos."
          confirmLabel="Cerrar votación"
        />,
      );
      expect(screen.getByRole("dialog")).toHaveClass("app-dialog--warning");
      expect(screen.getByRole("button", { name: "Cerrar votación" })).toHaveClass("app-button-warning");
    });

    it("mantiene tono y botón de peligro para acciones destructivas", () => {
      render(
        <ConfirmDialog
          isOpen
          onClose={() => {}}
          onConfirm={() => {}}
          title="Eliminar comparsa"
          description="Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          danger
        />,
      );
      expect(screen.getByRole("dialog")).toHaveClass("app-dialog--danger");
      const confirm = screen.getByRole("button", { name: "Eliminar" });
      expect(confirm).toHaveClass("app-button-danger");
      expect(confirm).not.toBeDisabled();
    });
  });

  describe("<NoticeDialog>", () => {
    it("muestra un error con rol de alerta en la acción y cierra al confirmar", () => {
      const onClose = vi.fn();
      render(
        <NoticeDialog
          isOpen
          onClose={onClose}
          tone="error"
          title="No se pudo guardar"
          description="La conexión falló. Reintentá manualmente."
        />,
      );
      const dialog = screen.getByRole("dialog");
      const description = dialog.querySelector(".notice-dialog-description");
      expect(dialog).toHaveClass("app-dialog--danger");
      expect(description).toHaveTextContent("La conexión falló. Reintentá manualmente.");
      expect(dialog).toHaveAttribute("aria-describedby", description.id);
      fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("presenta éxito con tono verde y botón de éxito", () => {
      render(<NoticeDialog isOpen onClose={() => {}} tone="success" title="Listo" description="Guardado." />);
      expect(screen.getByRole("dialog")).toHaveClass("app-dialog--success");
      expect(screen.getByRole("button", { name: "Entendido" })).toHaveClass("app-button-success");
    });
  });

  describe("<UnsavedChangesDialog>", () => {
    it("ofrece seguir editando, guardar y descartar", () => {
      const onKeepEditing = vi.fn();
      const onDiscard = vi.fn();
      const onSave = vi.fn();
      render(
        <UnsavedChangesDialog
          isOpen
          onKeepEditing={onKeepEditing}
          onDiscard={onDiscard}
          onSave={onSave}
        />,
      );
      expect(screen.getByRole("dialog")).toHaveClass("app-dialog--warning");
      fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
      expect(onKeepEditing).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
      expect(onSave).toHaveBeenCalledOnce();
      fireEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
      expect(onDiscard).toHaveBeenCalledOnce();
    });
  });

  describe("NotificationProvider / useNotify", () => {
    it("expone notificaciones breves sin bloquear la interfaz", () => {
      function Trigger() {
        const { notify } = useNotify();
        return (
          <button type="button" onClick={() => notify({ message: "Puntaje guardado", type: "success" })}>
            Disparar
          </button>
        );
      }
      render(
        <NotificationProvider>
          <Trigger />
        </NotificationProvider>,
      );
      expect(screen.queryByText("Puntaje guardado")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Disparar" }));
      expect(screen.getByText("Puntaje guardado")).toBeInTheDocument();
    });

    it("es un no-op seguro fuera del Provider", () => {
      function Trigger() {
        const { notify } = useNotify();
        return (
          <button type="button" onClick={() => notify({ message: "x" })}>
            Disparar
          </button>
        );
      }
      render(<Trigger />);
      expect(() => fireEvent.click(screen.getByRole("button", { name: "Disparar" }))).not.toThrow();
    });
  });
});
