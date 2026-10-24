import { describe, expect, it } from 'vitest';
import { getStockStatus } from '../domain/inventory';
import type { Order, Role, StoreState } from '../domain/models';
import { selectDashboardKpis } from '../domain/dashboard';
import { storeReducer } from '../store/StoreProvider';
import { createInitialStoreState } from '../store/persistence';

const now = new Date('2026-06-10T17:00:00.000Z');
const testTime = now.toISOString();

function stateForRole(role: Role): StoreState {
  const base = createInitialStoreState();
  const session = Object.values(base.users).find((user) => user.role === role)!;
  return { ...base, currentUserId: session.id, session };
}

function addPickOrder(state: StoreState, sku: string): StoreState {
  const template = Object.values(state.orders)[0];
  const order: Order = { ...template, id: 'ORD-DASHBOARD-PICK', status: 'PENDING', dueAt: '2026-06-12T00:00:00.000Z', lines: [{ sku, qty: 2, pickedQty: 0 }] };
  return { ...state, orders: { ...state.orders, [order.id]: order } };
}

describe('Dashboard selectors after store actions', () => {
  it('updates attention counts after receiveStock moves a Low item above reorder point', () => {
    const state = stateForRole('RECEIVER');
    const product = Object.values(state.products).find((candidate) => getStockStatus(candidate) === 'LOW'
      && state.locations[candidate.locationId].capacity >= candidate.reorderPoint + 1);
    expect(product).toBeDefined();
    const quantity = product!.reorderPoint + 1 - product!.onHand;
    const before = selectDashboardKpis(state, now).attentionTotal;
    const after = storeReducer(state, { type: 'stock/receive', input: { sku: product!.sku, quantity, userId: state.session!.id, timestamp: testTime } });
    expect(after.products[product!.sku].onHand).toBe(product!.reorderPoint + 1);
    expect(selectDashboardKpis(after, now).attentionTotal).toBe(before - 1);
  });

  it('updates attention counts after pickItem takes a Normal item below reorder point', () => {
    const initial = stateForRole('PICKER');
    const candidate = Object.values(initial.products).find((product) => getStockStatus(product) === 'NORMAL' && product.reorderPoint + 1 <= product.onHand)!;
    const product = { ...candidate, onHand: candidate.reorderPoint + 1 };
    const state = addPickOrder({ ...initial, products: { ...initial.products, [product.sku]: product } }, product.sku);
    const before = selectDashboardKpis(state, now).attentionTotal;
    const started = storeReducer(state, { type: 'orders/start-picking', orderId: 'ORD-DASHBOARD-PICK', userId: state.session!.id });
    const after = storeReducer(started, { type: 'stock/pick', input: { orderId: 'ORD-DASHBOARD-PICK', sku: product.sku, scannedSku: product.sku, quantity: 2, userId: state.session!.id, timestamp: testTime } });
    expect(after.products[product.sku].onHand).toBe(product.reorderPoint - 1);
    expect(selectDashboardKpis(after, now).attentionTotal).toBe(before + 1);
  });

  it('updates attention counts after adjustStock sets a Normal item to zero', () => {
    const state = stateForRole('MANAGER');
    const product = Object.values(state.products).find((candidate) => getStockStatus(candidate) === 'NORMAL')!;
    const before = selectDashboardKpis(state, now).attentionTotal;
    const after = storeReducer(state, { type: 'stock/adjust', input: { sku: product.sku, countedQty: 0, userId: state.session!.id, reason: 'Cycle count correction', timestamp: testTime } });
    expect(after.products[product.sku].onHand).toBe(0);
    expect(selectDashboardKpis(after, now).attentionTotal).toBe(before + 1);
  });
});
