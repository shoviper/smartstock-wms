import { describe, expect, it } from 'vitest';
import { canAccessRoute, getRoleCapabilities, getRoleHomePath, getRoleMenu, getRolePermissionsMatrix, getRouteRedirect, type MenuGroup } from './access';
import type { Role } from './models';

const menuPaths = (groups: MenuGroup[]) => groups.flatMap((group) => group.items.map((menuItem) => menuItem.path));

describe('role-based access rules', () => {
  it.each([
    ['PICKER', ['/orders', '/inventory']],
    ['RECEIVER', ['/receiving', '/inventory']],
    ['MANAGER', ['/', '/inventory', '/receiving', '/orders', '/movements', '/adjustment', '/ai-insights', '/reports', '/settings']],
    ['ADMIN', ['/', '/inventory', '/receiving', '/orders', '/movements', '/adjustment', '/ai-insights', '/reports', '/users', '/settings']],
  ] as const)('%s sees only its configured menu items', (role, expectedPaths) => {
    expect(menuPaths(getRoleMenu(role as Role))).toEqual(expectedPaths);
  });

  it('builds the role permission table from the access menu and action capabilities', () => {
    const matrix = getRolePermissionsMatrix();
    expect(matrix.map(({ role }) => role)).toEqual(['PICKER', 'RECEIVER', 'MANAGER', 'ADMIN']);
    for (const row of matrix) {
      expect(row.menus).toEqual(getRoleMenu(row.role).flatMap((group) => group.items.map(({ label }) => label)));
      expect(row.capabilities).toEqual(getRoleCapabilities(row.role));
    }
    expect(matrix.map(({ role, capabilities }) => [role, capabilities])).toEqual([
      ['PICKER', { canReceive: false, canPick: true, canAdjust: false, canUpdateReorderPoint: false }],
      ['RECEIVER', { canReceive: true, canPick: false, canAdjust: false, canUpdateReorderPoint: false }],
      ['MANAGER', { canReceive: true, canPick: true, canAdjust: true, canUpdateReorderPoint: true }],
      ['ADMIN', { canReceive: true, canPick: true, canAdjust: true, canUpdateReorderPoint: true }],
    ]);
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
    expect(canAccessRoute('PICKER', '/orders-picking')).toBe(true);
    expect(canAccessRoute('PICKER', '/orders-picking/ORD-2026-0001')).toBe(true);
    expect(canAccessRoute('MANAGER', '/orders-picking/ORD-2026-0001')).toBe(true);
    expect(canAccessRoute('ADMIN', '/orders-picking/ORD-2026-0001')).toBe(true);
    expect(canAccessRoute('RECEIVER', '/orders-picking/ORD-2026-0001')).toBe(false);
    expect(canAccessRoute('PICKER', '/receiving')).toBe(false);
    expect(canAccessRoute('RECEIVER', '/receiving')).toBe(true);
    expect(canAccessRoute('MANAGER', '/stock-movements')).toBe(true);
    expect(canAccessRoute('ADMIN', '/stock-movements')).toBe(true);
    expect(canAccessRoute('MANAGER', '/ai-insights')).toBe(true);
    expect(canAccessRoute('ADMIN', '/ai-insights')).toBe(true);
    expect(canAccessRoute('PICKER', '/ai-insights')).toBe(false);
    expect(canAccessRoute('RECEIVER', '/ai-insights')).toBe(false);
    expect(canAccessRoute('MANAGER', '/insights')).toBe(false);
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
    for (const role of ['PICKER', 'RECEIVER', 'MANAGER'] as const) expect(canAccessRoute(role, '/users')).toBe(false);
  });

  it('redirects unauthenticated, unauthorized, and invalid routes without depending on UI', () => {
    const picker = { id: 'picker-01', name: 'Picker Demo', role: 'PICKER' as const };
    const manager = { id: 'manager-01', name: 'Manager Demo', role: 'MANAGER' as const };
    expect(getRouteRedirect(null, '/inventory')).toBe('/login');
    expect(getRouteRedirect(picker, '/inventory/SKU-001')).toBeNull();
    expect(getRouteRedirect(picker, '/')).toBe('/orders');
    expect(getRouteRedirect(picker, '/receiving')).toBe('/orders');
    expect(getRouteRedirect(picker, '/orders-picking/ORD-2026-0001')).toBeNull();
    expect(getRouteRedirect(picker, '/stock-movements')).toBe('/orders');
    const receiver = { id: 'receiver-01', name: 'Receiver Demo', role: 'RECEIVER' as const };
    expect(getRouteRedirect(receiver, '/stock-movements')).toBe('/receiving');
    expect(getRouteRedirect(receiver, '/orders-picking/ORD-2026-0001')).toBe('/receiving');
    expect(getRouteRedirect(manager, '/users')).toBe('/');
    expect(getRouteRedirect(manager, '/unknown')).toBe('/');
    expect(getRouteRedirect(manager, '/reports')).toBeNull();
  });

  it.each(['PICKER', 'RECEIVER', 'MANAGER'] as const)('%s cannot open Users & Roles', (role) => {
    const state = createRoleSession(role);
    expect(canAccessRoute(role, '/users')).toBe(false);
    expect(getRouteRedirect(state, '/users')).toBe(getRoleHomePath(role));
  });
});

function createRoleSession(role: Role) {
  return { id: `user-${role.toLowerCase()}-01`, name: `${role} Demo`, role };
}
