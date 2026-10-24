import { describe, expect, it } from 'vitest';
import { DEFAULT_INVENTORY_FILTERS, filterAndSortInventory, hasActiveInventoryFilters, parseInventoryQuery, resetInventoryFilters, serializeInventoryQuery, toggleInventorySort, type InventoryFilters, type InventoryRow } from './inventory';

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
