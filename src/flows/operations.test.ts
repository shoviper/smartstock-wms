import { describe, expect, it } from 'vitest';
import { seedBusinessData } from '../data/seed';
import type { Order, Role, StoreState } from '../domain/models';
import { getStockStatus, selectProductsByStatus } from '../domain/inventory';
import { storeReducer } from '../store/StoreProvider';
import { createInitialStoreState } from '../store/persistence';

const FLOW_ORDER_ID = 'ORD-FLOW-3E';

function stateForRole(role: Role): StoreState {
  const base = createInitialStoreState();
  const session = Object.values(base.users).find((user) => user.role === role);
  if (!session) throw new Error(`No seeded user for role ${role}.`);
  return { ...base, currentUserId: session.id, session };
}

function addOrder(state: StoreState, sku: string, qty: number, status: Order['status']): StoreState {
  const template = Object.values(state.orders)[0];
  const order: Order = {
    ...template,
    id: FLOW_ORDER_ID,
    status,
    lines: [{ sku, qty, pickedQty: 0 }],
  };
  return { ...state, orders: { ...state.orders, [FLOW_ORDER_ID]: order } };
}

function alertCount(state: StoreState): number {
  return (['OUT', 'CRITICAL', 'LOW'] as const)
    .reduce((total, status) => total + selectProductsByStatus(state, status).length, 0);
}

function expectStockInvariants(state: StoreState): void {
  for (const product of Object.values(state.products)) {
    const location = state.locations[product.locationId];
    expect(product.onHand, `${product.sku} on-hand must not be negative`).toBeGreaterThanOrEqual(0);
    expect(product.onHand, `${product.sku} must fit its assigned capacity`).toBeLessThanOrEqual(location.capacity);
    const history = state.movements.filter((movement) => movement.sku === product.sku);
    expect(history.length, `${product.sku} must have Movement history`).toBeGreaterThan(0);
    for (let index = 1; index < history.length; index += 1) {
      expect(history[index].qtyBefore, `${product.sku} Movement chain at ${index}`).toBe(history[index - 1].qtyAfter);
    }
    expect(history.at(-1)?.qtyAfter, `${product.sku} latest Movement must match on-hand`).toBe(product.onHand);
  }

  for (const order of Object.values(state.orders)) {
    const pickedMovements = state.movements
      .filter((movement) => movement.type === 'PICK' && movement.reference === order.id)
      .reduce((total, movement) => total - movement.qty, 0);
    const pickedLines = order.lines.reduce((total, line) => total + line.pickedQty, 0);
    expect(pickedMovements, `${order.id} PICK Movement total must match pickedQty`).toBe(pickedLines);
  }
}

function seededRandom(initialSeed: number) {
  let seed = initialSeed >>> 0;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function choose<T>(items: T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}

describe('Round 3 store operation flows', () => {
  it('Flow 1: receives 20 units and exposes the updated stock and RECEIVE Movement through store state', () => {
    const state = stateForRole('RECEIVER');
    const product = Object.values(state.products).find((candidate) => {
      const capacity = state.locations[candidate.locationId].capacity;
      return capacity - candidate.onHand >= 20;
    })!;
    const before = product.onHand;
    const updated = storeReducer(state, {
      type: 'stock/receive',
      input: { sku: product.sku, quantity: 20, userId: state.session!.id, reference: 'ASN-FLOW-3E' },
    });
    const movement = updated.movements.at(-1);

    expect(updated.products[product.sku].onHand).toBe(before + 20);
    expect(movement).toMatchObject({ type: 'RECEIVE', sku: product.sku, qty: 20, qtyBefore: before, qtyAfter: before + 20, reference: 'ASN-FLOW-3E' });
  });

  it('Flow 2: starts an order, picks five, records its PICK Movement and completes the line', () => {
    const base = stateForRole('PICKER');
    const product = Object.values(base.products).find((candidate) => candidate.onHand >= 5)!;
    const state = addOrder(base, product.sku, 5, 'PENDING');
    const userId = state.session!.id;
    const started = storeReducer(state, { type: 'orders/start-picking', orderId: FLOW_ORDER_ID, userId });
    const before = started.products[product.sku].onHand;
    const updated = storeReducer(started, {
      type: 'stock/pick',
      input: { orderId: FLOW_ORDER_ID, sku: product.sku, scannedSku: product.sku, quantity: 5, userId },
    });

    expect(started.orders[FLOW_ORDER_ID].status).toBe('IN_PROGRESS');
    expect(updated.products[product.sku].onHand).toBe(before - 5);
    expect(updated.movements.at(-1)).toMatchObject({ type: 'PICK', sku: product.sku, qty: -5, reference: FLOW_ORDER_ID });
    expect(updated.orders[FLOW_ORDER_ID]).toMatchObject({ status: 'COMPLETED', lines: [{ sku: product.sku, qty: 5, pickedQty: 5 }] });
  });

  it('Flow 3: rejects a mismatched scanned SKU atomically through the store', () => {
    const base = stateForRole('PICKER');
    const product = Object.values(base.products).find((candidate) => candidate.onHand > 0)!;
    const state = addOrder(base, product.sku, 1, 'IN_PROGRESS');
    const updated = storeReducer(state, {
      type: 'stock/pick',
      input: { orderId: FLOW_ORDER_ID, sku: product.sku, scannedSku: 'SKU-WRONG', quantity: 1, userId: state.session!.id },
    });

    expect(updated.products).toEqual(state.products);
    expect(updated.orders).toEqual(state.orders);
    expect(updated.movements).toEqual(state.movements);
    expect(updated.feedback?.kind).toBe('error');
  });

  it('Flow 4: blocks picking more than on-hand without changing stock, order or Movements', () => {
    const base = stateForRole('PICKER');
    const product = Object.values(base.products).find((candidate) => candidate.onHand >= 0)!;
    const state = addOrder(base, product.sku, product.onHand + 1, 'IN_PROGRESS');
    const updated = storeReducer(state, {
      type: 'stock/pick',
      input: { orderId: FLOW_ORDER_ID, sku: product.sku, scannedSku: product.sku, quantity: product.onHand + 1, userId: state.session!.id },
    });

    expect(updated.products).toEqual(state.products);
    expect(updated.orders).toEqual(state.orders);
    expect(updated.movements).toEqual(state.movements);
    expect(updated.feedback?.kind).toBe('error');
  });

  it('Flow 5: adjusts 50 to 47 and records ADJUST -3 with the supplied reason', () => {
    const state = stateForRole('MANAGER');
    const product = Object.values(state.products).find((candidate) => candidate.onHand === 50)!;
    const updated = storeReducer(state, {
      type: 'stock/adjust',
      input: { sku: product.sku, countedQty: 47, userId: state.session!.id, reason: 'Cycle count correction' },
    });

    expect(updated.products[product.sku].onHand).toBe(47);
    expect(updated.movements.at(-1)).toMatchObject({ type: 'ADJUST', sku: product.sku, qty: -3, qtyBefore: 50, qtyAfter: 47, reason: 'Cycle count correction' });
  });

  it('Flow 6: derives a higher Topbar stock-alert count after stock drops below reorder point', () => {
    const state = stateForRole('MANAGER');
    const product = Object.values(state.products).find((candidate) => candidate.onHand > candidate.reorderPoint)!;
    const beforeAlerts = alertCount(state);
    const updated = storeReducer(state, {
      type: 'stock/adjust',
      input: { sku: product.sku, countedQty: product.reorderPoint - 1, userId: state.session!.id, reason: 'Cycle count correction' },
    });

    expect(getStockStatus(updated.products[product.sku])).toBe('LOW');
    expect(alertCount(updated)).toBe(beforeAlerts + 1);
    expect(selectProductsByStatus(updated, 'LOW').some((item) => item.sku === product.sku)).toBe(true);
  });

  it('Flow 8: store actions reject roles without permission', () => {
    const picker = stateForRole('PICKER');
    const receiver = stateForRole('RECEIVER');
    const product = Object.values(picker.products).find((candidate) => candidate.onHand > 0)!;
    const pickerReceive = storeReducer(picker, {
      type: 'stock/receive', input: { sku: product.sku, quantity: 1, userId: picker.session!.id },
    });
    const pickerAdjust = storeReducer(picker, {
      type: 'stock/adjust', input: { sku: product.sku, countedQty: product.onHand + 1, userId: picker.session!.id, reason: 'Unauthorized test' },
    });
    const receiverOrder = addOrder(receiver, product.sku, 1, 'IN_PROGRESS');
    const receiverPick = storeReducer(receiverOrder, {
      type: 'stock/pick', input: { orderId: FLOW_ORDER_ID, sku: product.sku, scannedSku: product.sku, quantity: 1, userId: receiver.session!.id },
    });
    const receiverAdjust = storeReducer(receiver, {
      type: 'stock/adjust', input: { sku: product.sku, countedQty: product.onHand + 1, userId: receiver.session!.id, reason: 'Unauthorized test' },
    });

    expect(pickerReceive.feedback?.kind).toBe('error');
    expect(pickerAdjust.feedback?.kind).toBe('error');
    expect(receiverPick.feedback?.kind).toBe('error');
    expect(receiverAdjust.feedback?.kind).toBe('error');
    expect(pickerReceive.products).toEqual(picker.products);
    expect(pickerAdjust.movements).toEqual(picker.movements);
    expect(receiverPick.products).toEqual(receiverOrder.products);
    expect(receiverAdjust.products).toEqual(receiver.products);
  });

  it('reset demo data restores business data while preserving signed-in session and theme', () => {
    let state = stateForRole('MANAGER');
    const userId = state.session!.id;
    state = { ...state, theme: 'dark' };
    const product = Object.values(state.products).find((candidate) => state.locations[candidate.locationId].capacity - candidate.onHand >= 1)!;
    const changed = storeReducer(state, { type: 'stock/receive', input: { sku: product.sku, quantity: 1, userId } });
    const reset = storeReducer(changed, { type: 'demo/reset' });

    expect(reset.products).toEqual(seedBusinessData.products);
    expect(reset.orders).toEqual(seedBusinessData.orders);
    expect(reset.movements).toEqual(seedBusinessData.movements);
    expect(reset.session).toEqual(state.session);
    expect(reset.currentUserId).toBe(userId);
    expect(reset.theme).toBe('dark');
  });
});

describe('seeded randomized store invariants', () => {
  it('preserves stock, Movement and Order invariants after 200 valid and invalid operations', () => {
    const random = seededRandom(0x3e2026);
    let state = stateForRole('MANAGER');
    const userId = state.session!.id;
    let acceptedCount = 0;
    let rejectedCount = 0;

    for (const order of Object.values(state.orders).filter((candidate) => candidate.status === 'PENDING')) {
      state = storeReducer(state, { type: 'orders/start-picking', orderId: order.id, userId });
      expectStockInvariants(state);
    }

    for (let index = 0; index < 200; index += 1) {
      const kind = index % 4;
      const intentionallyInvalid = random() < 0.38;
      const before = state;
      let expectedAccepted = !intentionallyInvalid;

      if (kind === 0) {
        const product = choose(Object.values(state.products), random);
        const capacity = state.locations[product.locationId].capacity;
        const available = capacity - product.onHand;
        const quantity = intentionallyInvalid || available < 1
          ? Math.max(1, available + 1)
          : 1 + Math.floor(random() * available);
        if (available < 1) expectedAccepted = false;
        state = storeReducer(state, { type: 'stock/receive', input: { sku: product.sku, quantity, userId } });
      } else if (kind === 1) {
        const openOrders = Object.values(state.orders).filter((order) => order.status === 'IN_PROGRESS'
          && order.lines.some((line) => line.pickedQty + (line.shortQty ?? 0) < line.qty));
        if (intentionallyInvalid || openOrders.length === 0) {
          expectedAccepted = false;
          const order = openOrders[0] ?? Object.values(state.orders)[0];
          const line = order.lines[0];
          state = storeReducer(state, { type: 'stock/pick', input: {
            orderId: order.id, sku: line.sku, scannedSku: 'SKU-WRONG', quantity: 1, userId,
          } });
        } else {
          const order = choose(openOrders, random);
          const lines = order.lines.filter((line) => line.pickedQty + (line.shortQty ?? 0) < line.qty
            && state.products[line.sku].onHand > 0);
          if (lines.length === 0) {
            expectedAccepted = false;
            const line = order.lines.find((candidate) => candidate.pickedQty + (candidate.shortQty ?? 0) < candidate.qty)!;
            state = storeReducer(state, { type: 'stock/pick', input: {
              orderId: order.id, sku: line.sku, scannedSku: 'SKU-WRONG', quantity: 1, userId,
            } });
          } else {
            const line = choose(lines, random);
            const remaining = line.qty - line.pickedQty - (line.shortQty ?? 0);
            const quantity = 1 + Math.floor(random() * Math.min(remaining, state.products[line.sku].onHand));
            state = storeReducer(state, { type: 'stock/pick', input: {
              orderId: order.id, sku: line.sku, scannedSku: line.sku, quantity, userId,
            } });
          }
        }
      } else if (kind === 2) {
        const openOrders = Object.values(state.orders).filter((order) => order.status === 'IN_PROGRESS'
          && order.lines.some((line) => line.pickedQty + (line.shortQty ?? 0) < line.qty));
        if (intentionallyInvalid || openOrders.length === 0) {
          expectedAccepted = false;
          state = storeReducer(state, { type: 'orders/short-pick', input: {
            orderId: 'ORD-MISSING', sku: 'SKU-001', scannedSku: 'SKU-001', quantity: 0, userId, reason: 'Other',
          } });
        } else {
          const order = choose(openOrders, random);
          const lines = order.lines.filter((line) => line.pickedQty + (line.shortQty ?? 0) < line.qty);
          const line = choose(lines, random);
          const remaining = line.qty - line.pickedQty - (line.shortQty ?? 0);
          const product = state.products[line.sku];
          const maxShortPick = Math.min(remaining - 1, product.onHand);
          const quantity = maxShortPick > 0 ? Math.floor(random() * (maxShortPick + 1)) : 0;
          state = storeReducer(state, { type: 'orders/short-pick', input: {
            orderId: order.id, sku: line.sku, scannedSku: line.sku, expectedLocationId: product.locationId,
            quantity, userId, reason: 'Out of stock',
          } });
        }
      } else {
        const product = choose(Object.values(state.products), random);
        const capacity = state.locations[product.locationId].capacity;
        const countedQty = intentionallyInvalid ? capacity + 1 : Math.floor(random() * (capacity + 1));
        state = storeReducer(state, { type: 'stock/adjust', input: {
          sku: product.sku, countedQty, userId, reason: 'Cycle count correction',
        } });
      }

      if (expectedAccepted) {
        acceptedCount += 1;
        expect(state.feedback?.kind, `operation ${index} should succeed`).toBe('success');
      } else {
        rejectedCount += 1;
        expect(state.feedback?.kind, `operation ${index} should be rejected`).toBe('error');
        expect(state.products).toEqual(before.products);
        expect(state.orders).toEqual(before.orders);
        expect(state.movements).toEqual(before.movements);
      }
      expectStockInvariants(state);
    }

    expect(acceptedCount).toBeGreaterThan(0);
    expect(rejectedCount).toBeGreaterThan(0);
  });
});
