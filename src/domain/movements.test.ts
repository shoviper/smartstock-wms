import { describe, expect, it } from 'vitest';
import { createInitialStoreState } from '../store/persistence';
import type { Movement, StoreState } from './models';
import {
  DEFAULT_MOVEMENT_FILTERS,
  filterAndSortMovements,
  paginateMovements,
  parseMovementQuery,
  selectMovementRows,
  serializeMovementQuery,
  summarizeMovements,
  toggleMovementSort,
  hasActiveMovementFilters,
  type MovementFilters,
} from './movements';

const now = new Date('2026-06-10T12:00:00.000Z');
const hours = (count: number) => new Date(now.getTime() - count * 60 * 60 * 1000).toISOString();
const days = (count: number) => new Date(now.getTime() - count * 24 * 60 * 60 * 1000).toISOString();

function movement(id: string, options: Partial<Movement> & Pick<Movement, 'timestamp' | 'type' | 'sku' | 'qty'>): Movement {
  const product = createInitialStoreState().products[options.sku];
  const qtyBefore = options.qtyBefore ?? 20;
  return {
    id,
    timestamp: options.timestamp,
    type: options.type,
    sku: options.sku,
    qty: options.qty,
    qtyBefore,
    qtyAfter: options.qtyAfter ?? qtyBefore + options.qty,
    locationId: options.locationId ?? product.locationId,
    userId: options.userId ?? 'user-receiver-01',
    reference: options.reference ?? null,
    reason: options.reason ?? '',
  };
}

function stateWithMovements(movements: Movement[]): StoreState {
  return { ...createInitialStoreState(), movements };
}

const fixtures = [
  movement('m-now', { timestamp: hours(1), type: 'RECEIVE', sku: 'SKU-001', qty: 10, qtyBefore: 0, reference: 'ASN-100' }),
  movement('m-3d', { timestamp: days(3), type: 'PICK', sku: 'SKU-002', qty: -3, reference: 'ORD-200', userId: 'user-picker-01' }),
  movement('m-10d', { timestamp: days(10), type: 'ADJUST', sku: 'SKU-001', qty: 2, reference: 'COUNT-300', userId: 'user-manager-01' }),
  movement('m-40d', { timestamp: days(40), type: 'RECEIVE', sku: 'SKU-002', qty: 5, reference: 'ASN-400' }),
];

describe('Stock Movement selectors', () => {
  const rows = selectMovementRows(stateWithMovements(fixtures));

  it('filters by time range using the supplied now value', () => {
    expect(filterAndSortMovements(rows, { ...DEFAULT_MOVEMENT_FILTERS, range: 'today' }, now).map(({ movement: item }) => item.id)).toEqual(['m-now']);
    expect(filterAndSortMovements(rows, { ...DEFAULT_MOVEMENT_FILTERS, range: '7d' }, now).map(({ movement: item }) => item.id)).toEqual(['m-now', 'm-3d']);
    expect(filterAndSortMovements(rows, { ...DEFAULT_MOVEMENT_FILTERS, range: '30d' }, now).map(({ movement: item }) => item.id)).toEqual(['m-now', 'm-3d', 'm-10d']);
    expect(filterAndSortMovements(rows, DEFAULT_MOVEMENT_FILTERS, now)).toHaveLength(4);
  });

  it('filters types, SKU/name, user, and reference independently', () => {
    expect(filterAndSortMovements(rows, { ...DEFAULT_MOVEMENT_FILTERS, types: ['PICK'] }, now).map(({ movement: item }) => item.id)).toEqual(['m-3d']);
    expect(filterAndSortMovements(rows, { ...DEFAULT_MOVEMENT_FILTERS, search: 'bubble' }, now).map(({ movement: item }) => item.id)).toEqual(['m-3d', 'm-40d']);
    expect(filterAndSortMovements(rows, { ...DEFAULT_MOVEMENT_FILTERS, search: 'sku-001' }, now).map(({ movement: item }) => item.id)).toEqual(['m-now', 'm-10d']);
    expect(filterAndSortMovements(rows, { ...DEFAULT_MOVEMENT_FILTERS, userId: 'user-picker-01' }, now).map(({ movement: item }) => item.id)).toEqual(['m-3d']);
    expect(filterAndSortMovements(rows, { ...DEFAULT_MOVEMENT_FILTERS, reference: 'asn-' }, now).map(({ movement: item }) => item.id)).toEqual(['m-now', 'm-40d']);
  });

  it('combines filters and sorts with newest first by default or the requested key', () => {
    const combined: MovementFilters = { ...DEFAULT_MOVEMENT_FILTERS, range: '30d', types: ['RECEIVE', 'ADJUST'], search: 'SKU-001', reference: 'asn' };
    expect(filterAndSortMovements(rows, combined, now).map(({ movement: item }) => item.id)).toEqual(['m-now']);
    expect(filterAndSortMovements(rows, DEFAULT_MOVEMENT_FILTERS, now).map(({ movement: item }) => item.id)).toEqual(['m-now', 'm-3d', 'm-10d', 'm-40d']);
    expect(filterAndSortMovements(rows, { ...DEFAULT_MOVEMENT_FILTERS, sort: 'qty', direction: 'asc' }, now).map(({ movement: item }) => item.id)).toEqual(['m-3d', 'm-10d', 'm-40d', 'm-now']);
    expect(toggleMovementSort(DEFAULT_MOVEMENT_FILTERS, 'sku')).toMatchObject({ sort: 'sku', direction: 'asc', page: 1 });
  });

  it('summarizes filtered rows and paginates 25 items with total count', () => {
    expect(summarizeMovements(rows)).toEqual({ total: 4, byType: { RECEIVE: 2, PICK: 1, ADJUST: 1 }, netUnits: 14 });
    const thirtyRows = Array.from({ length: 30 }, (_, index) => ({ ...rows[index % rows.length], movement: { ...rows[index % rows.length].movement, id: `page-${index}` } }));
    const firstPage = paginateMovements(thirtyRows, 1);
    const secondPage = paginateMovements(thirtyRows, 2);
    expect(firstPage).toMatchObject({ total: 30, page: 1, pageSize: 25, pageCount: 2 });
    expect(firstPage.rows).toHaveLength(25);
    expect(secondPage.rows).toHaveLength(5);
    expect(paginateMovements(thirtyRows, 99).page).toBe(2);
    expect(paginateMovements([], 1)).toMatchObject({ total: 0, page: 1, pageCount: 0, rows: [] });
  });

  it('round-trips filters, sort and page through URL query parameters', () => {
    const filters: MovementFilters = { ...DEFAULT_MOVEMENT_FILTERS, range: '7d', types: ['PICK', 'ADJUST'], search: 'Bubble', userId: 'user-picker-01', reference: 'ORD', sort: 'qty', direction: 'asc', page: 3 };
    expect(parseMovementQuery(serializeMovementQuery(filters))).toEqual(filters);
    expect(parseMovementQuery(new URLSearchParams('range=invalid&type=BAD&sort=wrong&page=-2'))).toEqual(DEFAULT_MOVEMENT_FILTERS);
  });

  it('reports active filters and view state for the Inventory-style clear action', () => {
    expect(hasActiveMovementFilters(DEFAULT_MOVEMENT_FILTERS)).toBe(false);
    expect([
      { ...DEFAULT_MOVEMENT_FILTERS, range: 'today' as const },
      { ...DEFAULT_MOVEMENT_FILTERS, types: ['RECEIVE'] as MovementFilters['types'] },
      { ...DEFAULT_MOVEMENT_FILTERS, search: 'SKU-001' },
      { ...DEFAULT_MOVEMENT_FILTERS, userId: 'user-picker-01' },
      { ...DEFAULT_MOVEMENT_FILTERS, reference: 'ASN' },
      { ...DEFAULT_MOVEMENT_FILTERS, sort: 'sku' as const },
      { ...DEFAULT_MOVEMENT_FILTERS, direction: 'asc' as const },
      { ...DEFAULT_MOVEMENT_FILTERS, page: 2 },
    ].every(hasActiveMovementFilters)).toBe(true);
  });
});
