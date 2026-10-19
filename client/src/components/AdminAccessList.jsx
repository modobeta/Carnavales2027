export function AdminAccessList({ admins, currentUserId, busy, onRevoke, triggerRef }) {
  return (
    <ul className="access-list" aria-label="Administradores activos">
      {admins.map((admin) => {
        const isCurrentUser = admin.id === currentUserId;
        return (
          <li key={admin.id} className="access-row">
            <div className="access-person">
              <strong>{admin.name}</strong>
              <span>{admin.email}</span>
            </div>
            <div className="access-status">
              {admin.isPrimaryAdmin && <span className="primary-admin-badge">Administrador principal</span>}
              {isCurrentUser && <span className="access-current">Sesión actual</span>}
              {!admin.isPrimaryAdmin && !isCurrentUser && (
                <button
                  className="danger-action"
                  type="button"
                  disabled={busy}
                  onClick={(event) => {
                    triggerRef.current = event.currentTarget;
                    onRevoke(admin);
                  }}
                >
                  Revocar administrador
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
