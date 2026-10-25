import { getRoleLabel, getRolePermissionsMatrix } from '../domain/access';
import { useStore } from '../store/StoreProvider';

const capabilityLabels = [
  ['canReceive', 'Receive stock'],
  ['canPick', 'Pick stock'],
  ['canAdjust', 'Adjust stock'],
  ['canUpdateReorderPoint', 'Edit reorder point'],
] as const;

export function UsersRolesPage() {
  const { state } = useStore();
  const users = Object.values(state.users).sort((left, right) => left.role.localeCompare(right.role) || left.name.localeCompare(right.name));
  const permissions = getRolePermissionsMatrix();

  return <main className="page-content admin-page">
    <header className="admin-page-header"><p className="eyebrow">SMARTSTOCK WMS · ACCESS</p><h1>Users &amp; Roles</h1><p className="intro">Review demo users and role permissions.</p></header>
    <section aria-labelledby="users-list-title" className="settings-section">
      <div className="settings-section-heading"><div><h2 id="users-list-title">Demo users</h2><p>Users listed here come from the shared store.</p></div></div>
      {users.length === 0 ? <div className="settings-empty"><h3>No demo users</h3><p>User records are not available in the store.</p></div> : <div className="settings-table-wrap"><table className="settings-table"><thead><tr><th scope="col">Name</th><th scope="col">Role</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name}</td><td>{getRoleLabel(user.role)}</td></tr>)}</tbody></table></div>}
    </section>
    <section aria-labelledby="permissions-title" className="settings-section">
      <div className="settings-section-heading"><div><h2 id="permissions-title">Role permissions</h2><p>Menus and action capabilities generated from the application access rules.</p></div></div>
      <div className="settings-table-wrap"><table className="settings-table permissions-table"><thead><tr><th scope="col">Role</th><th scope="col">Menus visible</th><th scope="col">Can do</th></tr></thead><tbody>
        {permissions.map((row) => <tr key={row.role}><th scope="row">{getRoleLabel(row.role)}</th><td>{row.menus.length ? row.menus.join(', ') : 'No menus'}</td><td>{capabilityLabels.filter(([key]) => row.capabilities[key]).map(([, label]) => label).join(', ') || 'No stock actions'}</td></tr>)}
      </tbody></table></div>
    </section>
    <aside className="settings-note"><strong>Concept only — read-only</strong><p>Account creation and deactivation, including user status, are on the roadmap. In a real system, an Admin would manage accounts through the organization’s identity system (SSO).</p></aside>
  </main>;
}
