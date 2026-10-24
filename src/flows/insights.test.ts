import { describe, expect, it } from 'vitest';
import type { Order, StoreState } from '../domain/models';
import { selectStockoutInsights } from '../domain/insights';
import { createInitialStoreState } from '../store/persistence';
import { storeReducer } from '../store/StoreProvider';

describe('Stockout Prediction store flow', () => {
  it('updates recent demand and prediction values after a store pick', () => {
    const initial = createInitialStoreState();
    const picker = Object.values(initial.users).find((user) => user.role === 'PICKER')!;
    const sku = 'SKU-010';
    const order: Order = {
      id: 'ORD-INSIGHTS-FLOW',
      customer: 'Insights test',
      createdAt: '2026-10-25T12:00:00.000Z',
      dueAt: '2026-10-26T12:00:00.000Z',
      priority: 'NORMAL',
      status: 'PENDING',
      lines: [{ sku, qty: 1, pickedQty: 0 }],
    };
    const state: StoreState = {
      ...initial,
      currentUserId: picker.id,
      session: picker,
      orders: { ...initial.orders, [order.id]: order },
    };
    const now = new Date('2026-10-25T12:00:00.000Z');
    const before = selectStockoutInsights(state, now).predictions.find((row) => row.product.sku === sku)!;
    const started = storeReducer(state, { type: 'orders/start-picking', orderId: order.id, userId: picker.id });
    const afterPick = storeReducer(started, {
      type: 'stock/pick',
      input: {
        orderId: order.id,
        sku,
        scannedSku: sku,
        quantity: 1,
        userId: picker.id,
        expectedLocationId: state.products[sku].locationId,
        timestamp: now.toISOString(),
        movementId: 'movement-insights-flow',
      },
    });
    const after = selectStockoutInsights(afterPick, now).predictions.find((row) => row.product.sku === sku)!;

    expect(afterPick.products[sku].onHand).toBe(state.products[sku].onHand - 1);
    expect(after.pickedUnits30Days).toBe(before.pickedUnits30Days + 1);
    expect(after.averageDailyUse).toBe(before.averageDailyUse + 1 / 30);
    expect(after.daysOfSupply).toBeLessThan(before.daysOfSupply!);
  });
});
