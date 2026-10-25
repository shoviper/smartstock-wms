import { createSeedBusinessData } from '../data/seed';
import type { StoreState, Theme } from '../domain/models';

export const STORE_VERSION = 4;
export const STORAGE_KEY = 'smartstock-wms-store';

export interface PersistedStoreEnvelope {
  version: number;
  state: Pick<StoreState, 'products' | 'locations' | 'orders' | 'movements' | 'users' | 'currentUserId' | 'session' | 'theme'>;
}

const validRoles = ['PICKER', 'RECEIVER', 'MANAGER', 'ADMIN'];

function isPersistedState(value: unknown): value is PersistedStoreEnvelope['state'] {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return Boolean(
    candidate.products && typeof candidate.products === 'object'
    && candidate.locations && typeof candidate.locations === 'object'
    && candidate.orders && typeof candidate.orders === 'object'
    && Array.isArray(candidate.movements)
    && candidate.users && typeof candidate.users === 'object'
    && (candidate.currentUserId === null || typeof candidate.currentUserId === 'string')
    && (candidate.session === undefined || candidate.session === null || (
      typeof candidate.session === 'object'
      && typeof (candidate.session as Record<string, unknown>).id === 'string'
      && typeof (candidate.session as Record<string, unknown>).name === 'string'
      && validRoles.includes((candidate.session as Record<string, unknown>).role as string)
    ))
    && (candidate.theme === 'light' || candidate.theme === 'dark'),
  );
}

export function createInitialStoreState(): StoreState {
  return {
    ...createSeedBusinessData(),
    currentUserId: null,
    session: null,
    theme: 'light',
    feedback: null,
  };
}

function getBrowserStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadStoreState(storage = getBrowserStorage()): StoreState {
  if (!storage) return createInitialStoreState();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createInitialStoreState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return createInitialStoreState();
    const envelope = parsed as Partial<PersistedStoreEnvelope>;
    if ((envelope.version !== 1 && envelope.version !== 2 && envelope.version !== 3 && envelope.version !== STORE_VERSION) || !isPersistedState(envelope.state)) {
      return createInitialStoreState();
    }
    const seedData = createSeedBusinessData();
    // Add newly seeded locations by ID only. A saved location with the same ID always wins.
    const locations = { ...seedData.locations, ...envelope.state.locations };
    return {
      ...envelope.state,
      locations,
      session: envelope.state.session ?? null,
      feedback: null,
    };
  } catch {
    return createInitialStoreState();
  }
}

export function persistStoreState(state: StoreState, storage = getBrowserStorage()): boolean {
  if (!storage) return false;
  const envelope: PersistedStoreEnvelope = {
    version: STORE_VERSION,
    state: {
      products: state.products,
      locations: state.locations,
      orders: state.orders,
      movements: state.movements,
      users: state.users,
      currentUserId: state.currentUserId,
      session: state.session,
      theme: state.theme as Theme,
    },
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}
