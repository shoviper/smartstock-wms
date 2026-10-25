import { createContext, useContext, useEffect, useMemo, useReducer, useState, type PropsWithChildren } from 'react';
import { createSeedBusinessData } from '../data/seed';
import {
  adjustStock,
  receiveStock,
  StockActionError,
  type AdjustStockInput,
  type PickItemInput,
  type ReceiveStockInput,
} from '../domain/stock';
import type { StoreState, Theme, User } from '../domain/models';
import { InventoryActionError, updateReorderPoint as updateProductReorderPoint } from '../domain/inventory';
import { OrderActionError, startPicking as startOrderPicking } from '../domain/orders';
import { completeShortPick, confirmPicking, PickingActionError, type ShortPickInput } from '../domain/picking';
import { SettingsActionError, updateDefaultReorderPoint as updateAppDefaultReorderPoint } from '../domain/settings';
import { loadStoreState, persistStoreState, readPersistenceInfo, STORE_VERSION, STORAGE_KEY, type PersistenceInfo } from './persistence';

type StoreAction =
  | { type: 'stock/receive'; input: ReceiveStockInput }
  | { type: 'stock/pick'; input: PickItemInput }
  | { type: 'stock/adjust'; input: AdjustStockInput }
  | { type: 'orders/start-picking'; orderId: string; userId: string }
  | { type: 'orders/short-pick'; input: ShortPickInput }
  | { type: 'inventory/reorder-point'; sku: string; reorderPoint: number }
  | { type: 'settings/default-reorder-point'; value: number }
  | { type: 'session/login'; user: User }
  | { type: 'session/logout' }
  | { type: 'theme/set'; theme: Theme }
  | { type: 'theme/toggle' }
  | { type: 'demo/reset' }
  | { type: 'feedback/clear' };

function runStockAction(state: StoreState, operation: () => ReturnType<typeof receiveStock>): StoreState {
  try {
    const result = operation();
    return { ...result.state, feedback: { kind: 'success', message: result.message } };
  } catch (error) {
    const message = error instanceof StockActionError ? error.message : 'The stock action could not be completed.';
    return { ...state, feedback: { kind: 'error', message } };
  }
}

function runInventoryAction(state: StoreState, operation: () => StoreState): StoreState {
  try {
    return { ...operation(), feedback: { kind: 'success', message: 'Reorder point updated.' } };
  } catch (error) {
    const message = error instanceof InventoryActionError ? error.message : 'The inventory update could not be completed.';
    return { ...state, feedback: { kind: 'error', message } };
  }
}

function runOrderAction(state: StoreState, operation: () => StoreState): StoreState {
  try {
    return { ...operation(), feedback: { kind: 'success', message: 'Picking started.' } };
  } catch (error) {
    const message = error instanceof OrderActionError ? error.message : 'The order action could not be completed.';
    return { ...state, feedback: { kind: 'error', message } };
  }
}

function runPickingAction(state: StoreState, operation: () => ReturnType<typeof confirmPicking>): StoreState {
  try {
    const result = operation();
    return { ...result.state, feedback: { kind: 'success', message: result.message } };
  } catch (error) {
    const message = error instanceof PickingActionError || error instanceof StockActionError
      ? error.message
      : 'The picking action could not be completed.';
    return { ...state, feedback: { kind: 'error', message } };
  }
}

function runSettingsAction(state: StoreState, operation: () => StoreState): StoreState {
  try {
    return { ...operation(), feedback: { kind: 'success', message: 'Default reorder point updated.' } };
  } catch (error) {
    const message = error instanceof SettingsActionError ? error.message : 'The setting could not be updated.';
    return { ...state, feedback: { kind: 'error', message } };
  }
}

export function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'stock/receive':
      return runStockAction(state, () => receiveStock(state, action.input));
    case 'stock/pick':
      return runPickingAction(state, () => confirmPicking(state, action.input));
    case 'stock/adjust':
      return runStockAction(state, () => adjustStock(state, action.input));
    case 'orders/start-picking':
      return runOrderAction(state, () => startOrderPicking(state, action));
    case 'orders/short-pick':
      return runPickingAction(state, () => completeShortPick(state, action.input));
    case 'inventory/reorder-point':
      return runInventoryAction(state, () => updateProductReorderPoint(state, action.sku, action.reorderPoint));
    case 'settings/default-reorder-point':
      return runSettingsAction(state, () => updateAppDefaultReorderPoint(state, action.value));
    case 'session/login':
      return { ...state, currentUserId: action.user.id, session: action.user, feedback: null };
    case 'session/logout':
      return { ...state, currentUserId: null, session: null, feedback: null };
    case 'theme/set':
      return { ...state, theme: action.theme };
    case 'theme/toggle':
      return { ...state, theme: state.theme === 'light' ? 'dark' : 'light' };
    case 'demo/reset': {
      const seed = createSeedBusinessData();
      return {
        ...state,
        products: seed.products,
        locations: seed.locations,
        orders: seed.orders,
        movements: seed.movements,
        feedback: { kind: 'success', message: 'Demo business data has been reset.' },
      };
    }
    case 'feedback/clear':
      return { ...state, feedback: null };
  }
}

export interface StoreContextValue {
  state: StoreState;
  persistenceInfo: PersistenceInfo;
  receiveStock(input: ReceiveStockInput): void;
  pickItem(input: PickItemInput): void;
  shortPick(input: ShortPickInput): void;
  adjustStock(input: AdjustStockInput): void;
  startPicking(orderId: string): void;
  updateReorderPoint(sku: string, reorderPoint: number): void;
  updateDefaultReorderPoint(value: number): void;
  login(user: User): void;
  logout(): void;
  setTheme(theme: Theme): void;
  toggleTheme(): void;
  resetDemoData(): void;
  clearFeedback(): void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(storeReducer, undefined, loadStoreState);
  const [persistenceInfo, setPersistenceInfo] = useState(readPersistenceInfo);

  useEffect(() => {
    const savedAt = new Date();
    if (persistStoreState(state, undefined, savedAt)) {
      setPersistenceInfo({ storageKey: STORAGE_KEY, version: STORE_VERSION, lastSavedAt: savedAt.toISOString() });
    }
  }, [state]);

  const value = useMemo<StoreContextValue>(() => ({
    state,
    persistenceInfo,
    receiveStock: (input) => dispatch({ type: 'stock/receive', input }),
    pickItem: (input) => dispatch({ type: 'stock/pick', input }),
    shortPick: (input) => dispatch({ type: 'orders/short-pick', input }),
    adjustStock: (input) => dispatch({ type: 'stock/adjust', input }),
    startPicking: (orderId) => dispatch({ type: 'orders/start-picking', orderId, userId: state.session?.id ?? '' }),
    updateReorderPoint: (sku, reorderPoint) => dispatch({ type: 'inventory/reorder-point', sku, reorderPoint }),
    updateDefaultReorderPoint: (value) => dispatch({ type: 'settings/default-reorder-point', value }),
    login: (user) => dispatch({ type: 'session/login', user }),
    logout: () => dispatch({ type: 'session/logout' }),
    setTheme: (theme) => dispatch({ type: 'theme/set', theme }),
    toggleTheme: () => dispatch({ type: 'theme/toggle' }),
    resetDemoData: () => dispatch({ type: 'demo/reset' }),
    clearFeedback: () => dispatch({ type: 'feedback/clear' }),
  }), [state, persistenceInfo]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider.');
  return context;
}
