import { useEffect, useRef, useState } from "react";
import { PageShell } from "../components/PageShell.jsx";
import { apiRequest } from "../api/http.js";
import { useSession } from "../auth/session-context.jsx";
import { Dialog } from "../components/Dialog.jsx";

export function AdminUsersPage() {
  const session = useSession();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
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
        error.code === "LAST_ADMIN_REQUIRED"
          ? "No se puede revocar al ultimo administrador."
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
          <h1>Usuarios y administradores</h1>
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

      {message && <p className="feedback" role="status" aria-live="polite">{message}</p>}

      <section className="card user-admin" aria-label="Usuarios y administradores">
        <div className="user-admin-heading">
          <div>
            <h2>Privilegios de administración</h2>
          </div>
          <span>Gestión de plataforma</span>
        </div>
        <p>
          Gestioná quién puede administrar la plataforma. El último administrador siempre queda protegido.
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
              return (
                <li key={user.id}>
                  <span>
                    <strong>{user.name}</strong> · {user.email}
                  </span>
                  <button
                    className="secondary"
                    type="button"
                    disabled={(isCurrentUser && isAdmin) || roleBusy}
                    onClick={(event) => {
                      roleTriggerRef.current = event.currentTarget;
                      setAdminRoleTarget({ user, grant: !isAdmin });
                    }}
                  >
                    {isCurrentUser && isAdmin
                      ? "Sesión actual"
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
