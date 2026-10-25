import { createSeedBusinessData } from '../data/seed';
import type { StoreState, Theme } from '../domain/models';
import { DEFAULT_REORDER_POINT } from '../domain/settings';

export const STORE_VERSION = 5;
export const STORAGE_KEY = 'smartstock-wms-store';

export interface PersistedStoreEnvelope {
  version: number;
  lastSavedAt: string;
  state: Pick<StoreState, 'products' | 'locations' | 'orders' | 'movements' | 'users' | 'currentUserId' | 'session' | 'theme' | 'settings'>;
}

export interface PersistenceInfo {
  storageKey: string;
  version: number | null;
  lastSavedAt: string | null;
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
    settings: { defaultReorderPoint: DEFAULT_REORDER_POINT },
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
    if (![1, 2, 3, 4, STORE_VERSION].includes(envelope.version ?? -1) || !isPersistedState(envelope.state)) {
      return createInitialStoreState();
    }
    const savedSettings = envelope.state.settings;
    const defaultReorderPoint = savedSettings && Number.isSafeInteger(savedSettings.defaultReorderPoint) && savedSettings.defaultReorderPoint >= 1
      ? savedSettings.defaultReorderPoint
      : DEFAULT_REORDER_POINT;
    return {
      ...envelope.state,
      settings: { defaultReorderPoint },
      session: envelope.state.session ?? null,
      feedback: null,
    };
  } catch {
    return createInitialStoreState();
  }
}

export function persistStoreState(state: StoreState, storage = getBrowserStorage(), now = new Date()): boolean {
  if (!storage) return false;
  const envelope: PersistedStoreEnvelope = {
    version: STORE_VERSION,
    lastSavedAt: now.toISOString(),
    state: {
      products: state.products,
      locations: state.locations,
      orders: state.orders,
      movements: state.movements,
      users: state.users,
      currentUserId: state.currentUserId,
      session: state.session,
      theme: state.theme as Theme,
      settings: state.settings,
    },
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function readPersistenceInfo(storage = getBrowserStorage()): PersistenceInfo {
  let version: number | null = null;
  let lastSavedAt: string | null = null;
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const envelope: unknown = JSON.parse(raw);
      if (envelope && typeof envelope === 'object') {
        const candidate = envelope as Record<string, unknown>;
        if (typeof candidate.version === 'number') version = candidate.version;
        if (typeof candidate.lastSavedAt === 'string' && Number.isFinite(Date.parse(candidate.lastSavedAt))) {
          lastSavedAt = candidate.lastSavedAt;
        }
      }
    }
  } catch {
    // Storage may be unavailable or contain an invalid envelope.
  }
  return { storageKey: STORAGE_KEY, version, lastSavedAt };
}
