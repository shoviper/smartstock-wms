import { describe, expect, it } from 'vitest';
import { createInitialStoreState } from '../store/persistence';
import type { Movement, Order, StoreState } from './models';
import {
  getBangkokDateKey,
  selectDashboardDailyMovements,
  selectDashboardKpis,
  selectDashboardOrderStatusCounts,
  selectDashboardRecentMovements,
  selectDashboardStockStatusCounts,
  selectDashboardUrgentOrders,
  selectDashboardUrgentProducts,
} from './dashboard';

const now = new Date('2026-06-10T17:00:00.000Z'); // 00:00 Bangkok, June 11
const base = createInitialStoreState();

function stateWith(overrides: Partial<StoreState>): StoreState {
  return { ...base, ...overrides };
}

function movement(id: string, timestamp: string, type: Movement['type'], qty: number): Movement {
  return { id, timestamp, type, sku: 'SKU-001', qty, qtyBefore: 20, qtyAfter: 20 + qty, locationId: 'A-01-01-1', userId: 'user-picker-01', reference: null, reason: '' };
}

function order(id: string, status: Order['status'], dueAt: string, completedAt?: string): Order {
  return { id, customer: id, createdAt: dueAt, dueAt, priority: 'NORMAL', status, completedAt, lines: [] };
}

describe('Dashboard selectors', () => {
  it('derives every KPI from the store and counts all completed statuses', () => {
    const state = stateWith({
      products: {
        'SKU-001': { ...base.products['SKU-001'], onHand: 0, reorderPoint: 10 },
        'SKU-002': { ...base.products['SKU-002'], onHand: 2, reorderPoint: 4 },
        'SKU-003': { ...base.products['SKU-003'], onHand: 5, reorderPoint: 5 },
      },
      orders: {
        pending: order('pending', 'PENDING', '2026-06-12T00:00:00.000Z'),
        progress: order('progress', 'IN_PROGRESS', '2026-06-12T00:00:00.000Z'),
        complete: order('complete', 'COMPLETED', '2026-06-12T00:00:00.000Z', '2026-06-10T18:00:00.000Z'),
        shortage: order('shortage', 'COMPLETED_WITH_SHORTAGE', '2026-06-12T00:00:00.000Z', '2026-06-10T18:01:00.000Z'),
      },
      movements: [movement('picked-today', '2026-06-10T18:00:00.000Z', 'PICK', -5), movement('received', '2026-06-10T18:00:00.000Z', 'RECEIVE', 7)],
    });
    expect(selectDashboardKpis(state, now)).toEqual({ totalSku: 3, attention: { OUT: 1, CRITICAL: 1, LOW: 1 }, attentionTotal: 3, pendingOrders: 1, inProgressOrders: 1, overdueOrders: 0, completedOrdersToday: 2, unitsPickedToday: 5 });
    expect(selectDashboardOrderStatusCounts(state, now)).toEqual({ pending: 1, inProgress: 1, completed: 2 });
    expect(selectDashboardStockStatusCounts(state, now)).toEqual({ OUT: 1, CRITICAL: 1, LOW: 1, NORMAL: 0 });
  });

  it('uses Bangkok calendar-day boundaries for 23:59 and 00:00', () => {
    const at2359 = '2026-06-10T16:59:00.000Z'; // 23:59 Bangkok
    const at0000 = '2026-06-10T17:00:00.000Z'; // 00:00 Bangkok next day
    const orders = {
      beforeMidnight: order('before', 'COMPLETED', at2359, at2359),
      afterMidnight: order('after', 'COMPLETED', at0000, at0000),
    };
    const movements = [movement('before', at2359, 'PICK', -2), movement('after', at0000, 'PICK', -3)];
    expect(getBangkokDateKey(new Date(at2359))).toBe('2026-06-10');
    expect(getBangkokDateKey(new Date(at0000))).toBe('2026-06-11');
    expect(selectDashboardKpis(stateWith({ orders, movements }), new Date('2026-06-10T16:59:59.000Z'))).toMatchObject({ completedOrdersToday: 1, unitsPickedToday: 2 });
    expect(selectDashboardKpis(stateWith({ orders, movements }), new Date('2026-06-10T17:00:00.000Z'))).toMatchObject({ completedOrdersToday: 1, unitsPickedToday: 3 });
  });

  it('returns exactly 14 Bangkok dates and includes both edge dates but excludes adjacent dates', () => {
    const movements = [
      movement('old-edge', '2026-05-28T17:00:00.000Z', 'RECEIVE', 4), // May 29, 13 days before June 11
      movement('too-old', '2026-05-27T16:59:00.000Z', 'PICK', -7),
      movement('today', '2026-06-10T17:00:00.000Z', 'PICK', -3),
      movement('future', '2026-06-10T17:01:00.000Z', 'RECEIVE', 9),
    ];
    const daily = selectDashboardDailyMovements(stateWith({ movements }), now);
    expect(daily).toHaveLength(14);
    expect(daily[0]).toMatchObject({ date: '2026-05-29', receive: 4, pick: 0 });
    expect(daily.at(-1)).toMatchObject({ date: '2026-06-11', receive: 0, pick: 3 });
    expect(daily.reduce((total, day) => total + day.receive + day.pick, 0)).toBe(7);
  });

  it('orders urgent orders overdue-first then due soon by closest due time, and limits to five', () => {
    const orders = Object.fromEntries([
      order('overdue-later', 'IN_PROGRESS', '2026-06-10T16:00:00.000Z'),
      order('soon-first', 'IN_PROGRESS', '2026-06-10T18:00:00.000Z'),
      order('overdue-first', 'PENDING', '2026-06-10T15:00:00.000Z'),
      order('overdue-middle', 'PENDING', '2026-06-10T16:30:00.000Z'),
      order('due-at-limit', 'PENDING', '2026-06-11T17:00:00.000Z'),
      order('too-far', 'PENDING', '2026-06-11T17:00:01.000Z'),
      order('done', 'COMPLETED', '2026-06-10T16:30:00.000Z'),
    ].map((item) => [item.id, item]));
    expect(selectDashboardUrgentOrders(stateWith({ orders }), now).map(({ order: item }) => item.id)).toEqual(['overdue-first', 'overdue-later', 'overdue-middle', 'soon-first', 'due-at-limit']);
  });

  it('sorts urgent products Out, Critical, Low then SKU, and recent movements newest-first capped at eight', () => {
    expect(selectDashboardUrgentProducts(base, now).slice(0, 5).every((product) => product.onHand <= product.reorderPoint)).toBe(true);
    const movements = Array.from({ length: 10 }, (_, index) => movement(`m${index}`, new Date(now.getTime() + index * 1000).toISOString(), 'ADJUST', 1));
    expect(selectDashboardRecentMovements(stateWith({ movements }), now).map((item) => item.id)).toEqual(['m9', 'm8', 'm7', 'm6', 'm5', 'm4', 'm3', 'm2']);
  });

  it('returns useful empty values for an empty dashboard state', () => {
    const empty = stateWith({ products: {}, orders: {}, movements: [] });
    expect(selectDashboardKpis(empty, now)).toMatchObject({ totalSku: 0, attentionTotal: 0, pendingOrders: 0, inProgressOrders: 0, overdueOrders: 0, completedOrdersToday: 0, unitsPickedToday: 0 });
    expect(selectDashboardOrderStatusCounts(empty, now)).toEqual({ pending: 0, inProgress: 0, completed: 0 });
    expect(selectDashboardStockStatusCounts(empty, now)).toEqual({ OUT: 0, CRITICAL: 0, LOW: 0, NORMAL: 0 });
    expect(selectDashboardDailyMovements(empty, now)).toHaveLength(14);
    expect(selectDashboardUrgentProducts(empty, now)).toEqual([]);
    expect(selectDashboardUrgentOrders(empty, now)).toEqual([]);
    expect(selectDashboardRecentMovements(empty, now)).toEqual([]);
  });
});
