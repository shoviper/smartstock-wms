import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

const pages = [
  { path: '/', label: 'Dashboard' },
  { path: '/inventory', label: 'Inventory' },
  { path: '/receiving', label: 'Receiving' },
  { path: '/orders', label: 'Orders & Picking' },
  { path: '/movements', label: 'Stock Movements' },
  { path: '/adjustment', label: 'Stock Adjustment' },
  { path: '/insights', label: 'AI Insights' },
  { path: '/reports', label: 'Reports' },
  { path: '/users', label: 'Users & Roles' },
  { path: '/settings', label: 'Settings' },
];

function PagePlaceholder() {
  const location = useLocation();
  const page = pages.find(({ path }) => path === location.pathname);

  if (!page) return <Navigate to="/" replace />;

  return (
    <main className="page-content">
      <p className="eyebrow">SMARTSTOCK WMS · DEMO</p>
      <h1>{page.label}</h1>
      <p className="intro">This page is part of the approved prototype scope.</p>
      <div className="placeholder-card">Round 1 foundation is being prepared.</div>
    </main>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SmartStock WMS</span>
        </Link>
        <nav aria-label="Main navigation">
          <p className="nav-heading">WORKSPACE</p>
          {pages.map(({ path, label }) => (
            <Link className="nav-link" key={path} to={path}>{label}</Link>
          ))}
        </nav>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span>Warehouse operations</span>
          <span className="demo-label">Demo prototype</span>
        </header>
        <Routes>
          {pages.map(({ path }) => <Route element={<PagePlaceholder />} key={path} path={path} />)}
          <Route element={<Navigate to="/" replace />} path="*" />
        </Routes>
      </div>
    </div>
  );
}
