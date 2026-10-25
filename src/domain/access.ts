import type { Role, User } from './models';

export type AppPath =
  | '/'
  | '/inventory'
  | '/receiving'
  | '/orders'
  | '/movements'
  | '/adjustment'
  | '/ai-insights'
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

export interface RoleCapabilities {
  canReceive: boolean;
  canPick: boolean;
  canAdjust: boolean;
  canUpdateReorderPoint: boolean;
}

export interface RolePermissionsRow {
  role: Role;
  menus: string[];
  capabilities: RoleCapabilities;
}

export const APP_ROLES: Role[] = ['PICKER', 'RECEIVER', 'MANAGER', 'ADMIN'];

export const ALL_MENU_ITEMS: MenuItem[] = [
  { path: '/', label: 'Dashboard' },
  { path: '/inventory', label: 'Inventory' },
  { path: '/receiving', label: 'Receiving' },
  { path: '/orders', label: 'Orders & Picking' },
  { path: '/movements', label: 'Stock Movements' },
  { path: '/adjustment', label: 'Stock Adjustment' },
  { path: '/ai-insights', label: 'AI Insights' },
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
  MANAGER: ['/ai-insights', '/reports', '/settings'],
  ADMIN: ['/ai-insights', '/reports', '/users', '/settings'],
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

export function getRoleCapabilities(role: Role): RoleCapabilities {
  return {
    canReceive: role === 'RECEIVER' || role === 'MANAGER' || role === 'ADMIN',
    canPick: role === 'PICKER' || role === 'MANAGER' || role === 'ADMIN',
    canAdjust: role === 'MANAGER' || role === 'ADMIN',
    canUpdateReorderPoint: role === 'MANAGER' || role === 'ADMIN',
  };
}

export function getRolePermissionsMatrix(): RolePermissionsRow[] {
  return APP_ROLES.map((role) => ({
    role,
    menus: getRoleMenu(role).flatMap((group) => group.items.map((menuItem) => menuItem.label)),
    capabilities: getRoleCapabilities(role),
  }));
}

export function getRoleHomePath(role: Role): AppPath {
  switch (role) {
    case 'PICKER': return '/orders';
    case 'RECEIVER': return '/receiving';
    case 'MANAGER':
    case 'ADMIN': return '/';
  }
}

export function canAccessRoute(role: Role, path: string): boolean {
  if (path === '/orders-picking' || /^\/orders-picking\/[^/]+$/.test(path)) {
    return role === 'PICKER' || role === 'MANAGER' || role === 'ADMIN';
  }
  if (path === '/receiving') return role !== 'PICKER';
  if (path === '/stock-movements') return role === 'MANAGER' || role === 'ADMIN';
  const hasInventoryAccess = getRoleMenu(role).some((group) => group.items.some((menuItem) => menuItem.path === '/inventory'));
  if (hasInventoryAccess && /^\/inventory\/[^/]+$/.test(path)) return true;
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
