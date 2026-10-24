import type {
  Movement,
  MovementType,
  Order,
  Role,
  StoreState,
  User,
} from './models';

export type StockErrorCode =
  | 'UNKNOWN_SKU'
  | 'UNKNOWN_USER'
  | 'UNKNOWN_LOCATION'
  | 'INVALID_QUANTITY'
  | 'NEGATIVE_STOCK'
  | 'SKU_MISMATCH'
  | 'ORDER_NOT_FOUND'
  | 'ORDER_NOT_PICKABLE'
  | 'ORDER_LINE_NOT_FOUND'
  | 'PICK_EXCEEDS_REMAINING'
  | 'REASON_REQUIRED'
  | 'FORBIDDEN';

export class StockActionError extends Error {
  readonly code: StockErrorCode;

  constructor(code: StockErrorCode, message: string) {
    super(message);
    this.name = 'StockActionError';
    this.code = code;
  }
}

export interface StockActionResult {
  state: StoreState;
  movement?: Movement;
  message: string;
}

interface StockChangeInput {
  type: MovementType;
  sku: string;
  signedQty: number;
  locationId?: string;
  userId: string;
  reference?: string | null;
  reason?: string;
  timestamp?: string;
  movementId?: string;
}

export interface ReceiveStockInput {
  sku: string;
  quantity: number;
  locationId?: string;
  userId: string;
  reference?: string | null;
  reason?: string;
  timestamp?: string;
  movementId?: string;
}

export interface PickItemInput {
  orderId: string;
  sku: string;
  scannedSku: string;
  quantity: number;
  userId: string;
  reason?: string;
  shortageReason?: string;
  timestamp?: string;
  movementId?: string;
}

export interface AdjustStockInput {
  sku: string;
  countedQty: number;
  userId: string;
  reason: string;
  reference?: string | null;
  timestamp?: string;
  movementId?: string;
}

function requireValidUser(state: StoreState, userId: string): User {
  const user = state.users[userId];
  if (!user) throw new StockActionError('UNKNOWN_USER', `Unknown user: ${userId}`);
  return user;
}

function requirePositiveInteger(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new StockActionError('INVALID_QUANTITY', 'Quantity must be a positive whole number.');
  }
}

function applyStockChange(state: StoreState, input: StockChangeInput): StockActionResult {
  const product = state.products[input.sku];
  if (!product) throw new StockActionError('UNKNOWN_SKU', `Unknown SKU: ${input.sku}`);
  const user = requireValidUser(state, input.userId);
  const locationId = input.locationId ?? product.locationId;
  if (!state.locations[locationId]) {
    throw new StockActionError('UNKNOWN_LOCATION', `Unknown location: ${locationId}`);
  }
  if (!Number.isInteger(input.signedQty) || input.signedQty === 0) {
    throw new StockActionError('INVALID_QUANTITY', 'Stock change must be a non-zero whole number.');
  }

  const qtyBefore = product.onHand;
  const qtyAfter = qtyBefore + input.signedQty;
  if (qtyAfter < 0) {
    throw new StockActionError('NEGATIVE_STOCK', 'This action would make on-hand stock negative.');
  }

  const movement: Movement = {
    id: input.movementId ?? crypto.randomUUID(),
    timestamp: input.timestamp ?? new Date().toISOString(),
    type: input.type,
    sku: input.sku,
    qty: input.signedQty,
    qtyBefore,
    qtyAfter,
    locationId,
    userId: user.id,
    reference: input.reference ?? null,
    reason: input.reason?.trim() ?? '',
  };

  return {
    state: {
      ...state,
      products: { ...state.products, [input.sku]: { ...product, onHand: qtyAfter } },
      movements: [...state.movements, movement],
    },
    movement,
    message: `${input.type} recorded for ${input.sku}. On-hand: ${qtyBefore} → ${qtyAfter}.`,
  };
}

export function receiveStock(state: StoreState, input: ReceiveStockInput): StockActionResult {
  requirePositiveInteger(input.quantity);
  return applyStockChange(state, {
    ...input,
    type: 'RECEIVE',
    signedQty: input.quantity,
    reason: input.reason?.trim() || 'Stock received',
  });
}

export function pickItem(state: StoreState, input: PickItemInput): StockActionResult {
  requirePositiveInteger(input.quantity);
  if (input.scannedSku.trim() !== input.sku.trim()) {
    throw new StockActionError('SKU_MISMATCH', `Scanned SKU ${input.scannedSku} does not match ${input.sku}.`);
  }

  const order = state.orders[input.orderId];
  if (!order) throw new StockActionError('ORDER_NOT_FOUND', `Unknown order: ${input.orderId}`);
  if (order.status !== 'IN_PROGRESS') {
    throw new StockActionError('ORDER_NOT_PICKABLE', 'Start the order before confirming a pick.');
  }
  const line = order.lines.find((candidate) => candidate.sku === input.sku);
  if (!line) throw new StockActionError('ORDER_LINE_NOT_FOUND', `${input.sku} is not on order ${input.orderId}.`);
  if (input.quantity > line.qty - line.pickedQty) {
    throw new StockActionError('PICK_EXCEEDS_REMAINING', 'Picked quantity cannot exceed the remaining order quantity.');
  }

  const shortageReason = input.shortageReason?.trim();
  if (input.shortageReason !== undefined && !shortageReason) {
    throw new StockActionError('REASON_REQUIRED', 'Enter a reason when completing an order with a shortage.');
  }

  const result = applyStockChange(state, {
    ...input,
    type: 'PICK',
    signedQty: -input.quantity,
    locationId: state.products[input.sku]?.locationId,
    reference: input.orderId,
    reason: shortageReason ? `Shortage: ${shortageReason}` : input.reason?.trim() || `Picked for ${input.orderId}`,
  });

  const updatedLines = order.lines.map((candidate) =>
    candidate.sku === input.sku
      ? { ...candidate, pickedQty: candidate.pickedQty + input.quantity }
      : candidate,
  );
  const allLinesComplete = updatedLines.every((candidate) => candidate.pickedQty >= candidate.qty);
  const updatedOrder: Order = {
    ...order,
    lines: updatedLines,
    status: shortageReason ? 'COMPLETED_WITH_SHORTAGE' : allLinesComplete ? 'COMPLETED' : 'IN_PROGRESS',
    ...(shortageReason ? { shortageReason } : {}),
  };

  return {
    ...result,
    state: { ...result.state, orders: { ...result.state.orders, [order.id]: updatedOrder } },
    message: allLinesComplete
      ? `Order ${order.id} completed.`
      : shortageReason
        ? `Order ${order.id} completed with shortage: ${shortageReason}`
        : result.message,
  };
}

export function adjustStock(state: StoreState, input: AdjustStockInput): StockActionResult {
  const user = requireValidUser(state, input.userId);
  const allowedRoles: Role[] = ['MANAGER', 'ADMIN'];
  if (!allowedRoles.includes(user.role)) {
    throw new StockActionError('FORBIDDEN', 'Only a Manager or Admin can adjust stock.');
  }
  if (!Number.isInteger(input.countedQty) || input.countedQty < 0) {
    throw new StockActionError('INVALID_QUANTITY', 'Counted quantity must be a non-negative whole number.');
  }
  const reason = input.reason.trim();
  if (!reason) throw new StockActionError('REASON_REQUIRED', 'Adjustment reason is required.');
  const product = state.products[input.sku];
  if (!product) throw new StockActionError('UNKNOWN_SKU', `Unknown SKU: ${input.sku}`);
  const difference = input.countedQty - product.onHand;
  if (difference === 0) {
    return { state, message: `Stock matches the count for ${input.sku}; no Movement was created.` };
  }

  return applyStockChange(state, {
    type: 'ADJUST',
    sku: input.sku,
    signedQty: difference,
    userId: input.userId,
    locationId: product.locationId,
    reference: input.reference ?? null,
    reason,
    timestamp: input.timestamp,
    movementId: input.movementId,
  });
}
