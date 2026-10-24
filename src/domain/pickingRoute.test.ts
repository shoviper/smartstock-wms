import { describe, expect, it } from 'vitest';
import type { Location, OrderLine } from './models';
import { DISPATCH_POINT, optimizeRoute, walkingDistance } from './pickingRoute';

function line(sku: string): OrderLine {
  return { sku, qty: 1, pickedQty: 0 };
}

function locationsFor(points: Record<string, { x: number; y: number }>): Record<string, Location> {
  return Object.fromEntries(Object.entries(points).map(([sku, coordinates]) => [sku, {
    id: `${sku}-location`, zone: 'A', aisle: '01', rack: '01', level: 1, capacity: 10,
    coordinates, dispatchDistanceMeters: 999,
  }]));
}

describe('picking route', () => {
  it('calculates Manhattan distance between stops and from/to the dispatch point', () => {
    const routeLocations = locationsFor({ A: { x: 2, y: 8 }, B: { x: 6, y: 8 } });
    expect(DISPATCH_POINT).toEqual({ x: 0, y: 5 });
    expect(walkingDistance([line('A'), line('B')], routeLocations)).toBe(18);
  });

  it('handles an Order with one line', () => {
    expect(walkingDistance([line('A')], locationsFor({ A: { x: 3, y: 5 } }))).toBe(6);
  });

  it('keeps multiple lines at the same location and counts no extra distance between them', () => {
    const first = line('A');
    const second = line('B');
    const routeLocations = locationsFor({ A: { x: 2, y: 7 }, B: { x: 2, y: 7 } });
    const result = optimizeRoute([first, second], routeLocations);
    expect(result.sequence).toEqual([first, second]);
    expect(result.distanceMeters).toBe(8);
  });

  it('retains every input line exactly once and resolves nearest-neighbor ties by original Order index', () => {
    const first = line('LEFT');
    const second = line('RIGHT');
    const third = line('NEAR');
    const lines = [first, second, third];
    const result = optimizeRoute(lines, locationsFor({ LEFT: { x: -1, y: 5 }, RIGHT: { x: 1, y: 5 }, NEAR: { x: 0, y: 6 } }));
    expect(result.sequence[0]).toBe(first);
    expect(result.sequence).toHaveLength(lines.length);
    expect(new Set(result.sequence).size).toBe(lines.length);
    expect(new Set(result.sequence)).toEqual(new Set(lines));
  });

  it('does not make a specified baseline route longer for the sample case', () => {
    const lines = [line('FAR'), line('NEAR'), line('NEXT')];
    const routeLocations = locationsFor({ FAR: { x: 10, y: 5 }, NEAR: { x: 1, y: 5 }, NEXT: { x: 2, y: 5 } });
    const baseline = walkingDistance(lines, routeLocations);
    const optimized = optimizeRoute(lines, routeLocations);
    expect(baseline).toBe(22);
    expect(optimized.distanceMeters).toBe(20);
    expect(optimized.distanceMeters).toBeLessThanOrEqual(baseline);
  });
});
