import { describe, expect, it } from 'vitest';
import { canAccessRoute, getRoleHomePath, getRoleMenu, getRouteRedirect, type MenuGroup } from './access';
import type { Role } from './models';

const menuPaths = (groups: MenuGroup[]) => groups.flatMap((group) => group.items.map((menuItem) => menuItem.path));

describe('role-based access rules', () => {
  it.each([
    ['PICKER', ['/orders', '/inventory']],
    ['RECEIVER', ['/receiving', '/inventory']],
    ['MANAGER', ['/', '/inventory', '/receiving', '/orders', '/movements', '/adjustment', '/insights', '/reports', '/settings']],
    ['ADMIN', ['/', '/inventory', '/receiving', '/orders', '/movements', '/adjustment', '/insights', '/reports', '/users', '/settings']],
  ] as const)('%s sees only its configured menu items', (role, expectedPaths) => {
    expect(menuPaths(getRoleMenu(role as Role))).toEqual(expectedPaths);
  });

  it.each([
    ['PICKER', '/orders'],
    ['RECEIVER', '/receiving'],
    ['MANAGER', '/'],
    ['ADMIN', '/'],
  ] as const)('%s lands on its home page after login', (role, path) => {
    expect(getRoleHomePath(role as Role)).toBe(path);
  });

  it('allows routes from the role menu and rejects restricted or unknown routes', () => {
    expect(canAccessRoute('PICKER', '/orders')).toBe(true);
    expect(canAccessRoute('PICKER', '/receiving')).toBe(false);
    expect(canAccessRoute('RECEIVER', '/receiving')).toBe(true);
    expect(canAccessRoute('MANAGER', '/stock-movements')).toBe(true);
    expect(canAccessRoute('ADMIN', '/stock-movements')).toBe(true);
    expect(canAccessRoute('PICKER', '/stock-movements')).toBe(false);
    expect(canAccessRoute('RECEIVER', '/stock-movements')).toBe(false);
    expect(canAccessRoute('PICKER', '/inventory/SKU-001')).toBe(true);
    expect(canAccessRoute('RECEIVER', '/inventory/SKU-001')).toBe(true);
    expect(canAccessRoute('PICKER', '/inventory/SKU-001/extra')).toBe(false);
    expect(canAccessRoute('PICKER', '/')).toBe(false);
    expect(canAccessRoute('RECEIVER', '/adjustment')).toBe(false);
    expect(canAccessRoute('MANAGER', '/users')).toBe(false);
    expect(canAccessRoute('ADMIN', '/users')).toBe(true);
    expect(canAccessRoute('ADMIN', '/not-a-page')).toBe(false);
  });

  it('redirects unauthenticated, unauthorized, and invalid routes without depending on UI', () => {
    const picker = { id: 'picker-01', name: 'Picker Demo', role: 'PICKER' as const };
    const manager = { id: 'manager-01', name: 'Manager Demo', role: 'MANAGER' as const };
    expect(getRouteRedirect(null, '/inventory')).toBe('/login');
    expect(getRouteRedirect(picker, '/inventory/SKU-001')).toBeNull();
    expect(getRouteRedirect(picker, '/')).toBe('/orders');
    expect(getRouteRedirect(picker, '/receiving')).toBe('/orders');
    expect(getRouteRedirect(picker, '/stock-movements')).toBe('/orders');
    const receiver = { id: 'receiver-01', name: 'Receiver Demo', role: 'RECEIVER' as const };
    expect(getRouteRedirect(receiver, '/stock-movements')).toBe('/receiving');
    expect(getRouteRedirect(manager, '/users')).toBe('/');
    expect(getRouteRedirect(manager, '/unknown')).toBe('/');
    expect(getRouteRedirect(manager, '/reports')).toBeNull();
  });
});
