import type { Role, User } from './models';

export type AppPath =
  | '/'
  | '/inventory'
  | '/receiving'
  | '/orders'
  | '/movements'
  | '/adjustment'
  | '/insights'
  | '/reports'
  | '/users'
  | '/settings';

export interface MenuItem {
  path: AppPath;
  label: string;
}

export interface MenuGroup {
  id: 'dashboard' | 'main' | 'explore';
  label?: 'MAIN' | 'EXPLORE';
  items: MenuItem[];
}

export const ALL_MENU_ITEMS: MenuItem[] = [
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

const item = (path: AppPath) => ALL_MENU_ITEMS.find((candidate) => candidate.path === path)!;
const roleMainPaths: Record<Role, AppPath[]> = {
  PICKER: ['/orders', '/inventory'],
  RECEIVER: ['/receiving', '/inventory'],
  MANAGER: ['/inventory', '/receiving', '/orders', '/movements', '/adjustment'],
  ADMIN: ['/inventory', '/receiving', '/orders', '/movements', '/adjustment'],
};
const roleExplorePaths: Record<Role, AppPath[]> = {
  PICKER: [],
  RECEIVER: [],
  MANAGER: ['/insights', '/reports', '/settings'],
  ADMIN: ['/insights', '/reports', '/users', '/settings'],
};

export function getRoleMenu(role: Role): MenuGroup[] {
  const groups: MenuGroup[] = [];
  if (role === 'MANAGER' || role === 'ADMIN') {
    groups.push({ id: 'dashboard', items: [item('/')] });
  }
  const mainItems = roleMainPaths[role].map(item);
  if (mainItems.length > 0) groups.push({ id: 'main', label: 'MAIN', items: mainItems });
  const exploreItems = roleExplorePaths[role].map(item);
  if (exploreItems.length > 0) groups.push({ id: 'explore', label: 'EXPLORE', items: exploreItems });
  return groups;
}

export function getRoleHomePath(role: Role): AppPath {
  switch (role) {
    case 'PICKER': return '/orders';
    case 'RECEIVER': return '/receiving';
    case 'MANAGER':
    case 'ADMIN': return '/';
  }
}

export function canAccessRoute(role: Role, path: string): path is AppPath {
  return getRoleMenu(role).some((group) => group.items.some((menuItem) => menuItem.path === path));
}

export function getRouteRedirect(session: User | null, path: string): AppPath | '/login' | null {
  if (!session) return '/login';
  if (path === '/login' || !canAccessRoute(session.role, path)) return getRoleHomePath(session.role);
  return null;
}

export function getRoleLabel(role: Role): string {
  return role[0] + role.slice(1).toLowerCase();
}

export function createDemoSession(users: Record<string, User>, role: Role, username: string): User {
  const roleUser = Object.values(users).find((user) => user.role === role);
  if (!roleUser) throw new Error(`No demo user configured for ${role}.`);
  return { ...roleUser, name: username.trim() || `Demo ${getRoleLabel(role)}` };
}
