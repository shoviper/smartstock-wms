import { describe, expect, it } from 'vitest';
import { seedBusinessData } from '../data/seed';
import type { StoreState } from '../domain/models';
import { updateReorderPoint } from '../domain/inventory';
import { createInitialStoreState, loadStoreState, persistStoreState, STORE_VERSION, STORAGE_KEY } from './persistence';

function createMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() { return entries.size; },
    clear() { entries.clear(); },
    getItem(key) { return entries.get(key) ?? null; },
    key(index) { return [...entries.keys()][index] ?? null; },
    removeItem(key) { entries.delete(key); },
    setItem(key, value) { entries.set(key, String(value)); },
  };
}

describe('versioned localStorage persistence', () => {
  it('persists and restores the versioned store, session, and theme', () => {
    const storage = createMemoryStorage();
    const state = {
      ...createInitialStoreState(),
      currentUserId: 'user-manager-01',
      session: { id: 'user-manager-01', name: 'Demo Manager', role: 'MANAGER' as const },
      theme: 'dark' as const,
    };

    expect(persistStoreState(state, storage)).toBe(true);
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    expect(saved.version).toBe(STORE_VERSION);
    expect(loadStoreState(storage)).toMatchObject({
      products: state.products,
      currentUserId: 'user-manager-01',
      session: state.session,
      theme: 'dark',
      feedback: null,
    });
  });

  it('persists an updated product reorder point through reload', () => {
    const storage = createMemoryStorage();
    const initial = createInitialStoreState();
    const managerState: StoreState = {
      ...initial,
      currentUserId: 'user-manager-01',
      session: { id: 'user-manager-01', name: 'Demo Manager', role: 'MANAGER' },
    };
    const updated = updateReorderPoint(managerState, 'SKU-001', 42);

    expect(persistStoreState(updated, storage)).toBe(true);
    expect(loadStoreState(storage).products['SKU-001'].reorderPoint).toBe(42);
  });

  it('migrates legacy v1 orders while preserving saved order and stock data', () => {
    const storage = createMemoryStorage();
    const base = createInitialStoreState();
    const orderId = 'ORD-2026-0001';
    const savedOrder = { ...base.orders[orderId], lines: base.orders[orderId].lines.map((line) => ({ ...line, pickedQty: 1 })) };
    const savedState = {
      ...base,
      products: { ...base.products, 'SKU-001': { ...base.products['SKU-001'], onHand: 77 } },
      orders: { ...base.orders, [orderId]: savedOrder },
      movements: [...base.movements],
    };
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, state: savedState }));

    const loaded = loadStoreState(storage);
    expect(loaded.products['SKU-001'].onHand).toBe(77);
    expect(loaded.orders[orderId]).toMatchObject({ ...savedOrder, startedAt: null, assignedTo: null });
    expect(loaded.movements).toEqual(savedState.movements);
  });

  it('migrates legacy completed-with-shortage lines without changing other orders, stock, or Movements', () => {
    const storage = createMemoryStorage();
    const base = createInitialStoreState();
    const shortageId = 'ORD-2026-0012';
    const regularId = 'ORD-2026-0001';
    const oldShortageOrder = {
      ...base.orders[shortageId],
      lines: base.orders[shortageId].lines.map((line) => ({ sku: line.sku, qty: line.qty, pickedQty: line.pickedQty })),
    };
    const oldRegularOrder = { ...base.orders[regularId], lines: base.orders[regularId].lines.map((line) => ({ sku: line.sku, qty: line.qty, pickedQty: line.pickedQty })) };
    const oldState = {
      ...base,
      products: { ...base.products, 'SKU-007': { ...base.products['SKU-007'], onHand: 3 } },
      orders: { ...base.orders, [shortageId]: oldShortageOrder, [regularId]: oldRegularOrder },
      movements: [...base.movements],
    };
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, state: oldState }));

    const loaded = loadStoreState(storage);
    expect(loaded.orders[shortageId].status).toBe('COMPLETED_WITH_SHORTAGE');
    expect(loaded.orders[shortageId].lines).toEqual(expect.arrayContaining(oldShortageOrder.lines.map((line) => expect.objectContaining({ sku: line.sku, shortQty: line.qty - line.pickedQty, shortReason: 'Not found at location' }))));
    expect(loaded.orders[regularId].lines).toEqual(oldRegularOrder.lines);
    expect(loaded.orders[regularId].status).toBe('PENDING');
    expect(loaded.products['SKU-007'].onHand).toBe(3);
    expect(loaded.movements).toEqual(oldState.movements);
  });

  it('falls back to seed data when the stored version is unsupported', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORE_VERSION + 1, state: {} }));
    expect(loadStoreState(storage).products).toEqual(createInitialStoreState().products);
  });

  it('migrates persisted seed categories, units, and locations without changing stock, movement quantities, session, or theme', () => {
    const storage = createMemoryStorage();
    const state = createInitialStoreState();
    const staleState: StoreState = {
      ...state,
      currentUserId: 'user-manager-01',
      session: { id: 'user-manager-01', name: 'Demo Manager', role: 'MANAGER' },
      theme: 'dark',
      products: {
        ...state.products,
        'SKU-001': { ...state.products['SKU-001'], category: 'Electronics', unit: 'roll', locationId: 'A-01-01-1' },
        'SKU-002': { ...state.products['SKU-002'], category: 'Safety', unit: 'each', locationId: 'A-01-01-1' },
      },
      locations: { 'A-01-01-1': { ...state.locations['A-01-01-1'], capacity: 999 } },
      movements: state.movements.map((movement) => movement.sku === 'SKU-002'
        ? { ...movement, locationId: 'A-01-01-1' }
        : movement),
    };
    expect(persistStoreState(staleState, storage)).toBe(true);

    const loaded = loadStoreState(storage);
    for (const sku of ['SKU-001', 'SKU-002']) {
      expect(loaded.products[sku].unit).toBe(seedBusinessData.products[sku].unit);
      expect(loaded.products[sku].category).toBe(seedBusinessData.products[sku].category);
      expect(loaded.products[sku].onHand).toBe(staleState.products[sku].onHand);
      expect(loaded.products[sku].reorderPoint).toBe(staleState.products[sku].reorderPoint);
      expect(loaded.products[sku].locationId).toBe(seedBusinessData.products[sku].locationId);
    }
    expect(loaded.locations).toEqual(seedBusinessData.locations);
    expect(loaded.movements.map((movement) => movement.locationId)).toEqual(
      staleState.movements.map((movement) => seedBusinessData.products[movement.sku].locationId),
    );
    const withoutLocation = (movement: StoreState['movements'][number]) => ({
      id: movement.id,
      timestamp: movement.timestamp,
      type: movement.type,
      sku: movement.sku,
      qty: movement.qty,
      qtyBefore: movement.qtyBefore,
      qtyAfter: movement.qtyAfter,
      userId: movement.userId,
      reference: movement.reference,
      reason: movement.reason,
    });
    expect(loaded.movements.map(withoutLocation)).toEqual(staleState.movements.map(withoutLocation));
    expect(loaded).toMatchObject({
      currentUserId: staleState.currentUserId,
      session: staleState.session,
      theme: staleState.theme,
    });
  });
});
