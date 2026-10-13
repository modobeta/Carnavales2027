export function UserManagementNavigation({ current }) {
  return (
    <nav className="user-management-nav" aria-label="Secciones de usuarios">
      <a
        href="#/admin/judges"
        aria-current={current === "create" ? "page" : undefined}
      >
        Crear e invitar
      </a>
      <a
        href="#/admin/users"
        aria-current={current === "admins" ? "page" : undefined}
      >
        Administradores
      </a>
    </nav>
  );
}
