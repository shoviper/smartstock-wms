import { useEffect } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './components/LoginPage';
import { InventoryPage } from './components/InventoryPage';
import { ProductDetailPage } from './components/ProductDetailPage';
import { ReceivingPage } from './components/ReceivingPage';
import { StockMovementsPage } from './components/StockMovementsPage';
import { StockAdjustmentPage } from './components/StockAdjustmentPage';
import { DashboardPage } from './components/DashboardPage';
import { AIInsightsPage } from './components/AIInsightsPage';
import { ReportsPage } from './components/ReportsPage';
import { UsersRolesPage } from './components/UsersRolesPage';
import { SettingsPage } from './components/SettingsPage';
import { OrderDetailPage, OrdersListPage } from './components/OrdersPickingPage';
import { getRoleHomePath, getRouteRedirect, ALL_MENU_ITEMS } from './domain/access';
import { useStore } from './store/StoreProvider';

function PagePlaceholder({ label }: { label: string }) {
  return (
    <main className="page-content">
      <p className="eyebrow">SMARTSTOCK WMS · DEMO</p>
      <h1>{label}</h1>
      <p className="intro">This page is part of the approved prototype scope.</p>
      <div className="placeholder-card">Round 1 foundation is being prepared.</div>
    </main>
  );
}

function NotFoundPage({ homePath }: { homePath: string }) {
  return <main className="not-found-page">
    <p className="eyebrow">SMARTSTOCK WMS</p>
    <h1>We couldn’t find that page</h1>
    <p>Check the address or return to your home page.</p>
    <Link className="primary-button not-found-link" to={homePath}>Go to home</Link>
  </main>;
}

function isKnownPath(path: string) {
  return ALL_MENU_ITEMS.some(({ path: menuPath }) => menuPath === path)
    || /^\/inventory\/[^/]+$/.test(path)
    || path === '/orders-picking'
    || /^\/orders-picking\/[^/]+$/.test(path)
    || path === '/stock-movements';
}

function pageTitle(path: string) {
  if (path === '/login') return 'Login';
  if (/^\/inventory\/[^/]+$/.test(path)) return decodeURIComponent(path.split('/')[2]);
  if (/^\/orders-picking\/[^/]+$/.test(path)) return `Order ${decodeURIComponent(path.split('/')[2])}`;
  const pages: Record<string, string> = {
    '/': 'Dashboard', '/inventory': 'Inventory', '/receiving': 'Receiving', '/orders': 'Orders & Picking',
    '/orders-picking': 'Orders & Picking', '/movements': 'Stock Movements', '/stock-movements': 'Stock Movements',
    '/adjustment': 'Stock Adjustment', '/ai-insights': 'AI Insights', '/reports': 'Reports',
    '/users': 'Users & Roles', '/settings': 'Settings',
  };
  return pages[path] ?? ALL_MENU_ITEMS.find((item) => item.path === path)?.label ?? 'Not found';
}

export default function App() {
  const { state } = useStore();
  const location = useLocation();
  const redirect = getRouteRedirect(state.session, location.pathname);
  const themed = (content: ReactNode) => <div className="app-root" data-theme={state.theme}>{content}</div>;
  const unknownPath = !isKnownPath(location.pathname) && location.pathname !== '/login';

  useEffect(() => {
    document.title = `${pageTitle(location.pathname)} · SmartStock WMS`;
  }, [location.pathname]);

  if (unknownPath) return themed(<NotFoundPage homePath={state.session ? getRoleHomePath(state.session.role) : '/login'} />);
  if (redirect === '/login' && location.pathname !== '/login') {
    return themed(<Navigate replace to="/login" />);
  }
  if (redirect === '/login') return themed(<LoginPage />);
  if (redirect) return themed(<Navigate replace to={redirect} />);

  return themed(
    <AppLayout>
      <Routes>
        <Route element={<DashboardPage />} path="/" />
        <Route element={<ProductDetailPage />} path="/inventory/:sku" />
        <Route element={<InventoryPage />} path="/inventory" />
        <Route element={<ReceivingPage />} path="/receiving" />
        <Route element={<OrdersListPage />} path="/orders" />
        <Route element={<OrdersListPage />} path="/orders-picking" />
        <Route element={<OrderDetailPage />} path="/orders-picking/:orderId" />
        <Route element={<StockMovementsPage />} path="/movements" />
        <Route element={<StockMovementsPage />} path="/stock-movements" />
        <Route element={<StockAdjustmentPage />} path="/adjustment" />
        <Route element={<AIInsightsPage />} path="/ai-insights" />
        <Route element={<UsersRolesPage />} path="/users" />
        <Route element={<SettingsPage />} path="/settings" />
        {ALL_MENU_ITEMS.map(({ path, label }) => (
          path === '/' || path === '/inventory' || path === '/receiving' || path === '/orders' || path === '/movements' || path === '/adjustment' || path === '/ai-insights' || path === '/reports' || path === '/users' || path === '/settings' ? null : <Route element={<PagePlaceholder label={label} />} key={path} path={path} />
        ))}
        <Route element={<ReportsPage />} path="/reports" />
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </AppLayout>,
  );
}
