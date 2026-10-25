import { useRef, type RefObject } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { getRoleHomePath, getRoleMenu } from '../domain/access';
import { useStore } from '../store/StoreProvider';
import { useAccessibleOverlay } from '../hooks/useAccessibleOverlay';
import { Brand } from './Brand';

interface SidebarProps {
  open: boolean;
  onClose(): void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

export function Sidebar({ open, onClose, returnFocusRef }: SidebarProps) {
  const navigate = useNavigate();
  const { state, logout, toggleTheme } = useStore();
  const sidebarRef = useRef<HTMLElement>(null);
  const session = state.session;
  useAccessibleOverlay(open, onClose, sidebarRef, returnFocusRef);
  if (!session) return null;

  const groups = getRoleMenu(session.role);

  function handleLogout() {
    logout();
    onClose();
    navigate('/login', { replace: true });
  }

  return (
    <>
      {open && <button aria-label="Close navigation" className="drawer-backdrop" onClick={onClose} type="button" />}
      <aside aria-label="Sidebar" className={`sidebar${open ? ' sidebar-open' : ''}`} ref={sidebarRef}>
        <NavLink className="sidebar-brand-link" onClick={onClose} to={getRoleHomePath(session.role)}>
          <Brand />
        </NavLink>
        <nav aria-label="Main navigation" className="sidebar-nav">
          {groups.map((group) => (
            <section aria-label={group.label ?? 'Dashboard'} className="nav-group" key={group.id}>
              {group.label && <h2 className="nav-heading">{group.label}</h2>}
              {group.items.map(({ path, label }) => (
                <NavLink
                  className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}
                  end={path === '/'}
                  key={path}
                  onClick={onClose}
                  to={path}
                >
                  <span aria-hidden="true" className="nav-link-dot" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button aria-pressed={state.theme === 'dark'} className="sidebar-action" onClick={toggleTheme} type="button">
            <span aria-hidden="true" className="action-icon">{state.theme === 'dark' ? '☾' : '☼'}</span>
            <span>{state.theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
            <span className={`theme-switch${state.theme === 'dark' ? ' theme-switch-on' : ''}`} aria-hidden="true"><span /></span>
          </button>
          <button className="sidebar-action logout-action" onClick={handleLogout} type="button">
            <span aria-hidden="true" className="action-icon">↪</span>
            <span>Log Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
