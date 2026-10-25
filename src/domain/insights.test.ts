import { describe, expect, it } from 'vitest';
import type { Movement, Order, Product, StoreState } from './models';
import { buildManagerSummary, filterStockoutPredictions, recommendLocations, selectReslottingSuggestions, selectStockoutInsights } from './insights';
import type { Location } from './models';

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
    locations: {}, orders: {}, movements, users: {}, currentUserId: null, session: null, theme: 'light', settings: { defaultReorderPoint: 10 }, feedback: null,
  };
}

function prediction(state: StoreState, sku: string) {
  return selectStockoutInsights(state, now).predictions.find((row) => row.product.sku === sku)!;
}

function makeOrder(id: string, overrides: Partial<Order> = {}): Order {
  return {
    id, customer: `Customer ${id}`, createdAt: '2026-10-20T00:00:00.000Z', dueAt: '2026-10-26T12:00:00.000Z',
    priority: 'NORMAL', status: 'PENDING', lines: [], ...overrides,
  };
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

describe('buildManagerSummary', () => {
  it('reports Out stock with open order demand and merges multiple SKU conditions at highest severity', () => {
    const product = makeProduct('SKU-OUT', 0, 10, 12);
    const order = makeOrder('ORD-OUT', { lines: [{ sku: product.sku, qty: 4, pickedQty: 0 }] });
    const state = { ...stateFor([product], [movement(product.sku, 'PICK', 30)]), orders: { [order.id]: order } };
    const issues = buildManagerSummary(state, now).issues.filter((issue) => issue.entityId === product.sku);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'CRITICAL', href: '/inventory/SKU-OUT' });
    expect(issues[0].reason).toContain('4 units remain to pick');
    expect(issues[0].reason).toContain('PICK demand averages 1 unit/day');
  });

  it('creates issues for stock thresholds and prediction levels with the highest severity', () => {
    const products = [makeProduct('CRIT', 5, 10, 12), makeProduct('LOW', 10, 10, 12), makeProduct('HIGH-RISK', 4, 10, 12), makeProduct('AT-RISK', 25, 10, 12), makeProduct('WATCH', 20, 10, 12)];
    const movements = [movement('HIGH-RISK', 'PICK', 300), movement('AT-RISK', 'PICK', 96), movement('WATCH', 'PICK', 50)];
    const result = buildManagerSummary(stateFor(products, movements), now);
    expect(result.issues.find((issue) => issue.entityId === 'CRIT')?.severity).toBe('HIGH');
    expect(result.issues.find((issue) => issue.entityId === 'LOW')?.severity).toBe('MEDIUM');
    expect(result.issues.find((issue) => issue.entityId === 'HIGH-RISK')?.severity).toBe('CRITICAL');
    expect(result.issues.find((issue) => issue.entityId === 'AT-RISK')?.severity).toBe('MEDIUM');
    expect(result.issues.find((issue) => issue.entityId === 'WATCH')?.severity).toBe('MEDIUM');
    expect(result.issues.filter((issue) => issue.entityId === 'LOW')).toHaveLength(1);
  });

  it('counts overdue open Orders and Pending Orders due within 24 hours, excluding the boundary beyond and closed Orders', () => {
    const orders = [
      makeOrder('OVERDUE', { dueAt: new Date(now.getTime() - 1).toISOString() }),
      makeOrder('OVERDUE-IN-PROGRESS', { status: 'IN_PROGRESS', dueAt: new Date(now.getTime() - 2).toISOString() }),
      makeOrder('DUE-24H', { dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() }),
      makeOrder('AFTER-24H', { dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1).toISOString() }),
      makeOrder('INPROGRESS-SOON', { status: 'IN_PROGRESS', dueAt: new Date(now.getTime() + 1000).toISOString() }),
      makeOrder('COMPLETED-LATE', { status: 'COMPLETED', dueAt: '2026-10-24T00:00:00.000Z' }),
    ];
    const result = buildManagerSummary({ ...stateFor([]), orders: Object.fromEntries(orders.map((order) => [order.id, order])) }, now);
    expect(result.issues.find((issue) => issue.entityId === 'OVERDUE')?.severity).toBe('CRITICAL');
    expect(result.issues.find((issue) => issue.entityId === 'OVERDUE')?.reason).toContain('remains Pending');
    expect(result.issues.find((issue) => issue.entityId === 'OVERDUE-IN-PROGRESS')?.reason).toContain('remains In Progress');
    expect(result.issues.find((issue) => issue.entityId === 'DUE-24H')?.severity).toBe('HIGH');
    expect(result.issues.some((issue) => ['AFTER-24H', 'INPROGRESS-SOON', 'COMPLETED-LATE'].includes(issue.entityId))).toBe(false);
  });

  it('counts completed short Orders at exactly seven days, including zero short quantity, once per Order', () => {
    const shortOrder = makeOrder('SHORT-AT-CUTOFF', {
      status: 'COMPLETED_WITH_SHORTAGE', completedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      lines: [{ sku: 'A', qty: 1, pickedQty: 0, shortQty: 1 }, { sku: 'B', qty: 0, pickedQty: 0, shortQty: 2 }],
    });
    const result = buildManagerSummary({ ...stateFor([]), orders: { [shortOrder.id]: shortOrder } }, now);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ entityId: shortOrder.id, severity: 'HIGH' });
    expect(result.issues[0].reason).toContain('2 short lines in the last 7 days');
    expect(result.explanation).toContain('because the system does not record when the short occurred');
  });

  it('excludes short Orders older than seven days, without shorts, or not completed', () => {
    const orders = [
      makeOrder('OLD', { status: 'COMPLETED_WITH_SHORTAGE', completedAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1).toISOString(), lines: [{ sku: 'A', qty: 1, pickedQty: 0, shortQty: 1 }] }),
      makeOrder('NO-SHORT', { status: 'COMPLETED', completedAt: now.toISOString(), lines: [{ sku: 'A', qty: 1, pickedQty: 1, shortQty: 0 }] }),
      makeOrder('OPEN-SHORT', { status: 'IN_PROGRESS', completedAt: now.toISOString(), lines: [{ sku: 'A', qty: 1, pickedQty: 0, shortQty: 1 }] }),
    ];
    const result = buildManagerSummary({ ...stateFor([]), orders: Object.fromEntries(orders.map((order) => [order.id, order])) }, now);
    expect(result.issues).toEqual([]);
  });

  it('reports large ADJUST variance in the last seven days, not small or older adjustments', () => {
    const adjustment = (id: string, qtyBefore: number, qtyAfter: number, timestamp: string): Movement => ({ ...movement(id, 'ADJUST', qtyAfter - qtyBefore, timestamp), id, qtyBefore, qtyAfter });
    const state = stateFor([], [
      adjustment('LARGE', 20, 16, now.toISOString()),
      adjustment('SMALL', 20, 17, now.toISOString()),
      adjustment('OLD', 20, 0, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 - 1).toISOString()),
    ]);
    expect(buildManagerSummary(state, now).issues.map((issue) => issue.entityId)).toEqual(['LARGE']);
  });

  it('sorts by severity then rule priority, limits Do first to three and derives the summary count', () => {
    const orders = [makeOrder('DUE', { dueAt: new Date(now.getTime() + 1000).toISOString() }), makeOrder('LATE', { dueAt: new Date(now.getTime() - 1000).toISOString() })];
    const state = { ...stateFor([makeProduct('LOW', 10)]), orders: Object.fromEntries(orders.map((order) => [order.id, order])) };
    const result = buildManagerSummary(state, now);
    expect(result.issues.map((issue) => issue.entityId)).toEqual(['LATE', 'DUE', 'LOW']);
    expect(result.doFirst).toEqual(result.issues.slice(0, 3));
    expect(result.summaryText).toBe('3 issues need attention today: 1 critical, 1 high, and 1 medium.');
    expect(buildManagerSummary(stateFor([]), now).summaryText).toBe('No urgent issues need attention today.');
  });

  it('alternates product and Order issues within a severity and puts the longest-overdue Order first', () => {
    const products = [makeProduct('OUT-A', 0), makeProduct('OUT-B', 0)];
    const orders = [
      makeOrder('OVERDUE-NEWER', { dueAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() }),
      makeOrder('OVERDUE-OLDEST', { dueAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString() }),
    ];
    const state = { ...stateFor(products, products.map((product) => movement(product.sku, 'PICK', 30))), orders: Object.fromEntries(orders.map((order) => [order.id, order])) };
    const result = buildManagerSummary(state, now);
    expect(result.doFirst.map((issue) => issue.entityId)).toEqual(['OVERDUE-OLDEST', 'OUT-A', 'OVERDUE-NEWER']);
  });

  it('returns no issues for an empty store', () => {
    const result = buildManagerSummary(stateFor([]), now);
    expect(result.issues).toEqual([]);
    expect(result.doFirst).toEqual([]);
    expect(result.bySeverity).toEqual({ CRITICAL: [], HIGH: [], MEDIUM: [] });
  });
});

describe('storage location recommendations', () => {
  function location(id: string, zone: string, x: number, y: number, level = 1, capacity = 200): Location {
    return { id, zone, aisle: '03', rack: id, level, capacity, coordinates: { x, y }, dispatchDistanceMeters: 999 };
  }

  it('recommends only vacant positions with enough capacity and unique deterministic results', () => {
    const product = { ...makeProduct('SKU', 20, 2, 10), locationId: 'occupied' };
    const locations = [location('occupied', 'A', 1, 5), location('free-2', 'A', 2, 5), location('free-1', 'A', 3, 5), location('small', 'A', 4, 5, 1, 5)];
    const state = { ...stateFor([product], [movement('SKU', 'PICK', 60)]), locations: Object.fromEntries(locations.map((item) => [item.id, item])) };
    const rows = recommendLocations(product, state, now, 3);
    expect(rows.map((row) => row.location.id)).toEqual(['free-2', 'free-1']);
    expect(rows.every((row) => row.location.capacity >= 20)).toBe(true);
    expect(new Set(rows.map((row) => row.location.id)).size).toBe(rows.length);
    expect(rows[0].dispatchDistanceMeters).toBe(2);
    expect(rows[0].reason).toBe('Zone A matches the Test home zone. 2 m from dispatch at level 1 suits fast-moving stock. Capacity 200 covers the 20 units needed (on-hand plus suggested fill).');
    expect(rows[0].totalScore).toBe(Object.values(rows[0].factorScores).reduce((sum, score) => sum + score, 0));
  });

  it('favors a closer vacancy for a fast mover than for a slow mover', () => {
    const fast = makeProduct('FAST', 10, 1, 5);
    const slow = makeProduct('SLOW', 10, 1, 5);
    const slots = [location('near', 'A', 5, 5), location('far', 'A', 30, 5)];
    const state = {
      ...stateFor([fast, slow], [movement('FAST', 'PICK', 300), movement('SLOW', 'PICK', 1)]),
      locations: Object.fromEntries(slots.map((item) => [item.id, item])),
    };
    const fastRecommendation = recommendLocations(fast, state, now, 1)[0];
    const slowRecommendation = recommendLocations(slow, state, now, 1)[0];
    expect(fastRecommendation.location.id).toBe('near');
    expect(slowRecommendation.location.id).toBe('far');
  });

  it('uses the positive-demand 75th percentile and includes ties at the cutoff; no-demand SKUs are slow', () => {
    const products = [
      makeProduct('TOP', 10), makeProduct('TIE-A', 10), makeProduct('TIE-B', 10),
      makeProduct('SLOW', 10), makeProduct('NO-DEMAND', 10),
    ].map((product) => ({ ...product, locationId: `occupied-${product.sku}` }));
    const locations = [
      ...products.map((product, index) => location(product.locationId, 'A', 40 + index, 5)),
      location('near', 'A', 4, 5), location('far', 'A', 50, 5, 3),
    ];
    const state = {
      ...stateFor(products, [
        movement('TOP', 'PICK', 100), movement('TIE-A', 'PICK', 50), movement('TIE-B', 'PICK', 50), movement('SLOW', 'PICK', 1),
      ]),
      locations: Object.fromEntries(locations.map((item) => [item.id, item])),
    };
    expect(recommendLocations(products[1], state, now, 1)[0].location.id).toBe('near');
    expect(recommendLocations(products[2], state, now, 1)[0].location.id).toBe('near');
    expect(recommendLocations(products[3], state, now, 1)[0].location.id).toBe('far');
    expect(recommendLocations(products[4], state, now, 1)[0].location.id).toBe('far');
  });

  it('returns no recommendations when there are no empty positions', () => {
    const product = { ...makeProduct('SKU', 10), locationId: 'occupied' };
    const state = { ...stateFor([product]), locations: { occupied: location('occupied', 'A', 3, 5) } };
    expect(recommendLocations(product, state, now)).toEqual([]);
  });

  it('allocates each re-slotting vacancy to at most one SKU and resolves ties consistently', () => {
    const first = { ...makeProduct('SKU-A', 20), locationId: 'far-a' };
    const second = { ...makeProduct('SKU-B', 20), locationId: 'far-b' };
    const locations = [location('far-a', 'A', 48, 5), location('far-b', 'A', 48, 6), location('near-slot', 'A', 4, 5)];
    const state = {
      ...stateFor([first, second], [movement('SKU-A', 'PICK', 300), movement('SKU-B', 'PICK', 300)]),
      locations: Object.fromEntries(locations.map((item) => [item.id, item])),
    };
    const suggestions = selectReslottingSuggestions(state, now, 5);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].product.sku).toBe('SKU-A');
    expect(suggestions[0].recommendation.location.id).toBe('near-slot');
    expect(new Set(suggestions.map((row) => row.recommendation.location.id)).size).toBe(suggestions.length);
    expect(suggestions[0]).toMatchObject({ pickedUnits30Days: 300, currentDistanceMeters: 48, distanceChangeMeters: -44 });
    expect(suggestions[0].reason).toContain('300 PICK units in 30 days');
    expect(suggestions[0].reason).toContain('currently 48 m');
    expect(suggestions[0].reason).toContain('suggested slot is 4 m');
  });
});
