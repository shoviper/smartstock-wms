import { describe, expect, it } from 'vitest';
import { seedBusinessData } from '../data/seed';
import type { StoreState } from './models';
import { adjustStock, pickItem, receiveStock, StockActionError } from './stock';
import { createInitialStoreState } from '../store/persistence';
import { getStockStatus } from './inventory';
import { storeReducer } from '../store/StoreProvider';

const pickerId = 'user-picker-01';
const receiverId = 'user-receiver-01';
const managerId = 'user-manager-01';

function stateWithProduct(sku: string, onHand: number): StoreState {
  const state = createInitialStoreState();
  return {
    ...state,
    products: {
      ...state.products,
      [sku]: { ...state.products[sku], onHand },
    },
    orders: {
      ...state.orders,
      'ORD-TEST-1': {
        id: 'ORD-TEST-1',
        customer: 'Test customer',
        createdAt: '2026-10-24T08:00:00.000Z',
        dueAt: '2026-10-25T08:00:00.000Z',
        priority: 'NORMAL',
        status: 'IN_PROGRESS',
        lines: [{ sku, qty: 5, pickedQty: 0 }],
      },
    },
  };
}

describe('stock actions', () => {
  it('Flow 1: receives stock and records a RECEIVE Movement', () => {
    const state = stateWithProduct('SKU-010', 50);
    const result = receiveStock(state, {
      sku: 'SKU-010', quantity: 20, userId: receiverId,
      reference: 'ASN-100', timestamp: '2026-10-24T10:00:00.000Z', movementId: 'movement-receive-test',
    });

    expect(result.state.products['SKU-010'].onHand).toBe(70);
    expect(result.movement).toMatchObject({ type: 'RECEIVE', qty: 20, qtyBefore: 50, qtyAfter: 70, reference: 'ASN-100' });
  });

  it('Flow 2: picks stock, links Movement to the order, and completes its final line', () => {
    const baseState = stateWithProduct('SKU-010', 50);
    const state: StoreState = {
      ...baseState,
      products: { ...baseState.products, 'SKU-011': { ...baseState.products['SKU-011'], onHand: 30 } },
      orders: {
        ...baseState.orders,
        'ORD-TEST-1': {
          ...baseState.orders['ORD-TEST-1'],
          lines: [...baseState.orders['ORD-TEST-1'].lines, { sku: 'SKU-011', qty: 2, pickedQty: 0 }],
        },
      },
    };
    const firstPick = pickItem(state, {
      orderId: 'ORD-TEST-1', sku: 'SKU-010', scannedSku: 'SKU-010', quantity: 5, userId: pickerId,
      timestamp: '2026-10-24T10:00:00.000Z', movementId: 'movement-pick-test',
    });

    expect(firstPick.state.products['SKU-010'].onHand).toBe(45);
    expect(firstPick.movement).toMatchObject({ type: 'PICK', qty: -5, qtyBefore: 50, qtyAfter: 45, reference: 'ORD-TEST-1' });
    expect(firstPick.state.orders['ORD-TEST-1'].status).toBe('IN_PROGRESS');

    const finalPick = pickItem(firstPick.state, {
      orderId: 'ORD-TEST-1', sku: 'SKU-011', scannedSku: 'SKU-011', quantity: 2, userId: pickerId,
      movementId: 'movement-pick-final-test',
    });
    expect(finalPick.state.products['SKU-011'].onHand).toBe(28);
    expect(finalPick.state.orders['ORD-TEST-1'].status).toBe('COMPLETED');
  });

  it('Flow 3: blocks a scanned SKU that does not match the order line', () => {
    const state = stateWithProduct('SKU-010', 50);
    expect(() => pickItem(state, {
      orderId: 'ORD-TEST-1', sku: 'SKU-010', scannedSku: 'SKU-011', quantity: 1, userId: pickerId,
    })).toThrowError(expect.objectContaining({ code: 'SKU_MISMATCH' }));
    expect(state.products['SKU-010'].onHand).toBe(50);
    expect(state.movements).toHaveLength(seedBusinessData.movements.length);
  });

  it('Flow 4: prevents picking more than on-hand stock', () => {
    const state = stateWithProduct('SKU-010', 3);
    expect(() => pickItem(state, {
      orderId: 'ORD-TEST-1', sku: 'SKU-010', scannedSku: 'SKU-010', quantity: 5, userId: pickerId,
    })).toThrowError(expect.objectContaining({ code: 'NEGATIVE_STOCK' }));
    expect(state.products['SKU-010'].onHand).toBe(3);
  });

  it('Flow 5: adjusts stock to the counted value and records the signed difference', () => {
    const state = stateWithProduct('SKU-010', 50);
    const result = adjustStock(state, {
      sku: 'SKU-010', countedQty: 47, userId: managerId, reason: 'Cycle count variance',
      timestamp: '2026-10-24T10:00:00.000Z', movementId: 'movement-adjust-test',
    });

    expect(result.state.products['SKU-010'].onHand).toBe(47);
    expect(result.movement).toMatchObject({ type: 'ADJUST', qty: -3, qtyBefore: 50, qtyAfter: 47, reason: 'Cycle count variance' });
  });

  it('blocks invalid quantities, unknown SKUs, and adjustment without a permitted role', () => {
    const state = stateWithProduct('SKU-010', 10);
    expect(() => receiveStock(state, { sku: 'SKU-010', quantity: 0, userId: receiverId })).toThrowError(StockActionError);
    expect(() => receiveStock(state, { sku: 'SKU-MISSING', quantity: 1, userId: receiverId })).toThrowError(
      expect.objectContaining({ code: 'UNKNOWN_SKU' }),
    );
    expect(() => adjustStock(state, { sku: 'SKU-010', countedQty: 8, userId: pickerId, reason: 'Count' })).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN' }),
    );
  });

  it('blocks both Picker and Receiver from adjusting stock', () => {
    const state = stateWithProduct('SKU-010', 10);
    for (const userId of [pickerId, receiverId]) {
      expect(() => adjustStock(state, {
        sku: 'SKU-010', countedQty: 8, userId, reason: 'Count variance',
      })).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    }
    expect(state.products['SKU-010'].onHand).toBe(10);
  });

  it('does not create a Movement when the counted stock already matches', () => {
    const state = stateWithProduct('SKU-010', 10);
    const result = adjustStock(state, { sku: 'SKU-010', countedQty: 10, userId: managerId, reason: 'Cycle count' });
    expect(result.movement).toBeUndefined();
    expect(result.state.movements).toHaveLength(state.movements.length);
    expect(result.message).toContain('no Movement was created');
  });

  it('Reset demo data restores only business data and preserves session and theme', () => {
    const initial = createInitialStoreState();
    const changed: StoreState = {
      ...initial,
      products: { ...initial.products, 'SKU-010': { ...initial.products['SKU-010'], onHand: 1 } },
      orders: {},
      movements: [],
      currentUserId: managerId,
      theme: 'dark',
    };
    const reset = storeReducer(changed, { type: 'demo/reset' });

    expect(reset.products).toEqual(seedBusinessData.products);
    expect(reset.orders).toEqual(seedBusinessData.orders);
    expect(reset.movements).toEqual(seedBusinessData.movements);
    expect(reset.locations).toEqual(changed.locations);
    expect(reset.users).toEqual(changed.users);
    expect(reset.currentUserId).toBe(managerId);
    expect(reset.theme).toBe('dark');
  });

  it('classifies stock at each threshold boundary', () => {
    const state = createInitialStoreState();
    const product = state.products['SKU-010'];
    expect(getStockStatus({ ...product, onHand: 0, reorderPoint: 10 })).toBe('OUT');
    expect(getStockStatus({ ...product, onHand: 5, reorderPoint: 10 })).toBe('CRITICAL');
    expect(getStockStatus({ ...product, onHand: 6, reorderPoint: 10 })).toBe('LOW');
    expect(getStockStatus({ ...product, onHand: 10, reorderPoint: 10 })).toBe('LOW');
    expect(getStockStatus({ ...product, onHand: 11, reorderPoint: 10 })).toBe('NORMAL');
  });
});

describe('seed data integrity', () => {
  it('has 40 SKUs, four zones, varied orders, status examples, and continuous Movement history', () => {
    const { products, locations, orders, movements } = seedBusinessData;
    const productList = Object.values(products);
    expect(productList).toHaveLength(40);
    expect(new Set(Object.values(locations).map((location) => location.zone))).toHaveLength(4);
    expect(Object.values(locations).every((location) => location.capacity > 0 && location.dispatchDistanceMeters >= 0)).toBe(true);
    expect(Object.values(orders)).toHaveLength(12);
    expect(new Set(Object.values(orders).map((order) => order.status)).size).toBeGreaterThanOrEqual(3);
    expect(productList.filter((product) => getStockStatus(product) === 'OUT').length).toBeGreaterThanOrEqual(2);
    expect(productList.filter((product) => getStockStatus(product) === 'CRITICAL').length).toBeGreaterThanOrEqual(2);
    expect(productList.filter((product) => getStockStatus(product) === 'LOW').length).toBeGreaterThanOrEqual(2);
    expect(movements.every((movement) => Date.now() - new Date(movement.timestamp).getTime() <= 31 * 24 * 60 * 60 * 1000)).toBe(true);

    for (const product of productList) {
      const history = movements.filter((movement) => movement.sku === product.sku);
      expect(history.length).toBeGreaterThan(0);
      for (let index = 1; index < history.length; index += 1) {
        expect(history[index].qtyBefore).toBe(history[index - 1].qtyAfter);
      }
      expect(history.at(-1)?.qtyAfter).toBe(product.onHand);
    }
  });

  it('references an existing Product for every SKU in every Order', () => {
    const productSkus = new Set(Object.keys(seedBusinessData.products));
    const orderLines = Object.values(seedBusinessData.orders).flatMap((order) => order.lines);
    const missingProductSkus = orderLines
      .map((line) => line.sku)
      .filter((sku) => !productSkus.has(sku));

    expect(orderLines.length).toBeGreaterThan(0);
    expect(missingProductSkus).toEqual([]);
  });
});
