import type { Movement, MovementType, StoreState } from './models';

export type MovementRange = 'today' | '7d' | '30d' | 'all';
export type MovementSort = 'timestamp' | 'type' | 'sku' | 'qty' | 'qtyBefore' | 'location' | 'user' | 'reference';
export type MovementDirection = 'asc' | 'desc';

export interface MovementFilters {
  range: MovementRange;
  types: MovementType[];
  search: string;
  userId: string;
  reference: string;
  sort: MovementSort;
  direction: MovementDirection;
  page: number;
}

export interface MovementRow {
  movement: Movement;
  productName: string;
  userName: string;
  locationName: string;
}

export interface MovementSummary {
  total: number;
  byType: Record<MovementType, number>;
  netUnits: number;
}

export interface MovementPage {
  rows: MovementRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export const MOVEMENT_TYPES: MovementType[] = ['RECEIVE', 'PICK', 'ADJUST'];
export const DEFAULT_MOVEMENT_FILTERS: MovementFilters = {
  range: 'all', types: [], search: '', userId: '', reference: '', sort: 'timestamp', direction: 'desc', page: 1,
};
export const MOVEMENT_PAGE_SIZE = 25;

const SORT_KEYS: MovementSort[] = ['timestamp', 'type', 'sku', 'qty', 'qtyBefore', 'location', 'user', 'reference'];
const RANGES: MovementRange[] = ['today', '7d', '30d', 'all'];

export function selectMovementRows(state: StoreState): MovementRow[] {
  return state.movements.map((movement) => ({
    movement,
    productName: state.products[movement.sku]?.name ?? movement.sku,
    userName: state.users[movement.userId]?.name ?? movement.userId,
    locationName: state.locations[movement.locationId]?.id ?? movement.locationId,
  }));
}

function getRangeStart(range: MovementRange, now: Date): number | null {
  if (range === 'all') return null;
  const current = new Date(now);
  if (range === 'today') {
    current.setHours(0, 0, 0, 0);
    return current.getTime();
  }
  const days = range === '7d' ? 7 : 30;
  return current.getTime() - days * 24 * 60 * 60 * 1000;
}

export function filterAndSortMovements(
  rows: MovementRow[],
  filters: MovementFilters,
  now: Date,
): MovementRow[] {
  const start = getRangeStart(filters.range, now);
  const search = filters.search.trim().toLowerCase();
  const referenceSearch = filters.reference.trim().toLowerCase();
  const filtered = rows.filter(({ movement, productName }) => {
    const timestamp = Date.parse(movement.timestamp);
    if (start !== null && (!Number.isFinite(timestamp) || timestamp < start || timestamp > now.getTime())) return false;
    if (filters.types.length > 0 && !filters.types.includes(movement.type)) return false;
    if (search && !movement.sku.toLowerCase().includes(search) && !productName.toLowerCase().includes(search)) return false;
    if (filters.userId && movement.userId !== filters.userId) return false;
    if (referenceSearch && !(movement.reference ?? '').toLowerCase().includes(referenceSearch)) return false;
    return true;
  });

  const sorted = [...filtered].sort((left, right) => {
    const a = left.movement;
    const b = right.movement;
    let result = 0;
    switch (filters.sort) {
      case 'timestamp': result = Date.parse(a.timestamp) - Date.parse(b.timestamp); break;
      case 'type': result = a.type.localeCompare(b.type); break;
      case 'sku': result = a.sku.localeCompare(b.sku) || left.productName.localeCompare(right.productName); break;
      case 'qty': result = a.qty - b.qty; break;
      case 'qtyBefore': result = a.qtyBefore - b.qtyBefore; break;
      case 'location': result = left.locationName.localeCompare(right.locationName); break;
      case 'user': result = left.userName.localeCompare(right.userName); break;
      case 'reference': result = (a.reference ?? '').localeCompare(b.reference ?? ''); break;
    }
    if (result === 0) result = a.id.localeCompare(b.id);
    return filters.direction === 'desc' ? -result : result;
  });
  return sorted;
}

export function summarizeMovements(rows: MovementRow[]): MovementSummary {
  const byType: Record<MovementType, number> = { RECEIVE: 0, PICK: 0, ADJUST: 0 };
  let netUnits = 0;
  for (const { movement } of rows) {
    byType[movement.type] += 1;
    netUnits += movement.qty;
  }
  return { total: rows.length, byType, netUnits };
}

export function paginateMovements(rows: MovementRow[], requestedPage: number, pageSize = MOVEMENT_PAGE_SIZE): MovementPage {
  const safePageSize = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : MOVEMENT_PAGE_SIZE;
  const pageCount = Math.ceil(rows.length / safePageSize);
  const page = Math.min(Math.max(1, Number.isInteger(requestedPage) ? requestedPage : 1), Math.max(1, pageCount));
  const start = (page - 1) * safePageSize;
  return { rows: rows.slice(start, start + safePageSize), total: rows.length, page, pageSize: safePageSize, pageCount };
}

export function toggleMovementSort(filters: MovementFilters, sort: MovementSort): MovementFilters {
  return {
    ...filters,
    sort,
    direction: filters.sort === sort && filters.direction === 'asc' ? 'desc' : 'asc',
    page: 1,
  };
}

export function parseMovementQuery(searchParams: URLSearchParams): MovementFilters {
  const rangeValue = searchParams.get('range') ?? '';
  const sortValue = searchParams.get('sort') ?? '';
  const directionValue = searchParams.get('dir') ?? '';
  const parsedPage = Number(searchParams.get('page') ?? 1);
  const hasValidPage = /^\d+$/.test(searchParams.get('page') ?? '1') && Number.isSafeInteger(parsedPage) && parsedPage > 0;
  const range = RANGES.includes(rangeValue as MovementRange) ? rangeValue as MovementRange : DEFAULT_MOVEMENT_FILTERS.range;
  const sort = SORT_KEYS.includes(sortValue as MovementSort) ? sortValue as MovementSort : DEFAULT_MOVEMENT_FILTERS.sort;
  const types = (searchParams.get('type') ?? '').split(',').map((type) => type.trim().toUpperCase())
    .filter((type): type is MovementType => MOVEMENT_TYPES.includes(type as MovementType));
  return {
    range,
    types: [...new Set(types)],
    search: (searchParams.get('sku') ?? '').slice(0, 120),
    userId: (searchParams.get('user') ?? '').slice(0, 120),
    reference: (searchParams.get('reference') ?? '').slice(0, 120),
    sort,
    direction: directionValue === 'asc' || directionValue === 'desc' ? directionValue : DEFAULT_MOVEMENT_FILTERS.direction,
    page: hasValidPage ? parsedPage : 1,
  };
}

export function serializeMovementQuery(filters: MovementFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.range !== DEFAULT_MOVEMENT_FILTERS.range) params.set('range', filters.range);
  if (filters.types.length) params.set('type', MOVEMENT_TYPES.filter((type) => filters.types.includes(type)).join(',').toLowerCase());
  if (filters.search.trim()) params.set('sku', filters.search.trim());
  if (filters.userId) params.set('user', filters.userId);
  if (filters.reference.trim()) params.set('reference', filters.reference.trim());
  if (filters.sort !== DEFAULT_MOVEMENT_FILTERS.sort) params.set('sort', filters.sort);
  if (filters.direction !== DEFAULT_MOVEMENT_FILTERS.direction) params.set('dir', filters.direction);
  if (filters.page > 1) params.set('page', String(filters.page));
  return params;
}

export function hasActiveMovementFilters(filters: MovementFilters): boolean {
  return filters.range !== DEFAULT_MOVEMENT_FILTERS.range
    || filters.types.length > 0
    || Boolean(filters.search.trim() || filters.userId || filters.reference.trim())
    || filters.sort !== DEFAULT_MOVEMENT_FILTERS.sort
    || filters.direction !== DEFAULT_MOVEMENT_FILTERS.direction
    || filters.page !== 1;
}
