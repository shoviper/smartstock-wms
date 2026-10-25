import { describe, expect, it } from 'vitest';
import { DEFAULT_INVENTORY_FILTERS, filterAndSortInventory, getStockStatus, hasActiveInventoryFilters, parseInventoryQuery, resetInventoryFilters, selectSkuMovementHistory, serializeInventoryQuery, toggleInventorySort, updateReorderPoint, InventoryActionError, type InventoryFilters, type InventoryRow } from './inventory';
import { createInitialStoreState } from '../store/persistence';
import { parseWholeNumber } from './validation';

const rows: InventoryRow[] = [
  { product: { sku: 'SKU-003', name: 'Red tape', category: 'Packing', unit: 'roll', locationId: 'loc-a', onHand: 0, reorderPoint: 10, leadTimeDays: 4 }, zone: 'North', status: 'OUT' },
  { product: { sku: 'SKU-002', name: 'Box small', category: 'Packaging', unit: 'ea', locationId: 'loc-b', onHand: 4, reorderPoint: 10, leadTimeDays: 4 }, zone: 'South', status: 'LOW' },
  { product: { sku: 'SKU-001', name: 'Box large', category: 'Packaging', unit: 'ea', locationId: 'loc-a', onHand: 15, reorderPoint: 10, leadTimeDays: 4 }, zone: 'North', status: 'NORMAL' },
  { product: { sku: 'SKU-004', name: 'Tape blue', category: 'Packing', unit: 'roll', locationId: 'loc-b', onHand: 3, reorderPoint: 10, leadTimeDays: 4 }, zone: 'South', status: 'CRITICAL' },
];
const defaults: InventoryFilters = { search: '', category: '', statuses: [], zone: '', sort: 'sku', direction: 'asc' };
const skus = (filters: Partial<InventoryFilters>) => filterAndSortInventory(rows, { ...defaults, ...filters }).map(({ product }) => product.sku);

describe('inventory selectors', () => {
  it('searches SKU and product name without case sensitivity', () => {
    expect(skus({ search: 'sKu-003' })).toEqual(['SKU-003']);
    expect(skus({ search: 'TAPE BLUE' })).toEqual(['SKU-004']);
  });

  it('filters by category, multiple statuses, and Zone independently', () => {
    expect(skus({ category: 'Packaging' })).toEqual(['SKU-001', 'SKU-002']);
    expect(skus({ statuses: ['OUT', 'CRITICAL'] })).toEqual(['SKU-003', 'SKU-004']);
    expect(skus({ zone: 'South' })).toEqual(['SKU-002', 'SKU-004']);
  });

  it('combines search and multiple filters', () => {
    expect(skus({ search: 'box', category: 'Packaging', statuses: ['LOW', 'NORMAL'], zone: 'North' })).toEqual(['SKU-001']);
  });

  it('sorts by SKU, name, quantity and stock severity with SKU tie break', () => {
    expect(skus({ sort: 'sku' })).toEqual(['SKU-001', 'SKU-002', 'SKU-003', 'SKU-004']);
    expect(skus({ sort: 'sku', direction: 'desc' })).toEqual(['SKU-004', 'SKU-003', 'SKU-002', 'SKU-001']);
    expect(skus({ sort: 'name' })).toEqual(['SKU-001', 'SKU-002', 'SKU-003', 'SKU-004']);
    expect(skus({ sort: 'onHand', direction: 'desc' })).toEqual(['SKU-001', 'SKU-002', 'SKU-004', 'SKU-003']);
    expect(skus({ sort: 'status', direction: 'desc' })).toEqual(['SKU-001', 'SKU-002', 'SKU-004', 'SKU-003']);
  });

  it('toggles the selected sort direction, including SKU', () => {
    const descending = toggleInventorySort(DEFAULT_INVENTORY_FILTERS, 'sku');
    const ascending = toggleInventorySort(descending, 'sku');
    expect(descending).toMatchObject({ sort: 'sku', direction: 'desc' });
    expect(ascending).toMatchObject({ sort: 'sku', direction: 'asc' });
    expect(toggleInventorySort(ascending, 'sku')).toMatchObject({ sort: 'sku', direction: 'desc' });
    expect(toggleInventorySort({ ...DEFAULT_INVENTORY_FILTERS, sort: 'name', direction: 'desc' }, 'onHand')).toMatchObject({ sort: 'onHand', direction: 'asc' });
  });

  it('starts each newly selected column at its ascending default', () => {
    const descendingName = { ...DEFAULT_INVENTORY_FILTERS, sort: 'name' as const, direction: 'desc' as const };
    expect(toggleInventorySort(descendingName, 'sku')).toMatchObject({ sort: 'sku', direction: 'asc' });
    expect(toggleInventorySort(descendingName, 'onHand')).toMatchObject({ sort: 'onHand', direction: 'asc' });
    expect(toggleInventorySort(descendingName, 'status')).toMatchObject({ sort: 'status', direction: 'asc' });
    expect(skus({ sort: 'status', direction: 'asc' })).toEqual(['SKU-003', 'SKU-004', 'SKU-002', 'SKU-001']);
  });
});

describe('inventory filter state', () => {
  it('detects active filters and non-default sorting', () => {
    expect(hasActiveInventoryFilters(DEFAULT_INVENTORY_FILTERS)).toBe(false);
    expect(hasActiveInventoryFilters({ ...DEFAULT_INVENTORY_FILTERS, search: '  ' })).toBe(false);
    expect(hasActiveInventoryFilters({ ...DEFAULT_INVENTORY_FILTERS, search: 'tape' })).toBe(true);
    expect(hasActiveInventoryFilters({ ...DEFAULT_INVENTORY_FILTERS, sort: 'name' })).toBe(true);
    expect(hasActiveInventoryFilters({ ...DEFAULT_INVENTORY_FILTERS, sort: 'sku', direction: 'desc' })).toBe(true);
  });

  it('resets filters and sorting to SKU ascending, with no URL query', () => {
    expect(resetInventoryFilters()).toEqual(DEFAULT_INVENTORY_FILTERS);
    expect(serializeInventoryQuery(resetInventoryFilters()).toString()).toBe('');
  });
});

describe('inventory URL query', () => {
  it('ignores malformed or unknown values and falls back to defaults', () => {
    const filters = parseInventoryQuery(new URLSearchParams('category=unknown&zone=%3Cscript%3E&status=wat,low,OUT,low&sort=madeUp&dir=sideways'), ['Packaging', 'Packing'], ['North', 'South']);
    expect(filters).toEqual({ ...defaults, statuses: ['LOW', 'OUT'] });
  });

  it('keeps valid URL values while skipping unknown multi-status entries', () => {
    const filters = parseInventoryQuery(new URLSearchParams('search=Box&category=Packaging&zone=North&status=out,critical,invalid&sort=name&dir=desc'), ['Packaging'], ['North']);
    expect(filters).toEqual({ search: 'Box', category: 'Packaging', zone: 'North', statuses: ['OUT', 'CRITICAL'], sort: 'name', direction: 'desc' });
  });

  it('preserves descending SKU sort but omits default SKU ascending sort', () => {
    expect(serializeInventoryQuery({ ...DEFAULT_INVENTORY_FILTERS, sort: 'sku', direction: 'desc' }).toString()).toBe('sort=sku&dir=desc');
    expect(serializeInventoryQuery(DEFAULT_INVENTORY_FILTERS).toString()).toBe('');
  });
});

describe('Product Detail selectors and reorder point updates', () => {
  it('selects only a SKU movement history, newest first', () => {
    const state = createInitialStoreState();
    const source = state.movements[0];
    const historyState = {
      ...state,
      movements: [
        { ...source, id: 'old', timestamp: '2025-01-01T00:00:00.000Z' },
        { ...source, id: 'new', timestamp: '2025-02-01T00:00:00.000Z' },
        { ...source, id: 'other-sku', sku: 'SKU-040', timestamp: '2025-03-01T00:00:00.000Z' },
      ],
    };
    expect(selectSkuMovementHistory(historyState, source.sku).map(({ id }) => id)).toEqual(['new', 'old']);
    expect(selectSkuMovementHistory(historyState, 'missing-sku')).toEqual([]);
  });

  it('updates a manager reorder point without changing stock or adding a Movement', () => {
    const initial = createInitialStoreState();
    const product = initial.products['SKU-001'];
    const state = {
      ...initial,
      session: { id: 'manager-01', name: 'Manager', role: 'MANAGER' as const },
      products: { ...initial.products, [product.sku]: { ...product, onHand: 10, reorderPoint: 12 } },
    };
    const statusBefore = getStockStatus(state.products[product.sku]);
    const next = updateReorderPoint(state, product.sku, 20);
    expect(statusBefore).toBe('LOW');
    expect(getStockStatus(next.products[product.sku])).toBe('CRITICAL');
    expect(next.products[product.sku]).toMatchObject({ onHand: 10, reorderPoint: 20 });
    expect(next.movements).toBe(state.movements);
    expect(next.movements).toEqual(state.movements);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid reorder point %s', (value) => {
    const initial = createInitialStoreState();
    const state = { ...initial, session: { id: 'manager-01', name: 'Manager', role: 'MANAGER' as const } };
    expect(() => updateReorderPoint(state, 'SKU-001', value)).toThrowError(InventoryActionError);
    expect(() => updateReorderPoint(state, 'SKU-001', value)).toThrowError(/whole number of at least 1/);
  });

  it('rejects reorder points above location capacity', () => {
    const initial = createInitialStoreState();
    const state = { ...initial, session: { id: 'admin-01', name: 'Admin', role: 'ADMIN' as const } };
    const product = state.products['SKU-001'];
    const capacity = state.locations[product.locationId].capacity;
    expect(() => updateReorderPoint(state, product.sku, capacity + 1)).toThrowError(/cannot exceed the location capacity/);
  });

  it('keeps Product Detail reorder point values bounded after shared parsing', () => {
    const initial = createInitialStoreState();
    const state = { ...initial, session: { id: 'admin-01', name: 'Admin', role: 'ADMIN' as const } };
    const product = state.products['SKU-001'];
    const capacity = state.locations[product.locationId].capacity;
    const zero = parseWholeNumber('0');
    const overCapacity = parseWholeNumber(String(capacity + 1));

    expect(zero).toEqual({ ok: true, value: 0 });
    expect(() => updateReorderPoint(state, product.sku, zero.ok ? zero.value : -1)).toThrowError(/whole number of at least 1/);
    expect(overCapacity).toEqual({ ok: true, value: capacity + 1 });
    expect(() => updateReorderPoint(state, product.sku, overCapacity.ok ? overCapacity.value : -1)).toThrowError(/cannot exceed the location capacity/);
  });

  it.each(['PICKER', 'RECEIVER', null] as const)('blocks reorder point updates for role %s', (role) => {
    const initial = createInitialStoreState();
    const session = role ? { id: 'user-01', name: 'User', role } : null;
    const state = { ...initial, session };
    expect(() => updateReorderPoint(state, 'SKU-001', 10)).toThrowError(/Only a Manager or Admin/);
  });
});
