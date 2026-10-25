import type { Movement, Order, Product, StockStatus, StoreState } from './models';
import { getRoleCapabilities } from './access';

export type InventorySort = 'sku' | 'name' | 'onHand' | 'status';
export type SortDirection = 'asc' | 'desc';

export interface InventoryFilters {
  search: string;
  category: string;
  statuses: StockStatus[];
  zone: string;
  sort: InventorySort;
  direction: SortDirection;
}

export interface InventoryRow {
  product: Product;
  zone: string;
  status: StockStatus;
}

export interface OpenOrderForSku {
  order: Order;
  quantity: number;
  pickedQuantity: number;
}

export type InventoryActionErrorCode = 'UNKNOWN_SKU' | 'UNKNOWN_LOCATION' | 'INVALID_REORDER_POINT' | 'CAPACITY_EXCEEDED' | 'FORBIDDEN';

export class InventoryActionError extends Error {
  readonly code: InventoryActionErrorCode;

  constructor(code: InventoryActionErrorCode, message: string) {
    super(message);
    this.name = 'InventoryActionError';
    this.code = code;
  }
}

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = {
  search: '', category: '', statuses: [], zone: '', sort: 'sku', direction: 'asc',
};
export const STOCK_STATUSES: StockStatus[] = ['OUT', 'CRITICAL', 'LOW', 'NORMAL'];
const SORTS: InventorySort[] = ['sku', 'name', 'onHand', 'status'];
const STATUS_RANK: Record<StockStatus, number> = { OUT: 0, CRITICAL: 1, LOW: 2, NORMAL: 3 };

export function toggleInventorySort(filters: InventoryFilters, sort: InventorySort): InventoryFilters {
  return {
    ...filters,
    sort,
    direction: filters.sort === sort && filters.direction === 'asc' ? 'desc' : 'asc',
  };
}

export function resetInventoryFilters(): InventoryFilters {
  return { ...DEFAULT_INVENTORY_FILTERS, statuses: [] };
}

export function hasActiveInventoryFilters(filters: InventoryFilters): boolean {
  return Boolean(filters.search.trim() || filters.category || filters.statuses.length || filters.zone)
    || filters.sort !== DEFAULT_INVENTORY_FILTERS.sort
    || filters.direction !== DEFAULT_INVENTORY_FILTERS.direction;
}

export function getStockStatus(product: Product): StockStatus {
  if (product.onHand === 0) return 'OUT';
  if (product.onHand <= product.reorderPoint * 0.5) return 'CRITICAL';
  if (product.onHand <= product.reorderPoint) return 'LOW';
  return 'NORMAL';
}

export function selectProductsByStatus(state: StoreState, status: StockStatus): Product[] {
  return Object.values(state.products).filter((product) => getStockStatus(product) === status);
}

export function selectSkuMovementHistory(state: StoreState, sku: string): Movement[] {
  return state.movements
    .filter((movement) => movement.sku === sku)
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp) || right.id.localeCompare(left.id));
}

export function selectOpenOrdersForSku(state: StoreState, sku: string): OpenOrderForSku[] {
  return Object.values(state.orders).flatMap((order) => {
    if (order.status !== 'PENDING' && order.status !== 'IN_PROGRESS') return [];
    const lines = order.lines.filter((line) => line.sku === sku);
    if (lines.length === 0) return [];
    return [{
      order,
      quantity: lines.reduce((total, line) => total + line.qty, 0),
      pickedQuantity: lines.reduce((total, line) => total + line.pickedQty, 0),
    }];
  }).sort((left, right) => left.order.id.localeCompare(right.order.id));
}

export function updateReorderPoint(state: StoreState, sku: string, reorderPoint: number): StoreState {
  const product = state.products[sku];
  if (!product) throw new InventoryActionError('UNKNOWN_SKU', `Unknown SKU: ${sku}`);
  const location = state.locations[product.locationId];
  if (!location) throw new InventoryActionError('UNKNOWN_LOCATION', `Unknown location: ${product.locationId}`);
  if (!state.session || !getRoleCapabilities(state.session.role).canUpdateReorderPoint) {
    throw new InventoryActionError('FORBIDDEN', 'Only a Manager or Admin can update the reorder point.');
  }
  if (!Number.isInteger(reorderPoint) || reorderPoint < 1) {
    throw new InventoryActionError('INVALID_REORDER_POINT', 'Reorder point must be a whole number of at least 1.');
  }
  if (reorderPoint > location.capacity) {
    throw new InventoryActionError('CAPACITY_EXCEEDED', `Reorder point cannot exceed the location capacity of ${location.capacity}.`);
  }
  return {
    ...state,
    products: { ...state.products, [sku]: { ...product, reorderPoint } },
  };
}

export function selectInventoryRows(state: StoreState): InventoryRow[] {
  return Object.values(state.products).map((product) => ({
    product,
    zone: state.locations[product.locationId]?.zone ?? '',
    status: getStockStatus(product),
  }));
}

export function selectInventoryFacets(state: StoreState) {
  const rows = selectInventoryRows(state);
  return {
    categories: [...new Set(rows.map(({ product }) => product.category))].sort((a, b) => a.localeCompare(b)),
    zones: [...new Set(Object.values(state.locations).map(({ zone }) => zone))].sort((a, b) => a.localeCompare(b)),
  };
}

export function filterAndSortInventory(rows: InventoryRow[], filters: InventoryFilters): InventoryRow[] {
  const search = filters.search.trim().toLocaleLowerCase();
  const filtered = rows.filter(({ product, zone, status }) => {
    if (search && !product.sku.toLocaleLowerCase().includes(search) && !product.name.toLocaleLowerCase().includes(search)) return false;
    if (filters.category && product.category !== filters.category) return false;
    if (filters.statuses.length && !filters.statuses.includes(status)) return false;
    if (filters.zone && zone !== filters.zone) return false;
    return true;
  });
  return filtered.sort((left, right) => {
    if (filters.sort === 'status') {
      const severity = STATUS_RANK[left.status] - STATUS_RANK[right.status];
      return (filters.direction === 'desc' ? -severity : severity) || left.product.sku.localeCompare(right.product.sku);
    }
    const result = filters.sort === 'name'
      ? left.product.name.localeCompare(right.product.name)
      : filters.sort === 'onHand'
        ? left.product.onHand - right.product.onHand
        : left.product.sku.localeCompare(right.product.sku);
    return (filters.direction === 'desc' ? -result : result) || left.product.sku.localeCompare(right.product.sku);
  });
}

export function parseInventoryQuery(searchParams: URLSearchParams, categories: string[], zones: string[]): InventoryFilters {
  const search = searchParams.get('search') ?? '';
  const categoryValue = searchParams.get('category') ?? '';
  const zoneValue = searchParams.get('zone') ?? '';
  const sortValue = searchParams.get('sort') ?? '';
  const directionValue = searchParams.get('dir') ?? '';
  const isValidSort = SORTS.includes(sortValue as InventorySort);
  const sort = isValidSort ? sortValue as InventorySort : 'sku';
  const statuses = (searchParams.get('status') ?? '').split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is StockStatus => STOCK_STATUSES.includes(value as StockStatus));
  return {
    search: search.slice(0, 120),
    category: categories.includes(categoryValue) ? categoryValue : '',
    statuses: [...new Set(statuses)],
    zone: zones.includes(zoneValue) ? zoneValue : '',
    sort,
    direction: isValidSort && (directionValue === 'asc' || directionValue === 'desc') ? directionValue : 'asc',
  };
}

export function serializeInventoryQuery(filters: InventoryFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.category) params.set('category', filters.category);
  if (filters.statuses.length) params.set('status', STOCK_STATUSES.filter((status) => filters.statuses.includes(status)).map((status) => status.toLowerCase()).join(','));
  if (filters.zone) params.set('zone', filters.zone);
  if (filters.sort !== 'sku' || filters.direction !== 'asc') params.set('sort', filters.sort);
  if (filters.direction !== 'asc') params.set('dir', filters.direction);
  return params;
}
