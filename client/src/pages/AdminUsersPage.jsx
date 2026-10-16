import { useEffect, useRef, useState } from "react";
import { PageShell } from "../components/PageShell.jsx";
import { apiRequest } from "../api/http.js";
import { useSession } from "../auth/session-context.jsx";
import { Dialog } from "../components/Dialog.jsx";
import { UserManagementNavigation } from "../components/UserManagementNavigation.jsx";

export function AdminUsersPage() {
  const session = useSession();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitationLink, setInvitationLink] = useState("");
  const [invitationBusy, setInvitationBusy] = useState(false);
  const [adminRoleTarget, setAdminRoleTarget] = useState(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const roleTriggerRef = useRef(null);

  const refreshUsers = async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/api/v1/users");
      setUsers(data);
      setMessage("");
    } catch {
      setMessage("No se pudieron cargar los usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshUsers();
  }, []);

  const createAdminInvitation = async (event) => {
    event.preventDefault();
    if (invitationBusy) return;
    setInvitationBusy(true);
    setMessage("");
    setInvitationLink("");
    try {
      const invitation = await apiRequest("/api/v1/users/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, roleCode: "ADMIN" }),
      });
      if (!invitation?.token) throw new Error("INVITATION_RESPONSE_INVALID");
      setInvitationLink(`${window.location.origin}${window.location.pathname}#/invitations/role/accept?token=${encodeURIComponent(invitation.token)}`);
      setInviteEmail("");
      setMessage("Invitación ADMIN creada. Compartí el enlace con la persona invitada para que complete su cuenta.");
    } catch (error) {
      setMessage(
        error.code === "TWO_FACTOR_REQUIRED"
          ? "Necesitás habilitar la verificación en dos pasos para invitar a otra persona administradora."
          : "No se pudo crear la invitación ADMIN.",
      );
    } finally {
      setInvitationBusy(false);
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

  const changeAdminRole = async (user, grant) => {
    if (!user || roleBusy) return;
    setRoleBusy(true);
    try {
      await apiRequest(`/api/v1/users/${user.id}/roles/admin`, {
        method: grant ? "POST" : "DELETE",
      });
      await refreshUsers();
      setMessage(grant ? "Administrador promovido." : "Rol ADMIN revocado.");
      setAdminRoleTarget(null);
    } catch (error) {
      setMessage(
        error.code === "PRIMARY_ADMIN_PROTECTED"
          ? "La cuenta principal está protegida y no se puede revocar su rol ADMIN."
          : error.code === "LAST_ADMIN_REQUIRED"
            ? "Debe quedar al menos un administrador activo."
          : "No se pudo modificar el rol.",
      );
    } finally {
      setRoleBusy(false);
    }
  };

  return (
    <PageShell layer="instrument" className="container admin-users-page">
      <header className="event-header">
        <div>
          <p className="eyebrow">Administración de acceso</p>
          <h1>Administradores</h1>
        </div>
        <div className="event-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => void refreshUsers()}
            disabled={loading || roleBusy}
          >
            Actualizar
          </button>
        </div>
      </header>

      <UserManagementNavigation current="admins" />

      <section className="card user-admin" aria-labelledby="invite-admin-heading">
        <div className="user-admin-heading">
          <div>
            <h2 id="invite-admin-heading">Invitar administrador</h2>
            <p>La persona invitada creará una cuenta nueva con el rol ADMIN.</p>
          </div>
        </div>
        <form className="judge-create-form" onSubmit={createAdminInvitation}>
          <label>Correo del nuevo administrador
            <input
              type="email"
              autoComplete="email"
              required
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              disabled={invitationBusy}
            />
          </label>
          <button type="submit" disabled={invitationBusy}>{invitationBusy ? "Creando invitación…" : "Crear invitación ADMIN"}</button>
        </form>
        {invitationLink && (
          <div className="invitation-link">
            <p>Compartí este enlace con la persona invitada:</p>
            <a href={invitationLink}>Abrir invitación</a>
            <code>{invitationLink}</code>
            <button className="secondary" type="button" onClick={() => void copyInvitationLink()}>Copiar enlace de invitación</button>
          </div>
        )}
      </section>

      {message && <p className="feedback" role="status" aria-live="polite">{message}</p>}

      <section className="card user-admin" aria-label="Usuarios y administradores">
        <div className="user-admin-heading">
          <div>
            <h2>Privilegios de administración</h2>
          </div>
          <span>Gestión de plataforma</span>
        </div>
        <p>
          Gestioná quién puede administrar la plataforma. La cuenta principal no se puede eliminar ni perder el rol ADMIN.
        </p>
        {loading ? (
          <p>Cargando usuarios…</p>
        ) : users.length === 0 ? (
          <p className="empty-state">No se encontraron usuarios registrados.</p>
        ) : (
          <ul>
            {users.map((user) => {
              const isAdmin = user.roles.includes("ADMIN");
              const isCurrentUser = user.id === session.user?.id;
              const isProtectedPrimary = isAdmin && user.isPrimaryAdmin === true;
              return (
                <li key={user.id}>
                  <span>
                    <strong>{user.name}</strong> · {user.email}
                    {user.isPrimaryAdmin === true && <span className="primary-admin-badge">Administrador principal</span>}
                  </span>
                  <button
                    className="secondary"
                    type="button"
                    disabled={isProtectedPrimary || (isCurrentUser && isAdmin) || roleBusy}
                    onClick={(event) => {
                      roleTriggerRef.current = event.currentTarget;
                      setAdminRoleTarget({ user, grant: !isAdmin });
                    }}
                  >
                    {isCurrentUser && isAdmin
                      ? "Sesión actual"
                      : isProtectedPrimary
                        ? "Cuenta principal protegida"
                        : isAdmin
                        ? "Revocar administrador"
                        : "Promover a administrador"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Dialog
        isOpen={Boolean(adminRoleTarget)}
        onClose={() => {
          if (!roleBusy) setAdminRoleTarget(null);
        }}
        title={adminRoleTarget?.grant ? "Promover a administrador" : "Revocar administrador"}
        description={
          adminRoleTarget?.grant
            ? `¿Confirmás que ${adminRoleTarget.user.name} tendrá permisos de administración de la plataforma?`
            : `¿Confirmás que ${adminRoleTarget?.user.name} dejará de tener permisos de administración?`
        }
        focusReturnRef={roleTriggerRef}
      >
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={roleBusy}
            onClick={() => setAdminRoleTarget(null)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={adminRoleTarget?.grant ? "" : "danger-action"}
            disabled={roleBusy}
            onClick={() => void changeAdminRole(adminRoleTarget?.user, adminRoleTarget?.grant)}
          >
            {roleBusy
              ? "Guardando…"
              : adminRoleTarget?.grant
                ? "Confirmar promoción"
                : "Confirmar revocación"}
          </button>
        </div>
      </Dialog>
    </PageShell>
  );
}
