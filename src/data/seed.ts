import type {
  BusinessData,
  Location,
  Movement,
  Order,
  Product,
  User,
} from '../domain/models';

const locationRows: Location[] = [
  { id: 'A-01-01-1', zone: 'A', aisle: '01', rack: '01', level: 1, capacity: 120, coordinates: { x: 8, y: 4 }, dispatchDistanceMeters: 9 },
  { id: 'A-01-02-1', zone: 'A', aisle: '01', rack: '02', level: 1, capacity: 100, coordinates: { x: 8, y: 8 }, dispatchDistanceMeters: 11 },
  { id: 'A-01-03-1', zone: 'A', aisle: '01', rack: '03', level: 1, capacity: 100, coordinates: { x: 8, y: 12 }, dispatchDistanceMeters: 14 },
  { id: 'A-02-01-2', zone: 'A', aisle: '02', rack: '01', level: 2, capacity: 100, coordinates: { x: 12, y: 4 }, dispatchDistanceMeters: 13 },
  { id: 'A-02-02-2', zone: 'A', aisle: '02', rack: '02', level: 2, capacity: 100, coordinates: { x: 12, y: 8 }, dispatchDistanceMeters: 14 },
  { id: 'A-02-03-2', zone: 'A', aisle: '02', rack: '03', level: 2, capacity: 100, coordinates: { x: 12, y: 12 }, dispatchDistanceMeters: 17 },
  { id: 'A-01-04-3', zone: 'A', aisle: '01', rack: '04', level: 3, capacity: 150, coordinates: { x: 8, y: 16 }, dispatchDistanceMeters: 18 },
  { id: 'A-02-04-3', zone: 'A', aisle: '02', rack: '04', level: 3, capacity: 150, coordinates: { x: 12, y: 16 }, dispatchDistanceMeters: 20 },
  { id: 'A-01-05-1', zone: 'A', aisle: '01', rack: '05', level: 1, capacity: 120, coordinates: { x: 8, y: 20 }, dispatchDistanceMeters: 22 },
  { id: 'A-02-05-2', zone: 'A', aisle: '02', rack: '05', level: 2, capacity: 120, coordinates: { x: 12, y: 20 }, dispatchDistanceMeters: 23 },
  { id: 'B-01-01-1', zone: 'B', aisle: '01', rack: '01', level: 1, capacity: 120, coordinates: { x: 20, y: 4 }, dispatchDistanceMeters: 20 },
  { id: 'B-01-02-1', zone: 'B', aisle: '01', rack: '02', level: 1, capacity: 100, coordinates: { x: 20, y: 8 }, dispatchDistanceMeters: 22 },
  { id: 'B-02-01-2', zone: 'B', aisle: '02', rack: '01', level: 2, capacity: 100, coordinates: { x: 24, y: 4 }, dispatchDistanceMeters: 24 },
  { id: 'B-02-02-2', zone: 'B', aisle: '02', rack: '02', level: 2, capacity: 100, coordinates: { x: 24, y: 8 }, dispatchDistanceMeters: 25 },
  { id: 'B-01-03-1', zone: 'B', aisle: '01', rack: '03', level: 1, capacity: 120, coordinates: { x: 20, y: 12 }, dispatchDistanceMeters: 23 },
  { id: 'B-02-03-2', zone: 'B', aisle: '02', rack: '03', level: 2, capacity: 100, coordinates: { x: 24, y: 12 }, dispatchDistanceMeters: 27 },
  { id: 'B-01-04-1', zone: 'B', aisle: '01', rack: '04', level: 1, capacity: 120, coordinates: { x: 20, y: 16 }, dispatchDistanceMeters: 26 },
  { id: 'B-02-04-2', zone: 'B', aisle: '02', rack: '04', level: 2, capacity: 120, coordinates: { x: 24, y: 16 }, dispatchDistanceMeters: 29 },
  { id: 'B-01-05-1', zone: 'B', aisle: '01', rack: '05', level: 1, capacity: 120, coordinates: { x: 20, y: 20 }, dispatchDistanceMeters: 28 },
  { id: 'B-02-05-2', zone: 'B', aisle: '02', rack: '05', level: 2, capacity: 120, coordinates: { x: 24, y: 20 }, dispatchDistanceMeters: 31 },
  { id: 'C-01-01-1', zone: 'C', aisle: '01', rack: '01', level: 1, capacity: 120, coordinates: { x: 32, y: 4 }, dispatchDistanceMeters: 32 },
  { id: 'C-01-02-1', zone: 'C', aisle: '01', rack: '02', level: 1, capacity: 100, coordinates: { x: 32, y: 8 }, dispatchDistanceMeters: 33 },
  { id: 'C-02-01-2', zone: 'C', aisle: '02', rack: '01', level: 2, capacity: 100, coordinates: { x: 36, y: 4 }, dispatchDistanceMeters: 36 },
  { id: 'C-02-02-2', zone: 'C', aisle: '02', rack: '02', level: 2, capacity: 100, coordinates: { x: 36, y: 8 }, dispatchDistanceMeters: 37 },
  { id: 'C-01-03-3', zone: 'C', aisle: '01', rack: '03', level: 3, capacity: 150, coordinates: { x: 32, y: 12 }, dispatchDistanceMeters: 34 },
  { id: 'C-02-03-3', zone: 'C', aisle: '02', rack: '03', level: 3, capacity: 150, coordinates: { x: 36, y: 12 }, dispatchDistanceMeters: 38 },
  { id: 'C-01-04-1', zone: 'C', aisle: '01', rack: '04', level: 1, capacity: 120, coordinates: { x: 32, y: 16 }, dispatchDistanceMeters: 36 },
  { id: 'C-02-04-2', zone: 'C', aisle: '02', rack: '04', level: 2, capacity: 120, coordinates: { x: 36, y: 16 }, dispatchDistanceMeters: 39 },
  { id: 'C-01-05-3', zone: 'C', aisle: '01', rack: '05', level: 3, capacity: 150, coordinates: { x: 32, y: 20 }, dispatchDistanceMeters: 38 },
  { id: 'C-02-05-1', zone: 'C', aisle: '02', rack: '05', level: 1, capacity: 120, coordinates: { x: 36, y: 20 }, dispatchDistanceMeters: 41 },
  { id: 'D-01-01-1', zone: 'D', aisle: '01', rack: '01', level: 1, capacity: 120, coordinates: { x: 44, y: 4 }, dispatchDistanceMeters: 44 },
  { id: 'D-01-02-2', zone: 'D', aisle: '01', rack: '02', level: 2, capacity: 100, coordinates: { x: 44, y: 8 }, dispatchDistanceMeters: 45 },
  { id: 'D-02-01-2', zone: 'D', aisle: '02', rack: '01', level: 2, capacity: 120, coordinates: { x: 48, y: 4 }, dispatchDistanceMeters: 48 },
  { id: 'D-02-02-3', zone: 'D', aisle: '02', rack: '02', level: 3, capacity: 150, coordinates: { x: 48, y: 8 }, dispatchDistanceMeters: 49 },
  { id: 'D-01-03-1', zone: 'D', aisle: '01', rack: '03', level: 1, capacity: 120, coordinates: { x: 44, y: 12 }, dispatchDistanceMeters: 46 },
  { id: 'D-02-03-2', zone: 'D', aisle: '02', rack: '03', level: 2, capacity: 100, coordinates: { x: 48, y: 12 }, dispatchDistanceMeters: 49 },
  { id: 'D-01-04-3', zone: 'D', aisle: '01', rack: '04', level: 3, capacity: 150, coordinates: { x: 44, y: 16 }, dispatchDistanceMeters: 47 },
  { id: 'D-02-04-3', zone: 'D', aisle: '02', rack: '04', level: 3, capacity: 150, coordinates: { x: 48, y: 16 }, dispatchDistanceMeters: 51 },
  { id: 'D-01-05-1', zone: 'D', aisle: '01', rack: '05', level: 1, capacity: 120, coordinates: { x: 44, y: 20 }, dispatchDistanceMeters: 48 },
  { id: 'D-02-05-2', zone: 'D', aisle: '02', rack: '05', level: 2, capacity: 120, coordinates: { x: 48, y: 20 }, dispatchDistanceMeters: 52 },
];

const locations = locationRows;

const productLocationBySku: Record<string, string> = {
  'SKU-001': 'A-01-01-1', 'SKU-002': 'A-01-02-1', 'SKU-003': 'A-01-03-1',
  'SKU-004': 'A-02-01-2', 'SKU-005': 'A-02-02-2',
  'SKU-006': 'B-01-01-1', 'SKU-007': 'B-01-02-1', 'SKU-008': 'B-02-01-2', 'SKU-009': 'B-02-02-2',
  'SKU-010': 'C-01-04-1',
  'SKU-011': 'B-01-03-1', 'SKU-012': 'B-02-03-2', 'SKU-013': 'B-01-04-1', 'SKU-014': 'B-02-04-2', 'SKU-015': 'B-01-05-1',
  'SKU-016': 'C-01-01-1', 'SKU-017': 'C-01-02-1', 'SKU-018': 'C-02-01-2', 'SKU-020': 'C-02-02-2',
  'SKU-019': 'D-01-01-1', 'SKU-021': 'C-02-03-3', 'SKU-022': 'C-01-03-3', 'SKU-023': 'D-01-02-2', 'SKU-024': 'D-02-01-2',
  'SKU-025': 'D-02-02-3',
  'SKU-026': 'D-01-03-1', 'SKU-027': 'D-02-03-2', 'SKU-028': 'D-01-04-3', 'SKU-029': 'D-02-04-3', 'SKU-030': 'D-01-05-1',
  'SKU-031': 'A-01-04-3', 'SKU-032': 'A-02-03-2', 'SKU-033': 'A-02-04-3', 'SKU-034': 'A-01-05-1', 'SKU-035': 'A-02-05-2',
  'SKU-036': 'C-02-04-2', 'SKU-037': 'C-01-05-3', 'SKU-038': 'C-02-05-1',
  'SKU-039': 'B-02-05-2', 'SKU-040': 'D-02-05-2',
};

const productCatalog: Omit<Product, 'locationId' | 'onHand' | 'reorderPoint' | 'leadTimeDays'>[] = [
  { sku: 'SKU-001', name: 'Carton box', category: 'Packaging', unit: 'each' },
  { sku: 'SKU-002', name: 'Bubble wrap roll', category: 'Packaging', unit: 'roll' },
  { sku: 'SKU-003', name: 'Packing tape', category: 'Packaging', unit: 'roll' },
  { sku: 'SKU-004', name: 'Shipping label', category: 'Packaging', unit: 'roll' },
  { sku: 'SKU-005', name: 'Stretch film', category: 'Packaging', unit: 'roll' },
  { sku: 'SKU-006', name: 'USB keyboard', category: 'Electronics', unit: 'each' },
  { sku: 'SKU-007', name: 'Wireless mouse', category: 'Electronics', unit: 'each' },
  { sku: 'SKU-008', name: 'Power adapter', category: 'Electronics', unit: 'each' },
  { sku: 'SKU-009', name: 'Ethernet cable', category: 'Electronics', unit: 'each' },
  { sku: 'SKU-010', name: 'Barcode label roll', category: 'Office', unit: 'roll' },
  { sku: 'SKU-011', name: 'Floor cleaner', category: 'Cleaning', unit: 'bottle' },
  { sku: 'SKU-012', name: 'Hand soap', category: 'Cleaning', unit: 'bottle' },
  { sku: 'SKU-013', name: 'Microfiber cloth', category: 'Cleaning', unit: 'each' },
  { sku: 'SKU-014', name: 'Trash liner', category: 'Cleaning', unit: 'roll' },
  { sku: 'SKU-015', name: 'Sanitizer bottle', category: 'Cleaning', unit: 'bottle' },
  { sku: 'SKU-016', name: 'Hex bolt set', category: 'Hardware', unit: 'set' },
  { sku: 'SKU-017', name: 'Cable tie pack', category: 'Hardware', unit: 'pack' },
  { sku: 'SKU-018', name: 'Utility blade', category: 'Hardware', unit: 'each' },
  { sku: 'SKU-019', name: 'Work gloves', category: 'Safety', unit: 'pair' },
  { sku: 'SKU-020', name: 'Tool bit set', category: 'Hardware', unit: 'set' },
  { sku: 'SKU-021', name: 'Copy paper', category: 'Office', unit: 'ream' },
  { sku: 'SKU-022', name: 'Marker pen', category: 'Office', unit: 'each' },
  { sku: 'SKU-023', name: 'Document sleeve', category: 'Office', unit: 'each' },
  { sku: 'SKU-024', name: 'Thermal paper roll', category: 'Office', unit: 'roll' },
  { sku: 'SKU-025', name: 'Clipboard', category: 'Office', unit: 'each' },
  { sku: 'SKU-026', name: 'Safety glasses', category: 'Safety', unit: 'each' },
  { sku: 'SKU-027', name: 'Reflective vest', category: 'Safety', unit: 'each' },
  { sku: 'SKU-028', name: 'Dust mask', category: 'Safety', unit: 'each' },
  { sku: 'SKU-029', name: 'Ear plugs', category: 'Safety', unit: 'pair' },
  { sku: 'SKU-030', name: 'First aid refill', category: 'Safety', unit: 'pack' },
  { sku: 'SKU-031', name: 'Foam insert', category: 'Packaging', unit: 'each' },
  { sku: 'SKU-032', name: 'Corner protector', category: 'Packaging', unit: 'each' },
  { sku: 'SKU-033', name: 'Pallet wrap', category: 'Packaging', unit: 'roll' },
  { sku: 'SKU-034', name: 'Mailing envelope', category: 'Packaging', unit: 'each' },
  { sku: 'SKU-035', name: 'Foam pouch', category: 'Packaging', unit: 'each' },
  { sku: 'SKU-036', name: 'Laptop stand', category: 'Electronics', unit: 'each' },
  { sku: 'SKU-037', name: 'HDMI cable', category: 'Electronics', unit: 'each' },
  { sku: 'SKU-038', name: 'Power strip', category: 'Electronics', unit: 'each' },
  { sku: 'SKU-039', name: 'Cleaning brush', category: 'Cleaning', unit: 'each' },
  { sku: 'SKU-040', name: 'Storage tote', category: 'Hardware', unit: 'each' },
];

const targetOnHand = (index: number) => {
  if (index < 3) return 0;
  if (index < 6) return 5;
  if (index < 9) return 8;
  return 35 + ((index * 7) % 51);
};

const reorderPointFor = (index: number) => {
  if (index < 6) return 12;
  if (index < 9) return 10;
  return 20 + (index % 3) * 5;
};

const productRows: Product[] = productCatalog.map((catalogProduct, index) => {
  return {
    ...catalogProduct,
    locationId: productLocationBySku[catalogProduct.sku],
    onHand: targetOnHand(index),
    reorderPoint: reorderPointFor(index),
    leadTimeDays: 3 + (index % 9),
  };
});

const users: User[] = [
  { id: 'user-picker-01', name: 'Alex Morgan', role: 'PICKER' },
  { id: 'user-receiver-01', name: 'Jamie Chen', role: 'RECEIVER' },
  { id: 'user-manager-01', name: 'Taylor Reed', role: 'MANAGER' },
  { id: 'user-admin-01', name: 'Jordan Lee', role: 'ADMIN' },
];

const orderStatuses: Order['status'][] = [
  'PENDING', 'PENDING', 'PENDING', 'PENDING',
  'COMPLETED', 'COMPLETED', 'COMPLETED',
  'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS',
  'COMPLETED_WITH_SHORTAGE',
];

const orderIds = orderStatuses.map((_, index) => `ORD-2026-${String(index + 1).padStart(4, '0')}`);
const orderLines: Order['lines'][] = orderStatuses.map(() => []);
const now = new Date();

const seedPickQty = (index: number) => {
  if (index >= 24) return 0;
  if (index < 3) return 10 + index;
  return 2 + (index % 5);
};

const productOrderIndex = (index: number) => (index < 24 ? 4 + (index % 8) : (index - 24) % 4);

for (let index = 0; index < productRows.length; index += 1) {
  const pickedQty = seedPickQty(index);
  const status = orderStatuses[productOrderIndex(index)];
  const remainingQty = status === 'COMPLETED' ? 0 : status === 'COMPLETED_WITH_SHORTAGE' ? 1 : 2;
  orderLines[productOrderIndex(index)].push({
    sku: productRows[index].sku,
    qty: Math.max(1, pickedQty + remainingQty),
    pickedQty,
  });
}

const orders: Order[] = orderStatuses.map((status, index) => {
  const created = new Date(now.getTime() - (index + 1) * 60 * 60 * 1000);
  const due = new Date(now.getTime() + (index - 5) * 24 * 60 * 60 * 1000);
  return {
    id: orderIds[index],
    customer: ['Northstar Retail', 'Siam Office Supply', 'Bright Home', 'Metro Parts'][index % 4],
    createdAt: created.toISOString(),
    dueAt: due.toISOString(),
    priority: (['NORMAL', 'HIGH', 'LOW', 'URGENT'] as const)[index % 4],
    status,
    lines: orderLines[index],
    ...(status === 'COMPLETED_WITH_SHORTAGE' ? { shortageReason: 'Seed example: remaining stock was unavailable.' } : {}),
  };
});

const movementDate = (daysAgo: number, hour: number) => {
  const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
};

const movements: Movement[] = [];
for (let index = 0; index < productRows.length; index += 1) {
  const product = productRows[index];
  const pickedQty = seedPickQty(index);
  const openingQty = product.onHand + pickedQty;
  const receiptDate = movementDate(29 - (index % 6), 7 + (index % 3));

  if (openingQty > 0) {
    movements.push({
      id: `seed-receive-${product.sku}`,
      timestamp: receiptDate,
      type: 'RECEIVE',
      sku: product.sku,
      qty: openingQty,
      qtyBefore: 0,
      qtyAfter: openingQty,
      locationId: product.locationId,
      userId: 'user-receiver-01',
      reference: `ASN-SEED-${String(index + 1).padStart(4, '0')}`,
      reason: 'Seeded opening receipt',
    });
  }

  if (pickedQty > 0) {
    movements.push({
      id: `seed-pick-${product.sku}`,
      timestamp: movementDate(index % 20, 12 + (index % 5)),
      type: 'PICK',
      sku: product.sku,
      qty: -pickedQty,
      qtyBefore: openingQty,
      qtyAfter: product.onHand,
      locationId: product.locationId,
      userId: 'user-picker-01',
      reference: orderIds[productOrderIndex(index)],
      reason: 'Seeded order picking history',
    });
  }
}

movements.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));

export const seedBusinessData: BusinessData = {
  products: Object.fromEntries(productRows.map((product) => [product.sku, product])),
  locations: Object.fromEntries(locations.map((location) => [location.id, location])),
  orders: Object.fromEntries(orders.map((order) => [order.id, order])),
  movements,
  users: Object.fromEntries(users.map((user) => [user.id, user])),
};

export function createSeedBusinessData(): BusinessData {
  return structuredClone(seedBusinessData);
}
