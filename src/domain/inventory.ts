import type { Product, StockStatus, StoreState } from './models';

export function getStockStatus(product: Product): StockStatus {
  if (product.onHand === 0) return 'OUT';
  if (product.onHand <= product.reorderPoint * 0.5) return 'CRITICAL';
  if (product.onHand <= product.reorderPoint) return 'LOW';
  return 'NORMAL';
}

export function selectProductsByStatus(state: StoreState, status: StockStatus): Product[] {
  return Object.values(state.products).filter((product) => getStockStatus(product) === status);
}
