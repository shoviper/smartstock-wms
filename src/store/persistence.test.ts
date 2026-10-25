import { describe, expect, it } from 'vitest';
import type { StoreState } from '../domain/models';
import { updateReorderPoint } from '../domain/inventory';
import { createInitialStoreState, loadStoreState, persistStoreState, readPersistenceInfo, STORE_VERSION, STORAGE_KEY } from './persistence';
import { DEFAULT_REORDER_POINT } from '../domain/settings';

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
      settings: { defaultReorderPoint: 31 },
    };

    expect(persistStoreState(state, storage)).toBe(true);
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    expect(saved.version).toBe(STORE_VERSION);
    expect(loadStoreState(storage)).toMatchObject({
      products: state.products,
      currentUserId: 'user-manager-01',
      session: state.session,
      theme: 'dark',
      settings: { defaultReorderPoint: 31 },
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

  it.each([1, 2, 3, 4])('fills the missing app setting in v%s data without changing saved data', (version) => {
    const storage = createMemoryStorage();
    const base = createInitialStoreState();
    const savedState: StoreState = {
      ...base,
      currentUserId: 'user-manager-01',
      session: { id: 'user-manager-01', name: 'Demo Manager', role: 'MANAGER' },
      theme: 'dark',
      products: {
        ...base.products,
        'SKU-001': { ...base.products['SKU-001'], category: 'Custom category', unit: 'case', locationId: 'A-01-01-1', onHand: 77 },
      },
      orders: { ...base.orders, 'ORD-2026-0001': { ...base.orders['ORD-2026-0001'], customer: 'Saved customer' } },
      movements: base.movements.map((movement) => movement.sku === 'SKU-001' ? { ...movement, locationId: 'A-02-01-2' } : movement),
      locations: Object.fromEntries(Object.entries(base.locations)
        .filter(([, location]) => location.aisle !== '03')
        .map(([id, location]) => [id, id === 'A-01-01-1' ? { ...location, capacity: 999 } : location])),
    };
    const businessValuesBefore = {
      products: structuredClone(savedState.products),
      locations: structuredClone(savedState.locations),
      orders: structuredClone(savedState.orders),
      movements: structuredClone(savedState.movements),
      users: structuredClone(savedState.users),
      session: structuredClone(savedState.session),
      theme: savedState.theme,
      currentUserId: savedState.currentUserId,
    };
    const legacyState = { ...savedState, settings: undefined };
    storage.setItem(STORAGE_KEY, JSON.stringify({ version, state: legacyState }));

    const loaded = loadStoreState(storage);
    expect({
      products: loaded.products, locations: loaded.locations, orders: loaded.orders, movements: loaded.movements,
      users: loaded.users, session: loaded.session, theme: loaded.theme, currentUserId: loaded.currentUserId,
    }).toEqual(businessValuesBefore);
    expect(loaded.locations['A-01-01-1']).toEqual(savedState.locations['A-01-01-1']);
    expect(loaded.settings).toEqual({ defaultReorderPoint: DEFAULT_REORDER_POINT });
  });

  it('stores lastSavedAt in envelope metadata, outside the business state', () => {
    const storage = createMemoryStorage();
    const state = createInitialStoreState();
    const now = new Date('2026-10-25T07:30:00.000Z');
    expect(persistStoreState(state, storage, now)).toBe(true);
    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}');
    expect(saved.lastSavedAt).toBe(now.toISOString());
    expect(saved.state.lastSavedAt).toBeUndefined();
    expect(readPersistenceInfo(storage)).toEqual({ storageKey: STORAGE_KEY, version: STORE_VERSION, lastSavedAt: now.toISOString() });
  });

  it('falls back to seed data when the stored version is unsupported', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORE_VERSION + 1, state: {} }));
    expect(loadStoreState(storage).products).toEqual(createInitialStoreState().products);
  });

});
