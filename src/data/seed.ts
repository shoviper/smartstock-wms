import type {
  BusinessData,
  Location,
  Movement,
  Order,
  Product,
  User,
} from '../domain/models';

const zoneNames = ['A', 'B', 'C', 'D'];

const locations: Location[] = zoneNames.flatMap((zone, zoneIndex) =>
  [1, 2, 3].map((aisleIndex) => {
    const x = 12 + zoneIndex * 18;
    const y = aisleIndex * 14;
    const id = `${zone}-${String(aisleIndex).padStart(2, '0')}-01-1`;

    return {
      id,
      zone,
      aisle: String(aisleIndex).padStart(2, '0'),
      rack: '01',
      level: 1,
      capacity: 120 + zoneIndex * 20 + aisleIndex * 10,
      coordinates: { x, y },
      dispatchDistanceMeters: Math.round(Math.hypot(x, y)),
    };
  }),
);

const categories = ['Packaging', 'Electronics', 'Cleaning', 'Hardware', 'Office', 'Safety'];
const productNames = [
  'Carton box', 'Bubble wrap roll', 'Packing tape', 'Shipping label', 'Stretch film',
  'USB keyboard', 'Wireless mouse', 'Power adapter', 'Ethernet cable', 'Barcode label roll',
  'Floor cleaner', 'Hand soap', 'Microfiber cloth', 'Trash liner', 'Sanitizer bottle',
  'Hex bolt set', 'Cable tie pack', 'Utility blade', 'Work gloves', 'Tool bit set',
  'Copy paper', 'Marker pen', 'Document sleeve', 'Thermal paper roll', 'Clipboard',
  'Safety glasses', 'Reflective vest', 'Dust mask', 'Ear plugs', 'First aid refill',
  'Foam insert', 'Corner protector', 'Pallet wrap', 'Mailing envelope', 'Foam pouch',
  'Laptop stand', 'HDMI cable', 'Power strip', 'Cleaning brush', 'Storage tote',
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

const productRows: Product[] = productNames.map((name, index) => {
  const location = locations[index % locations.length];
  return {
    sku: `SKU-${String(index + 1).padStart(3, '0')}`,
    name,
    category: categories[index % categories.length],
    unit: index % 5 === 0 ? 'roll' : 'each',
    locationId: location.id,
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
