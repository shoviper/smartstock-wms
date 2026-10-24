import type { Movement, Order, Product, StockStatus, StoreState } from './models';
import { getStockStatus } from './inventory';

export const DASHBOARD_TIME_ZONE = 'Asia/Bangkok';
export const DASHBOARD_ATTENTION_STATUSES: StockStatus[] = ['OUT', 'CRITICAL', 'LOW'];

export interface DashboardKpis {
  totalSku: number;
  attention: Record<'OUT' | 'CRITICAL' | 'LOW', number>;
  attentionTotal: number;
  pendingOrders: number;
  inProgressOrders: number;
  overdueOrders: number;
  completedOrdersToday: number;
  unitsPickedToday: number;
}

export interface DailyMovementTotal {
  date: string;
  receive: number;
  pick: number;
}

export interface UrgentOrder {
  order: Order;
  dueAt: number;
  urgency: 'overdue' | 'due-soon';
}

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DASHBOARD_TIME_ZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
});

export function getBangkokDateKey(value: Date | number | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return dateFormatter.format(date);
}

function shiftDateKey(dateKey: string, offset: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + offset));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

export function selectDashboardKpis(state: StoreState, now: Date): DashboardKpis {
  const stockCounts: DashboardKpis['attention'] = { OUT: 0, CRITICAL: 0, LOW: 0 };
  for (const product of Object.values(state.products)) {
    const status = getStockStatus(product);
    if (status === 'OUT' || status === 'CRITICAL' || status === 'LOW') stockCounts[status] += 1;
  }
  const today = getBangkokDateKey(now);
  const orders = Object.values(state.orders);
  const completedOrdersToday = orders.filter((order) => isCompleted(order)
    && Boolean(order.completedAt) && getBangkokDateKey(order.completedAt!) === today).length;
  const unitsPickedToday = state.movements
    .filter((movement) => movement.type === 'PICK' && getBangkokDateKey(movement.timestamp) === today)
    .reduce((total, movement) => total + Math.abs(movement.qty), 0);
  const pendingOrders = orders.filter((order) => order.status === 'PENDING').length;
  const inProgressOrders = orders.filter((order) => order.status === 'IN_PROGRESS').length;
  const overdueOrders = orders.filter((order) => isOpen(order) && isValidDate(order.dueAt) && Date.parse(order.dueAt) < now.getTime()).length;
  return {
    totalSku: Object.keys(state.products).length,
    attention: stockCounts,
    attentionTotal: stockCounts.OUT + stockCounts.CRITICAL + stockCounts.LOW,
    pendingOrders,
    inProgressOrders,
    overdueOrders,
    completedOrdersToday,
    unitsPickedToday,
  };
}

export function selectDashboardOrderStatusCounts(state: StoreState, now: Date) {
  void now;
  const orders = Object.values(state.orders);
  return {
    pending: orders.filter((order) => order.status === 'PENDING').length,
    inProgress: orders.filter((order) => order.status === 'IN_PROGRESS').length,
    completed: orders.filter(isCompleted).length,
  };
}

export function selectDashboardStockStatusCounts(state: StoreState, now: Date) {
  void now;
  const counts = { OUT: 0, CRITICAL: 0, LOW: 0, NORMAL: 0 };
  for (const product of Object.values(state.products)) counts[getStockStatus(product)] += 1;
  return counts;
}

export function selectDashboardDailyMovements(state: StoreState, now: Date): DailyMovementTotal[] {
  const today = getBangkokDateKey(now);
  if (!today) return [];
  const days = Array.from({ length: 14 }, (_, index) => shiftDateKey(today, index - 13));
  const byDate = new Map(days.map((date) => [date, { date, receive: 0, pick: 0 }]));
  for (const movement of state.movements) {
    if (movement.type !== 'RECEIVE' && movement.type !== 'PICK') continue;
    const timestamp = Date.parse(movement.timestamp);
    if (!Number.isFinite(timestamp) || timestamp > now.getTime()) continue;
    const date = getBangkokDateKey(movement.timestamp);
    const total = byDate.get(date);
    if (total) total[movement.type === 'RECEIVE' ? 'receive' : 'pick'] += Math.abs(movement.qty);
  }
  return days.map((date) => byDate.get(date)!);
}

export function selectDashboardUrgentProducts(state: StoreState, now: Date): Product[] {
  void now;
  const rank: Record<'OUT' | 'CRITICAL' | 'LOW', number> = { OUT: 0, CRITICAL: 1, LOW: 2 };
  return Object.values(state.products)
    .filter((product) => getStockStatus(product) !== 'NORMAL')
    .sort((left, right) => rank[getStockStatus(left) as keyof typeof rank] - rank[getStockStatus(right) as keyof typeof rank]
      || left.sku.localeCompare(right.sku))
    .slice(0, 5);
}

export function selectDashboardUrgentOrders(state: StoreState, now: Date): UrgentOrder[] {
  const soonLimit = now.getTime() + 24 * 60 * 60 * 1000;
  const urgent: UrgentOrder[] = [];
  for (const order of Object.values(state.orders)) {
    const dueAt = Date.parse(order.dueAt);
    if (!isOpen(order) || !Number.isFinite(dueAt)) continue;
    if (dueAt < now.getTime()) urgent.push({ order, dueAt, urgency: 'overdue' });
    else if (dueAt <= soonLimit) urgent.push({ order, dueAt, urgency: 'due-soon' });
  }
  return urgent.sort((left, right) => Number(right.urgency === 'overdue') - Number(left.urgency === 'overdue')
    || left.dueAt - right.dueAt || left.order.id.localeCompare(right.order.id)).slice(0, 5);
}

export function selectDashboardRecentMovements(state: StoreState, now: Date): Movement[] {
  void now;
  return [...state.movements].sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp)
    || right.id.localeCompare(left.id)).slice(0, 8);
}

function isOpen(order: Order): boolean {
  return order.status === 'PENDING' || order.status === 'IN_PROGRESS';
}

function isCompleted(order: Order): boolean {
  return order.status === 'COMPLETED' || order.status === 'COMPLETED_WITH_SHORTAGE';
}

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}
