import type { Location, Order, OrderLine, OrderPriority, Product, StoreState, User } from './models';

export type OrderStatusTab = 'all' | 'pending' | 'in-progress' | 'completed';

export interface OrderListFilters {
  status: OrderStatusTab;
  search: string;
}

export interface OrderProgress {
  required: number;
  picked: number;
  percent: number;
}

export type OrderActionErrorCode = 'ORDER_NOT_FOUND' | 'UNKNOWN_USER' | 'FORBIDDEN' | 'ORDER_NOT_PENDING';

export class OrderActionError extends Error {
  readonly code: OrderActionErrorCode;

  constructor(code: OrderActionErrorCode, message: string) {
    super(message);
    this.name = 'OrderActionError';
    this.code = code;
  }
}

export interface StartPickingInput {
  orderId: string;
  userId: string;
  timestamp?: string;
}

export const DEFAULT_ORDER_LIST_FILTERS: OrderListFilters = { status: 'all', search: '' };
const STATUS_TABS: OrderStatusTab[] = ['all', 'pending', 'in-progress', 'completed'];
const PRIORITY_RANK: Record<OrderPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export function parseOrderListQuery(params: URLSearchParams): OrderListFilters {
  const statusValue = params.get('status') ?? '';
  return {
    status: STATUS_TABS.includes(statusValue as OrderStatusTab) ? statusValue as OrderStatusTab : 'all',
    search: (params.get('q') ?? '').slice(0, 120),
  };
}

export function serializeOrderListQuery(filters: OrderListFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.status !== 'all') params.set('status', filters.status);
  if (filters.search.trim()) params.set('q', filters.search.trim());
  return params;
}

export function selectOrderProgress(order: Order): OrderProgress {
  const required = order.lines.reduce((total, line) => total + line.qty, 0);
  const picked = order.lines.reduce((total, line) => total + line.pickedQty, 0);
  return { required, picked, percent: required > 0 ? Math.min(100, picked / required * 100) : 0 };
}

export function filterAndSortOrders(orders: Order[], filters: OrderListFilters): Order[] {
  const query = filters.search.trim().toLocaleLowerCase();
  return orders.filter((order) => {
    if (filters.status === 'pending' && order.status !== 'PENDING') return false;
    if (filters.status === 'in-progress' && order.status !== 'IN_PROGRESS') return false;
    if (filters.status === 'completed' && order.status !== 'COMPLETED' && order.status !== 'COMPLETED_WITH_SHORTAGE') return false;
    return !query || order.id.toLocaleLowerCase().includes(query) || order.customer.toLocaleLowerCase().includes(query);
  }).sort((left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority]
    || Date.parse(left.dueAt) - Date.parse(right.dueAt)
    || left.id.localeCompare(right.id));
}

function compareLocationValue(left: string | number, right: string | number): number {
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

export function sortPickPath(
  lines: OrderLine[],
  products: Record<string, Product>,
  locations: Record<string, Location>,
): OrderLine[] {
  return [...lines].sort((left, right) => {
    const leftProduct = products[left.sku];
    const rightProduct = products[right.sku];
    const leftLocation = leftProduct ? locations[leftProduct.locationId] : undefined;
    const rightLocation = rightProduct ? locations[rightProduct.locationId] : undefined;
    if (!leftLocation || !rightLocation) {
      return (leftLocation ? -1 : rightLocation ? 1 : 0) || left.sku.localeCompare(right.sku);
    }
    return compareLocationValue(leftLocation.zone, rightLocation.zone)
      || compareLocationValue(leftLocation.aisle, rightLocation.aisle)
      || compareLocationValue(leftLocation.rack, rightLocation.rack)
      || compareLocationValue(leftLocation.level, rightLocation.level)
      || left.sku.localeCompare(right.sku);
  });
}

export function startPicking(state: StoreState, input: StartPickingInput): StoreState {
  const order = state.orders[input.orderId];
  if (!order) throw new OrderActionError('ORDER_NOT_FOUND', `Order ${input.orderId} was not found.`);

  const user: User | undefined = state.users[input.userId];
  if (!user) throw new OrderActionError('UNKNOWN_USER', `Unknown user: ${input.userId}`);
  const session = state.session;
  const allowedRoles = ['PICKER', 'MANAGER', 'ADMIN'];
  if (!session || state.currentUserId !== session.id || session.id !== user.id || session.role !== user.role || !allowedRoles.includes(session.role)) {
    throw new OrderActionError('FORBIDDEN', 'Only the signed-in Picker, Manager, or Admin can start picking.');
  }
  if (order.status !== 'PENDING') {
    throw new OrderActionError('ORDER_NOT_PENDING', 'Only a pending order can be started.');
  }

  return {
    ...state,
    orders: {
      ...state.orders,
      [order.id]: {
        ...order,
        status: 'IN_PROGRESS',
        startedAt: input.timestamp ?? new Date().toISOString(),
        assignedTo: user.id,
      },
    },
  };
}
