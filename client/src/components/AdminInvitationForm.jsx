import { useState } from "react";
import { apiRequest } from "../api/http.js";

export function AdminInvitationForm() {
  const [email, setEmail] = useState("");
  const [invitationLink, setInvitationLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const createInvitation = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage("");
    setInvitationLink("");
    try {
      const invitation = await apiRequest("/api/v1/users/invitations", {
        method: "POST",
        body: JSON.stringify({ email, roleCode: "ADMIN" }),
      });
      if (!invitation?.token) throw new Error("INVITATION_RESPONSE_INVALID");
      setInvitationLink(`${window.location.origin}${window.location.pathname}#/invitations/role/accept?token=${encodeURIComponent(invitation.token)}`);
      setEmail("");
      setMessage("Invitación creada. Compartí el enlace con la persona invitada para que complete su cuenta.");
    } catch (error) {
      setMessage(
        error.code === "TWO_FACTOR_REQUIRED"
          ? "Necesitás habilitar la verificación en dos pasos para invitar a otra persona administradora."
          : "No se pudo crear la invitación ADMIN.",
      );
    } finally {
      setBusy(false);
    }
  };

  const copyInvitationLink = async () => {
    try {
      await navigator.clipboard.writeText(invitationLink);
      setMessage("Enlace de invitación copiado.");
    } catch {
      setMessage("No se pudo copiar automáticamente. Seleccioná y copiá el enlace.");
    }
  };

  return (
    <div className="access-invite">
      <form className="access-invite-form" onSubmit={createInvitation}>
        <label>
          Correo de una cuenta nueva
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </label>
        <button type="submit" disabled={busy}>{busy ? "Creando invitación…" : "Crear invitación ADMIN"}</button>
      </form>
      {message && <p className="feedback" role="status" aria-live="polite">{message}</p>}
      {invitationLink && (
        <div className="invitation-link">
          <p>Compartí este enlace con la persona invitada:</p>
          <a href={invitationLink}>Abrir invitación</a>
          <code>{invitationLink}</code>
          <button className="secondary" type="button" onClick={() => void copyInvitationLink()}>Copiar enlace de invitación</button>
        </div>
      )}
    </div>
  );
}
