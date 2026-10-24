import { createSeedBusinessData } from '../data/seed';
import type { StoreState, Theme } from '../domain/models';

export const STORE_VERSION = 2;
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
    if ((envelope.version !== 1 && envelope.version !== STORE_VERSION) || !isPersistedState(envelope.state)) {
      return createInitialStoreState();
    }
    const seedData = createSeedBusinessData();
    const seedProducts = seedData.products;
    const products = Object.fromEntries(Object.entries(envelope.state.products).map(([sku, product]) => {
      const seedProduct = seedProducts[sku];
      if (!seedProduct) return [sku, product];
      const category = seedProduct.category;
      const unit = seedProduct.unit;
      return [sku, product.category !== category || product.unit !== unit || product.locationId !== seedProduct.locationId
        ? { ...product, category, unit, locationId: seedProduct.locationId }
        : product];
    }));
    const movements = envelope.state.movements.map((movement) => {
      const product = seedProducts[movement.sku];
      return product && movement.locationId !== product.locationId
        ? { ...movement, locationId: product.locationId }
        : movement;
    });
    const orders = Object.fromEntries(Object.entries(envelope.state.orders).map(([orderId, order]) => [
      orderId,
      {
        ...order,
        startedAt: order.startedAt ?? null,
        assignedTo: order.assignedTo ?? null,
      },
    ]));
    return {
      ...envelope.state,
      products,
      locations: seedData.locations,
      orders,
      movements,
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
