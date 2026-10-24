import { describe, expect, it } from 'vitest';
import type { Movement, Product, StoreState } from './models';
import { filterStockoutPredictions, selectStockoutInsights } from './insights';

const now = new Date('2026-10-25T12:00:00.000Z');

function makeProduct(sku: string, onHand: number, leadTimeDays = 10, reorderPoint = 12): Product {
  return { sku, name: `Product ${sku}`, category: 'Test', unit: 'each', locationId: 'A-01-01-1', onHand, leadTimeDays, reorderPoint };
}

function movement(sku: string, type: Movement['type'], qty: number, timestamp = '2026-10-10T12:00:00.000Z'): Movement {
  return { id: `${sku}-${type}-${qty}-${timestamp}`, timestamp, type, sku, qty, qtyBefore: 100, qtyAfter: 100 - qty, locationId: 'A-01-01-1', userId: 'user-picker-01', reference: null, reason: 'test' };
}

function stateFor(products: Product[], movements: Movement[] = []): StoreState {
  return {
    products: Object.fromEntries(products.map((product) => [product.sku, product])),
    locations: {}, orders: {}, movements, users: {}, currentUserId: null, session: null, theme: 'light', feedback: null,
  };
}

function prediction(state: StoreState, sku: string) {
  return selectStockoutInsights(state, now).predictions.find((row) => row.product.sku === sku)!;
}

describe('selectStockoutInsights', () => {
  it('classifies each risk boundary using strict less-than comparisons', () => {
    const products = [
      makeProduct('HIGH', 49),
      makeProduct('AT-RISK', 50),
      makeProduct('WATCH', 100),
      makeProduct('OK', 150),
    ];
    const movements = products.map((product) => movement(product.sku, 'PICK', 300));
    const result = selectStockoutInsights(stateFor(products, movements), now);
    expect(Object.fromEntries(result.predictions.map((row) => [row.product.sku, row.risk]))).toEqual({
      HIGH: 'HIGH', 'AT-RISK': 'AT_RISK', WATCH: 'WATCH', OK: 'OK',
    });
  });

  it('distinguishes stocked out with demand from no recent demand', () => {
    const state = stateFor([makeProduct('OUT', 0), makeProduct('NO-DEMAND', 3)], [movement('OUT', 'PICK', 10)]);
    expect(prediction(state, 'OUT').risk).toBe('STOCKED_OUT');
    expect(prediction(state, 'OUT').reason).toBe('On-hand is 0 while PICK demand averages 0.33 units/day over 30 days.');
    expect(prediction(state, 'NO-DEMAND').risk).toBe('NO_RECENT_DEMAND');
    expect(prediction(state, 'NO-DEMAND').reason).toContain('below the reorder point');
  });

  it('uses singular unit/day when the average daily demand is exactly one', () => {
    const row = prediction(stateFor([makeProduct('SKU', 0)], [movement('SKU', 'PICK', 30)]), 'SKU');
    expect(row.reason).toBe('On-hand is 0 while PICK demand averages 1 unit/day over 30 days.');
  });

  it('counts only PICK movements within the inclusive trailing 30-day window', () => {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const state = stateFor([makeProduct('SKU', 30)], [
      movement('SKU', 'PICK', -10, cutoff),
      movement('SKU', 'PICK', -20, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000 - 1).toISOString()),
      movement('SKU', 'PICK', -25, new Date(now.getTime() + 1).toISOString()),
      movement('SKU', 'RECEIVE', 40),
      movement('SKU', 'ADJUST', -50),
    ]);
    expect(prediction(state, 'SKU')).toMatchObject({ pickedUnits30Days: 10, averageDailyUse: 10 / 30 });
  });

  it('rounds suggested replenishment up to a whole unit', () => {
    const row = prediction(stateFor([makeProduct('SKU', 8, 11, 10)], [movement('SKU', 'PICK', -48)]), 'SKU');
    expect(row.recommendedReplenishment).toBe(20);
    expect(row.suggestedAction).toBe('Suggested fill: 20 each');
    expect(row.calculation).toContain('= 20.00 units.');
  });

  it('builds reason and calculation text from the computed values', () => {
    const row = prediction(stateFor([makeProduct('SKU', 8, 11, 10)], [movement('SKU', 'PICK', -48)]), 'SKU');
    expect(row.reason).toBe('On-hand 8 covers about 5.00 days at 1.60 units/day, shorter than half of the 11-day lead time.');
    expect(row.calculation).toContain('48.00 / 30.00 = 1.60 units/day');
    expect(row.calculation).toContain('8.00 / (48.00 / 30.00) = 5.00 days');
    expect(row.calculation).toContain('8.00 / (48.00 / 30.00) = 5.00 days < 11.00 × 0.50 = 5.50 days, so High.');
    expect(row.calculation).toContain('10.00 + (48.00 / 30.00) × 11.00 − 8.00');
    expect(row.calculation).toContain('= 20.00 units.');
  });

  it('keeps outputs finite for malformed demand and product values', () => {
    const state = stateFor([makeProduct('SKU', Number.POSITIVE_INFINITY, Number.NaN, Number.NaN)], [
      movement('SKU', 'PICK', Number.POSITIVE_INFINITY),
      movement('SKU', 'PICK', 5, 'not-a-date'),
    ]);
    const row = prediction(state, 'SKU');
    expect(row.daysOfSupply).toBeNull();
    expect(row.recommendedReplenishment).toBe(0);
    expect([row.pickedUnits30Days, row.averageDailyUse, row.recommendedReplenishment].every(Number.isFinite)).toBe(true);
  });

  it('sorts by risk then days of supply and filters chip selections', () => {
    const state = stateFor([
      makeProduct('LATER', 70), makeProduct('SOONER', 50), makeProduct('HIGH', 49),
    ], [movement('LATER', 'PICK', 300), movement('SOONER', 'PICK', 300), movement('HIGH', 'PICK', 300)]);
    const rows = selectStockoutInsights(state, now).predictions;
    expect(rows.map((row) => row.product.sku)).toEqual(['HIGH', 'SOONER', 'LATER']);
    expect(filterStockoutPredictions(rows, 'AT_RISK').map((row) => row.product.sku)).toEqual(['SOONER', 'LATER']);
  });

  it('returns zero counts and an empty list for an empty store', () => {
    const result = selectStockoutInsights(stateFor([]), now);
    expect(result.predictions).toEqual([]);
    expect(Object.values(result.riskCounts).every((count) => count === 0)).toBe(true);
  });
});
