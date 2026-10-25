import { describe, expect, it } from 'vitest';
import { seedBusinessData } from './seed';

const expectedCategories = [
  ['SKU-001', 'Carton box', 'Packaging'],
  ['SKU-002', 'Bubble wrap roll', 'Packaging'],
  ['SKU-003', 'Packing tape', 'Packaging'],
  ['SKU-004', 'Shipping label', 'Packaging'],
  ['SKU-005', 'Stretch film', 'Packaging'],
  ['SKU-006', 'USB keyboard', 'Electronics'],
  ['SKU-007', 'Wireless mouse', 'Electronics'],
  ['SKU-008', 'Power adapter', 'Electronics'],
  ['SKU-009', 'Ethernet cable', 'Electronics'],
  ['SKU-010', 'Barcode label roll', 'Office'],
  ['SKU-011', 'Floor cleaner', 'Cleaning'],
  ['SKU-012', 'Hand soap', 'Cleaning'],
  ['SKU-013', 'Microfiber cloth', 'Cleaning'],
  ['SKU-014', 'Trash liner', 'Cleaning'],
  ['SKU-015', 'Sanitizer bottle', 'Cleaning'],
  ['SKU-016', 'Hex bolt set', 'Hardware'],
  ['SKU-017', 'Cable tie pack', 'Hardware'],
  ['SKU-018', 'Utility blade', 'Hardware'],
  ['SKU-019', 'Work gloves', 'Safety'],
  ['SKU-020', 'Tool bit set', 'Hardware'],
  ['SKU-021', 'Copy paper', 'Office'],
  ['SKU-022', 'Marker pen', 'Office'],
  ['SKU-023', 'Document sleeve', 'Office'],
  ['SKU-024', 'Thermal paper roll', 'Office'],
  ['SKU-025', 'Clipboard', 'Office'],
  ['SKU-026', 'Safety glasses', 'Safety'],
  ['SKU-027', 'Reflective vest', 'Safety'],
  ['SKU-028', 'Dust mask', 'Safety'],
  ['SKU-029', 'Ear plugs', 'Safety'],
  ['SKU-030', 'First aid refill', 'Safety'],
  ['SKU-031', 'Foam insert', 'Packaging'],
  ['SKU-032', 'Corner protector', 'Packaging'],
  ['SKU-033', 'Pallet wrap', 'Packaging'],
  ['SKU-034', 'Mailing envelope', 'Packaging'],
  ['SKU-035', 'Foam pouch', 'Packaging'],
  ['SKU-036', 'Laptop stand', 'Electronics'],
  ['SKU-037', 'HDMI cable', 'Electronics'],
  ['SKU-038', 'Power strip', 'Electronics'],
  ['SKU-039', 'Cleaning brush', 'Cleaning'],
  ['SKU-040', 'Storage tote', 'Hardware'],
] as const;

const allowedCategories = new Set(['Packaging', 'Electronics', 'Cleaning', 'Hardware', 'Office', 'Safety']);

describe('seed product categories', () => {
  it('assigns every SKU to its specified product category in the six-category list', () => {
    expect(Object.keys(seedBusinessData.products)).toHaveLength(expectedCategories.length);

    for (const [sku, name, category] of expectedCategories) {
      expect(allowedCategories.has(category)).toBe(true);
      expect(seedBusinessData.products[sku]).toMatchObject({ sku, name, category });
    }
  });
});

describe('seed locations', () => {
  const products = Object.values(seedBusinessData.products);
  const locations = Object.values(seedBusinessData.locations);

  it('assigns every SKU a unique location that exists in the Location list', () => {
    expect(locations).toHaveLength(56);
    expect(new Set(locations.map((location) => location.id)).size).toBe(56);
    expect(new Set(products.map((product) => product.locationId)).size).toBe(products.length);
    for (const product of products) {
      expect(seedBusinessData.locations[product.locationId]).toBeDefined();
    }
  });

  it('adds exactly 16 vacant slots without assigning any SKU to them', () => {
    const occupied = new Set(products.map((product) => product.locationId));
    const vacant = locations.filter((location) => !occupied.has(location.id));
    expect(vacant).toHaveLength(16);
    expect(new Set(vacant.map((location) => location.zone))).toEqual(new Set(['A', 'B', 'C', 'D']));
    for (const location of vacant) {
      expect(Math.abs(location.coordinates.x) + Math.abs(location.coordinates.y - 5)).toBe(location.dispatchDistanceMeters);
    }
  });

  it('keeps every SKU on-hand quantity within its location capacity', () => {
    for (const product of products) {
      expect(product.onHand).toBeLessThanOrEqual(seedBusinessData.locations[product.locationId].capacity);
    }
  });

  it('places every Movement at the current location of its SKU', () => {
    for (const movement of seedBusinessData.movements) {
      expect(movement.locationId).toBe(seedBusinessData.products[movement.sku].locationId);
    }
  });

  it('keeps each category within at most two adjacent zones', () => {
    const zonesByCategory = new Map<string, Set<string>>();
    for (const product of products) {
      const zones = zonesByCategory.get(product.category) ?? new Set<string>();
      zones.add(seedBusinessData.locations[product.locationId].zone);
      zonesByCategory.set(product.category, zones);
    }

    for (const zones of zonesByCategory.values()) {
      const ordered = [...zones].sort();
      expect(ordered.length).toBeLessThanOrEqual(2);
      if (ordered.length === 2) {
        expect(ordered[1].charCodeAt(0) - ordered[0].charCodeAt(0)).toBe(1);
      }
    }
  });

  it('keeps the designated fast-pick SKUs close to dispatch and on easy-pick levels', () => {
    const picksBySku = new Map<string, number>();
    for (const movement of seedBusinessData.movements) {
      if (movement.type === 'PICK') {
        picksBySku.set(movement.sku, (picksBySku.get(movement.sku) ?? 0) + Math.abs(movement.qty));
      }
    }
    const fastPickedSkus = ['SKU-001', 'SKU-002', 'SKU-003'];
    const fastPicked = products.filter((product) => fastPickedSkus.includes(product.sku));
    expect(fastPicked.map((product) => product.sku).sort()).toEqual(fastPickedSkus);
    for (const product of fastPicked) {
      expect(picksBySku.get(product.sku) ?? 0).toBeGreaterThanOrEqual(10);
      const location = seedBusinessData.locations[product.locationId];
      expect(location.dispatchDistanceMeters).toBeLessThanOrEqual(15);
      expect(location.level).toBeLessThanOrEqual(2);
    }
  });
});
