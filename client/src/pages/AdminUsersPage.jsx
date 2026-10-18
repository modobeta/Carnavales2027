import { useEffect, useRef, useState } from "react";
import { PageShell } from "../components/PageShell.jsx";
import { apiRequest } from "../api/http.js";
import { useSession } from "../auth/session-context.jsx";
import { Dialog } from "../components/Dialog.jsx";
import { UserManagementNavigation } from "../components/UserManagementNavigation.jsx";
import { AdminAccessList } from "../components/AdminAccessList.jsx";
import { AdminPromotionSearch } from "../components/AdminPromotionSearch.jsx";
import { AdminInvitationForm } from "../components/AdminInvitationForm.jsx";

export function AdminUsersPage() {
  const session = useSession();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [roleTarget, setRoleTarget] = useState(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [searchRefreshKey, setSearchRefreshKey] = useState(0);
  const roleTriggerRef = useRef(null);

  const refreshAdmins = async () => {
    setLoading(true);
    try {
      const data = await apiRequest("/api/v1/users?role=ADMIN");
      setAdmins(data);
    } catch {
      setMessage("No se pudieron cargar los administradores.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAdmins();
  }, []);

  const changeAdminRole = async (user, grant) => {
    if (!user || roleBusy) return;
    setRoleBusy(true);
    try {
      await apiRequest(`/api/v1/users/${user.id}/roles/admin`, {
        method: grant ? "POST" : "DELETE",
      });
      setRoleTarget(null);
      setMessage(grant ? "Administrador promovido." : "Rol ADMIN revocado.");
      setSearchRefreshKey((key) => key + 1);
      await refreshAdmins();
    } catch (error) {
      setRoleTarget(null);
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

  const isGranting = Boolean(roleTarget?.grant);
  const targetName = roleTarget?.user.name;

  return (
    <PageShell layer="instrument" className="container admin-users-page">
      <header className="event-header">
        <div>
          <p className="eyebrow">Administración de acceso</p>
          <h1>Administradores</h1>
        </div>
      </header>

      <UserManagementNavigation current="admins" />

      <section className="card user-admin access-section" aria-labelledby="active-admins-heading">
        <div className="user-admin-heading">
          <h2 id="active-admins-heading">Administradores activos</h2>
          {!loading && <span className="access-count">{admins.length} {admins.length === 1 ? "activo" : "activos"}</span>}
        </div>
        <p>La cuenta principal no puede perder el rol ADMIN. Al revocar un administrador, deja de aparecer en esta lista.</p>
        {message && <p className="feedback" role="status" aria-live="polite">{message}</p>}
        {loading ? (
          <p>Cargando administradores…</p>
        ) : admins.length === 0 ? (
          <p className="empty-state">No hay administradores registrados.</p>
        ) : (
          <AdminAccessList
            admins={admins}
            currentUserId={session.user?.id}
            busy={roleBusy}
            triggerRef={roleTriggerRef}
            onRevoke={(user) => setRoleTarget({ user, grant: false })}
          />
        )}
      </section>

      <section className="card user-admin access-section" aria-labelledby="add-admin-heading">
        <div className="user-admin-heading">
          <h2 id="add-admin-heading">Agregar administrador</h2>
        </div>
        <p>Promové a un usuario existente o invitá una cuenta nueva con rol ADMIN.</p>
        <AdminPromotionSearch
          busy={roleBusy}
          refreshKey={searchRefreshKey}
          triggerRef={roleTriggerRef}
          onPromote={(user) => setRoleTarget({ user, grant: true })}
        />
        <div className="access-divider" role="separator">o invitar una cuenta nueva</div>
        <AdminInvitationForm />
      </section>

      <Dialog
        isOpen={Boolean(roleTarget)}
        onClose={() => {
          if (!roleBusy) setRoleTarget(null);
        }}
        title={isGranting ? "Promover a administrador" : "Revocar administrador"}
        tone={isGranting ? "default" : "danger"}
        description={
          isGranting
            ? `¿Confirmás que ${targetName} tendrá permisos de administración de la plataforma?`
            : `¿Confirmás que ${targetName} dejará de tener permisos de administración?`
        }
        focusReturnRef={roleTriggerRef}
      >
        <div className="dialog-actions">
          <button
            type="button"
            className="secondary"
            disabled={roleBusy}
            onClick={() => setRoleTarget(null)}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={isGranting ? "" : "danger-action"}
            disabled={roleBusy}
            onClick={() => void changeAdminRole(roleTarget?.user, roleTarget?.grant)}
          >
            {roleBusy
              ? "Guardando…"
              : isGranting
                ? "Confirmar promoción"
                : "Confirmar revocación"}
          </button>
        </div>
      </Dialog>
    </PageShell>
  );
}
