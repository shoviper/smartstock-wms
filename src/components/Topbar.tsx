import { useRef, useState, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRoleLabel } from '../domain/access';
import { selectProductsByStatus } from '../domain/inventory';
import type { StockStatus } from '../domain/models';
import { useStore } from '../store/StoreProvider';
import { ResetDemoDialog } from './ResetDemoDialog';

interface TopbarProps {
  onOpenNavigation(): void;
  navigationTriggerRef: RefObject<HTMLButtonElement | null>;
}

const alertOrder: StockStatus[] = ['OUT', 'CRITICAL', 'LOW'];
const alertLabel: Record<StockStatus, string> = {
  OUT: 'Out',
  CRITICAL: 'Critical',
  LOW: 'Low',
  NORMAL: 'Normal',
};

export function Topbar({ onOpenNavigation, navigationTriggerRef }: TopbarProps) {
  const navigate = useNavigate();
  const { state, logout, resetDemoData } = useStore();
  const [openPanel, setOpenPanel] = useState<'alerts' | 'profile' | null>(null);
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const session = state.session;
  if (!session) return null;
  const canResetDemoData = session.role === 'MANAGER' || session.role === 'ADMIN';

  const alerts = alertOrder.flatMap((status) =>
    selectProductsByStatus(state, status)
      .sort((left, right) => left.sku.localeCompare(right.sku))
      .map((product) => ({ product, status })),
  );

  function handleLogout() {
    logout();
    setOpenPanel(null);
    navigate('/login', { replace: true });
  }

  function handleResetDemoData() {
    resetDemoData();
    setResetConfirmationOpen(false);
    setOpenPanel(null);
  }

  return (
    <>
    <header className="topbar">
      <div className="topbar-leading">
        <button aria-label="Open navigation" className="mobile-menu-button" onClick={onOpenNavigation} ref={navigationTriggerRef} type="button">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <label className="topbar-search">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.3" /><path d="m16 16 4.2 4.2" /></svg>
          <input aria-label="Search" placeholder="Search anything..." type="search" />
          <kbd>⌘ K</kbd>
        </label>
      </div>
      <div className="topbar-actions">
        <div className="popover-anchor">
          <button
            aria-expanded={openPanel === 'alerts'}
            aria-label={`Stock alerts: ${alerts.length}`}
            className="icon-button notification-button"
            onClick={() => setOpenPanel(openPanel === 'alerts' ? null : 'alerts')}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
            {alerts.length > 0 && <span className="alert-count">{alerts.length}</span>}
          </button>
          {openPanel === 'alerts' && (
            <section aria-label="Stock alerts" className="popover-panel alerts-panel">
              <div className="popover-heading">
                <div><strong>Stock alerts</strong><span>{alerts.length} items need attention</span></div>
                <button aria-label="Close alerts" className="popover-close" onClick={() => setOpenPanel(null)} type="button">×</button>
              </div>
              {alerts.length === 0 ? (
                <p className="popover-empty">No stock alerts right now.</p>
              ) : (
                <ul className="alert-list">
                  {alerts.slice(0, 6).map(({ product, status }) => (
                    <li key={product.sku}>
                      <span className={`status-indicator status-${status.toLowerCase()}`} />
                      <span className="alert-product"><strong>{product.name}</strong><small>{product.sku} · {product.onHand} {product.unit}</small></span>
                      <span className={`alert-status status-text-${status.toLowerCase()}`}>{alertLabel[status]}</span>
                    </li>
                  ))}
                </ul>
              )}
              {alerts.length > 6 && <p className="alert-more">Showing 6 of {alerts.length} items</p>}
              <Link className="alerts-view-all" onClick={() => setOpenPanel(null)} to="/inventory?status=out,critical,low">View all in Inventory</Link>
            </section>
          )}
        </div>
        <div className="profile-anchor popover-anchor">
          <button
            aria-expanded={openPanel === 'profile'}
            className="profile-button"
            onClick={() => setOpenPanel(openPanel === 'profile' ? null : 'profile')}
            ref={profileTriggerRef}
            type="button"
          >
            <span aria-hidden="true" className="profile-avatar">{session.name.trim().slice(0, 1).toUpperCase() || 'D'}</span>
            <span className="profile-copy"><strong>{session.name}</strong><small>{getRoleLabel(session.role)}</small></span>
            <span aria-hidden="true" className="profile-chevron">⌄</span>
          </button>
          {openPanel === 'profile' && (
            <section aria-label="Profile menu" className="popover-panel profile-panel">
              <p className="profile-menu-name">{session.name}</p>
              <p className="profile-menu-role">{getRoleLabel(session.role)} · Demo access</p>
              {canResetDemoData && <button className="profile-reset-demo" onClick={() => { setOpenPanel(null); setResetConfirmationOpen(true); }} type="button">Reset demo data</button>}
              <button className="profile-logout" onClick={handleLogout} type="button">Log Out</button>
            </section>
          )}
        </div>
      </div>
    </header>
    {resetConfirmationOpen && <ResetDemoDialog onCancel={() => setResetConfirmationOpen(false)} onConfirm={handleResetDemoData} returnFocusRef={profileTriggerRef} />}
    </>
  );
}
