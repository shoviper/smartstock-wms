import { describe, expect, it } from 'vitest';
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

  it('falls back to seed data when the stored version is unsupported', () => {
    const storage = createMemoryStorage();
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: STORE_VERSION + 1, state: {} }));
    expect(loadStoreState(storage).products).toEqual(createInitialStoreState().products);
  });
});
