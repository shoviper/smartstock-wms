import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './components/LoginPage';
import { InventoryPage } from './components/InventoryPage';
import { ProductDetailPage } from './components/ProductDetailPage';
import { getRouteRedirect, ALL_MENU_ITEMS } from './domain/access';
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

export default function App() {
  const { state } = useStore();
  const location = useLocation();
  const redirect = getRouteRedirect(state.session, location.pathname);
  const themed = (content: ReactNode) => <div className="app-root" data-theme={state.theme}>{content}</div>;

  if (redirect === '/login' && location.pathname !== '/login') {
    return themed(<Navigate replace to="/login" />);
  }
  if (redirect === '/login') return themed(<LoginPage />);
  if (redirect) return themed(<Navigate replace to={redirect} />);

  return themed(
    <AppLayout>
      <Routes>
        <Route element={<ProductDetailPage />} path="/inventory/:sku" />
        <Route element={<InventoryPage />} path="/inventory" />
        {ALL_MENU_ITEMS.map(({ path, label }) => (
          path === '/inventory' ? null : <Route element={<PagePlaceholder label={label} />} key={path} path={path} />
        ))}
        <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </AppLayout>,
  );
}
