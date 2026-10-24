import { createContext, useContext, useEffect, useMemo, useReducer, type PropsWithChildren } from 'react';
import { createSeedBusinessData } from '../data/seed';
import {
  adjustStock,
  pickItem,
  receiveStock,
  StockActionError,
  type AdjustStockInput,
  type PickItemInput,
  type ReceiveStockInput,
} from '../domain/stock';
import type { StoreState, Theme, User } from '../domain/models';
import { loadStoreState, persistStoreState } from './persistence';

type StoreAction =
  | { type: 'stock/receive'; input: ReceiveStockInput }
  | { type: 'stock/pick'; input: PickItemInput }
  | { type: 'stock/adjust'; input: AdjustStockInput }
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

export function storeReducer(state: StoreState, action: StoreAction): StoreState {
  switch (action.type) {
    case 'stock/receive':
      return runStockAction(state, () => receiveStock(state, action.input));
    case 'stock/pick':
      return runStockAction(state, () => pickItem(state, action.input));
    case 'stock/adjust':
      return runStockAction(state, () => adjustStock(state, action.input));
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
  receiveStock(input: ReceiveStockInput): void;
  pickItem(input: PickItemInput): void;
  adjustStock(input: AdjustStockInput): void;
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

  useEffect(() => {
    persistStoreState(state);
  }, [state]);

  const value = useMemo<StoreContextValue>(() => ({
    state,
    receiveStock: (input) => dispatch({ type: 'stock/receive', input }),
    pickItem: (input) => dispatch({ type: 'stock/pick', input }),
    adjustStock: (input) => dispatch({ type: 'stock/adjust', input }),
    login: (user) => dispatch({ type: 'session/login', user }),
    logout: () => dispatch({ type: 'session/logout' }),
    setTheme: (theme) => dispatch({ type: 'theme/set', theme }),
    toggleTheme: () => dispatch({ type: 'theme/toggle' }),
    resetDemoData: () => dispatch({ type: 'demo/reset' }),
    clearFeedback: () => dispatch({ type: 'feedback/clear' }),
  }), [state]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider.');
  return context;
}
