import { describe, expect, it } from 'vitest';
import { seedBusinessData } from '../data/seed';
import { createInitialStoreState } from '../store/persistence';
import { storeReducer } from '../store/StoreProvider';
import type { Order, OrderLine } from './models';
import {
  DEFAULT_ORDER_LIST_FILTERS,
  filterAndSortOrders,
  parseOrderListQuery,
  selectOrderProgress,
  serializeOrderListQuery,
  sortPickPath,
  startPicking,
} from './orders';

const baseState = createInitialStoreState();

describe('Orders & Picking domain', () => {
  it('filters by status tabs and searches Order ID or customer', () => {
    const orders = Object.values(baseState.orders);
    expect(filterAndSortOrders(orders, { status: 'pending', search: '' }).every((order) => order.status === 'PENDING')).toBe(true);
    expect(filterAndSortOrders(orders, { status: 'in-progress', search: '' }).every((order) => order.status === 'IN_PROGRESS')).toBe(true);
    expect(filterAndSortOrders(orders, { status: 'completed', search: '' }).every((order) => order.status === 'COMPLETED' || order.status === 'COMPLETED_WITH_SHORTAGE')).toBe(true);
    expect(filterAndSortOrders(orders, { status: 'all', search: 'northstar' }).every((order) => order.customer === 'Northstar Retail')).toBe(true);
    expect(filterAndSortOrders(orders, { status: 'all', search: 'ord-2026-0001' }).map((order) => order.id)).toEqual(['ORD-2026-0001']);
  });

  it('sorts orders by priority first and earliest due date second', () => {
    const orders = Object.values(baseState.orders);
    const sorted = filterAndSortOrders(orders, DEFAULT_ORDER_LIST_FILTERS);
    const rank = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      expect(rank[previous.priority]).toBeLessThanOrEqual(rank[current.priority]);
      if (previous.priority === current.priority) expect(Date.parse(previous.dueAt)).toBeLessThanOrEqual(Date.parse(current.dueAt));
    }
  });

  it('round-trips list filters through the URL query', () => {
    const filters = { status: 'in-progress' as const, search: 'Northstar' };
    expect(parseOrderListQuery(serializeOrderListQuery(filters))).toEqual(filters);
    expect(parseOrderListQuery(new URLSearchParams('status=unknown&q=ORD'))).toEqual({ ...DEFAULT_ORDER_LIST_FILTERS, search: 'ORD' });
  });

  it('sorts pick lines by Zone, Aisle, Rack, then Level without mutating input', () => {
    const locations = {
      'Z-01-01-1': { ...baseState.locations['A-01-01-1'], id: 'Z-01-01-1', zone: 'B', aisle: '01', rack: '01', level: 1 },
      'A-02-01-1': { ...baseState.locations['A-01-01-1'], id: 'A-02-01-1', zone: 'A', aisle: '02', rack: '01', level: 1 },
      'A-01-02-1': { ...baseState.locations['A-01-01-1'], id: 'A-01-02-1', zone: 'A', aisle: '01', rack: '02', level: 1 },
      'A-01-01-2': { ...baseState.locations['A-01-01-1'], id: 'A-01-01-2', zone: 'A', aisle: '01', rack: '01', level: 2 },
    };
    const skuOrder = ['SKU-001', 'SKU-002', 'SKU-003', 'SKU-004'];
    const locationIds = ['Z-01-01-1', 'A-02-01-1', 'A-01-02-1', 'A-01-01-2'];
    const products = Object.fromEntries(skuOrder.map((sku, index) => [sku, { ...baseState.products[sku], locationId: locationIds[index] }]));
    const lines: OrderLine[] = skuOrder.map((sku) => ({ sku, qty: 2, pickedQty: 0 }));

    expect(sortPickPath(lines, products, locations).map((line) => line.sku)).toEqual(['SKU-004', 'SKU-003', 'SKU-002', 'SKU-001']);
    expect(lines.map((line) => line.sku)).toEqual(skuOrder);
  });

  it('selects progress across all order lines', () => {
    const order: Order = { ...baseState.orders['ORD-2026-0001'], lines: [
      { sku: 'SKU-001', qty: 5, pickedQty: 2 }, { sku: 'SKU-002', qty: 3, pickedQty: 2 },
    ] };
    expect(selectOrderProgress(order)).toEqual({ required: 8, picked: 4, percent: 50 });
    expect(selectOrderProgress({ ...order, lines: [] })).toEqual({ required: 0, picked: 0, percent: 0 });
  });

  it('starts a pending order for the signed-in Picker and records time and assignment only', () => {
    const userId = 'user-picker-01';
    const state = { ...baseState, currentUserId: userId, session: baseState.users[userId] };
    const orderId = 'ORD-2026-0001';
    const originalOrder = state.orders[orderId];
    const updated = startPicking(state, { orderId, userId, timestamp: '2026-10-25T10:00:00.000Z' });

    expect(updated.orders[orderId]).toMatchObject({ status: 'IN_PROGRESS', startedAt: '2026-10-25T10:00:00.000Z', assignedTo: userId });
    expect(updated.products).toEqual(state.products);
    expect(updated.movements).toEqual(state.movements);
    expect(state.orders[orderId]).toEqual(originalOrder);
  });

  it('runs Start Picking through the central store and reports feedback', () => {
    const userId = 'user-picker-01';
    const state = { ...baseState, currentUserId: userId, session: baseState.users[userId] };
    const updated = storeReducer(state, { type: 'orders/start-picking', orderId: 'ORD-2026-0001', userId });
    expect(updated.orders['ORD-2026-0001'].status).toBe('IN_PROGRESS');
    expect(updated.feedback).toEqual({ kind: 'success', message: 'Picking started.' });

    const receiverId = 'user-receiver-01';
    const receiverState = { ...baseState, currentUserId: receiverId, session: baseState.users[receiverId] };
    const blocked = storeReducer(receiverState, { type: 'orders/start-picking', orderId: 'ORD-2026-0001', userId: receiverId });
    expect(blocked.orders['ORD-2026-0001'].status).toBe('PENDING');
    expect(blocked.feedback?.kind).toBe('error');
  });

  it('blocks a Receiver and blocks a different user spoofing the active session', () => {
    const receiverId = 'user-receiver-01';
    const receiverState = { ...baseState, currentUserId: receiverId, session: baseState.users[receiverId] };
    expect(() => startPicking(receiverState, { orderId: 'ORD-2026-0001', userId: receiverId })).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));

    const pickerId = 'user-picker-01';
    const pickerState = { ...baseState, currentUserId: pickerId, session: baseState.users[pickerId] };
    expect(() => startPicking(pickerState, { orderId: 'ORD-2026-0001', userId: 'user-admin-01' })).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(receiverState.orders['ORD-2026-0001'].status).toBe('PENDING');
  });

  it.each(['MANAGER', 'ADMIN'])('allows %s to start a pending order', (role) => {
    const allowedUserId = role === 'MANAGER' ? 'user-manager-01' : 'user-admin-01';
    const state = { ...baseState, currentUserId: allowedUserId, session: baseState.users[allowedUserId] };
    const updated = startPicking(state, { orderId: 'ORD-2026-0001', userId: allowedUserId, timestamp: '2026-10-25T11:00:00.000Z' });
    expect(updated.orders['ORD-2026-0001']).toMatchObject({ status: 'IN_PROGRESS', assignedTo: allowedUserId });
  });

  it('rejects starting an unknown or non-pending order', () => {
    const userId = 'user-manager-01';
    const state = { ...baseState, currentUserId: userId, session: baseState.users[userId] };
    expect(() => startPicking(state, { orderId: 'ORD-MISSING', userId })).toThrowError(expect.objectContaining({ code: 'ORDER_NOT_FOUND' }));
    expect(() => startPicking(state, { orderId: 'ORD-2026-0008', userId })).toThrowError(expect.objectContaining({ code: 'ORDER_NOT_PENDING' }));
    expect(() => startPicking(state, { orderId: 'ORD-2026-0005', userId })).toThrowError(expect.objectContaining({ code: 'ORDER_NOT_PENDING' }));
  });

  it('keeps seeded completed orders consistent with picked quantities and PICK Movements', () => {
    const completedOrders = Object.values(seedBusinessData.orders).filter((order) => order.status === 'COMPLETED');
    expect(completedOrders.length).toBeGreaterThan(0);
    for (const order of completedOrders) {
      for (const line of order.lines) {
        expect(line.pickedQty).toBe(line.qty);
        const movementQuantity = seedBusinessData.movements
          .filter((movement) => movement.type === 'PICK' && movement.reference === order.id && movement.sku === line.sku)
          .reduce((total, movement) => total - movement.qty, 0);
        expect(movementQuantity).toBe(line.pickedQty);
      }
    }
  });
});
