import { useState, type PropsWithChildren } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout({ children }: PropsWithChildren) {
  const [navigationOpen, setNavigationOpen] = useState(false);

  return (
    <div className="app-frame">
      <Sidebar onClose={() => setNavigationOpen(false)} open={navigationOpen} />
      <div className="app-main-column">
        <Topbar onOpenNavigation={() => setNavigationOpen(true)} />
        {children}
      </div>
    </div>
  );
}
