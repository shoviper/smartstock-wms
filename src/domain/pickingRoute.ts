import type { Location, OrderLine } from './models';

export interface Point {
  x: number;
  y: number;
}

export interface OptimizedPickingRoute {
  sequence: OrderLine[];
  distanceMeters: number;
}

export interface PickingAisleBlock {
  id: string;
  zone: string;
  aisle: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DISPATCH_POINT: Point = { x: 0, y: 5 };

/** Layout geometry for occupied aisles only, preserving the existing 4d warehouse map. */
export function buildPickingAisleBlocks(
  locations: Record<string, Location>,
  occupiedLocationIds: ReadonlySet<string>,
): PickingAisleBlock[] {
  const aisles = new Map<string, Location[]>();
  Object.values(locations).filter((location) => occupiedLocationIds.has(location.id)).forEach((location) => {
    const id = `${location.zone}-${location.aisle}`;
    aisles.set(id, [...(aisles.get(id) ?? []), location]);
  });
  return [...aisles.entries()].map(([id, aisleLocations]) => {
    const xs = aisleLocations.map((location) => location.coordinates.x);
    const ys = aisleLocations.map((location) => location.coordinates.y);
    const left = Math.min(...xs) * 18 + 34;
    const top = Math.min(...ys) * 18 + 22;
    const right = Math.max(...xs) * 18 + 78;
    const bottom = Math.max(...ys) * 18 + 62;
    return { id, zone: aisleLocations[0].zone, aisle: aisleLocations[0].aisle, x: left, y: top, width: right - left, height: bottom - top };
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function manhattanDistance(from: Point, to: Point): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

function requireLocation(line: OrderLine, locations: Record<string, Location>): Location {
  const location = locations[line.sku];
  if (!location) throw new Error(`No route location is mapped for SKU ${line.sku}.`);
  return location;
}

/** Returns the Manhattan route length, including the dispatch-to-first and last-to-dispatch legs. */
export function walkingDistance(sequence: readonly OrderLine[], locations: Record<string, Location>): number {
  if (sequence.length === 0) return 0;
  let total = 0;
  let previous = DISPATCH_POINT;
  for (const line of sequence) {
    const current = requireLocation(line, locations).coordinates;
    total += manhattanDistance(previous, current);
    previous = current;
  }
  return total + manhattanDistance(previous, DISPATCH_POINT);
}

/** Nearest-neighbor route. Equal distances retain the original Order line order. */
export function optimizeRoute(lines: readonly OrderLine[], locations: Record<string, Location>): OptimizedPickingRoute {
  const remaining = lines.map((line, index) => ({ line, index, location: requireLocation(line, locations) }));
  const sequence: OrderLine[] = [];
  let current = DISPATCH_POINT;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = manhattanDistance(current, remaining[0].location.coordinates);
    for (let index = 1; index < remaining.length; index += 1) {
      const candidateDistance = manhattanDistance(current, remaining[index].location.coordinates);
      if (candidateDistance < nearestDistance
        || (candidateDistance === nearestDistance && remaining[index].index < remaining[nearestIndex].index)) {
        nearestIndex = index;
        nearestDistance = candidateDistance;
      }
    }
    const [next] = remaining.splice(nearestIndex, 1);
    sequence.push(next.line);
    current = next.location.coordinates;
  }

  return { sequence, distanceMeters: walkingDistance(sequence, locations) };
}
