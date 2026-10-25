import { useRef, useState, type PropsWithChildren } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout({ children }: PropsWithChildren) {
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationTriggerRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="app-frame">
      <Sidebar onClose={() => setNavigationOpen(false)} open={navigationOpen} returnFocusRef={navigationTriggerRef} />
      <div className="app-main-column">
        <Topbar navigationTriggerRef={navigationTriggerRef} onOpenNavigation={() => setNavigationOpen(true)} />
        {children}
      </div>
    </div>
  );
}
