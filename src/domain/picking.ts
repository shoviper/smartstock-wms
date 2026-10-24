import type { Order, OrderLine, StoreState } from './models';
import { pickItem, type PickItemInput, type StockActionResult } from './stock';

export type ShortPickReason = 'Out of stock' | 'Damaged' | 'Not found at location' | 'Other';

export interface ShortPickInput extends PickItemInput {
  reason: ShortPickReason;
  otherReason?: string;
}

export class PickingActionError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'PickingActionError';
  }
}

function requireActivePicker(state: StoreState, userId: string) {
  const user = state.users[userId];
  if (!user) throw new PickingActionError('The signed-in user was not found.', 'UNKNOWN_USER');
  if (!state.session || state.currentUserId !== state.session.id || state.session.id !== userId || state.session.role !== user.role
    || !['PICKER', 'MANAGER', 'ADMIN'].includes(user.role)) {
    throw new PickingActionError('Only the signed-in Picker, Manager, or Admin can pick stock.', 'FORBIDDEN');
  }
}

function requireActiveOrder(state: StoreState, orderId: string): Order {
  const order = state.orders[orderId];
  if (!order) throw new PickingActionError(`Order ${orderId} was not found.`, 'ORDER_NOT_FOUND');
  if (order.status === 'PENDING') throw new PickingActionError('Start the order before picking.', 'ORDER_NOT_STARTED');
  if (order.status === 'COMPLETED' || order.status === 'COMPLETED_WITH_SHORTAGE') {
    throw new PickingActionError('Completed orders cannot be changed.', 'ORDER_COMPLETED');
  }
  return order;
}

function closeOrderIfReady(order: Order, lines: OrderLine[], timestamp?: string): Order {
  const completed = lines.every((line) => line.pickedQty + (line.shortQty ?? 0) >= line.qty);
  const hasShortage = lines.some((line) => (line.shortQty ?? 0) > 0);
  return {
    ...order,
    lines,
    status: completed ? hasShortage ? 'COMPLETED_WITH_SHORTAGE' : 'COMPLETED' : 'IN_PROGRESS',
    ...(completed ? { completedAt: timestamp ?? new Date().toISOString() } : {}),
    ...(hasShortage ? { shortageReason: 'One or more lines were short picked.' } : {}),
  };
}

export function confirmPicking(state: StoreState, input: PickItemInput): StockActionResult {
  requireActivePicker(state, input.userId);
  const order = requireActiveOrder(state, input.orderId);
  const line = order.lines.find((candidate) => candidate.sku === input.sku);
  if (!line) throw new PickingActionError(`${input.sku} is not on order ${order.id}.`, 'ORDER_LINE_NOT_FOUND');
  const expectedSku = line.sku.trim().toLocaleUpperCase();
  if (input.scannedSku.trim().toLocaleUpperCase() !== expectedSku) {
    throw new PickingActionError(`Scanned SKU ${input.scannedSku} does not match ${line.sku}.`, 'SKU_MISMATCH');
  }
  const picked = pickItem(state, { ...input, scannedSku: line.sku });
  const updatedOrder = picked.state.orders[order.id];
  const finalOrder = closeOrderIfReady(updatedOrder, updatedOrder.lines, input.timestamp);
  return { ...picked, state: { ...picked.state, orders: { ...picked.state.orders, [order.id]: finalOrder } } };
}

export function completeShortPick(state: StoreState, input: ShortPickInput): StockActionResult {
  requireActivePicker(state, input.userId);
  const order = requireActiveOrder(state, input.orderId);
  const line = order.lines.find((candidate) => candidate.sku === input.sku);
  if (!line) throw new PickingActionError(`${input.sku} is not on order ${order.id}.`, 'ORDER_LINE_NOT_FOUND');
  if ((line.shortQty ?? 0) > 0 || line.pickedQty >= line.qty) {
    throw new PickingActionError('This line is already closed.', 'LINE_ALREADY_CLOSED');
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 0) {
    throw new PickingActionError('Enter a whole quantity of zero or more.', 'INVALID_QUANTITY');
  }
  const remaining = line.qty - line.pickedQty;
  if (input.quantity > remaining) throw new PickingActionError(`You can pick no more than ${remaining} remaining units.`, 'PICK_EXCEEDS_REMAINING');
  if (input.quantity > (state.products[input.sku]?.onHand ?? 0)) {
    throw new PickingActionError(`Only ${state.products[input.sku]?.onHand ?? 0} units are on hand.`, 'NEGATIVE_STOCK');
  }
  if (input.quantity === remaining) throw new PickingActionError('This quantity completes the line. Use Confirm pick instead.', 'USE_CONFIRM_PICK');
  const detail = input.reason === 'Other' ? input.otherReason?.trim() : '';
  if (!['Out of stock', 'Damaged', 'Not found at location', 'Other'].includes(input.reason) || (input.reason === 'Other' && !detail)) {
    throw new PickingActionError('Choose a reason and enter details for Other.', 'REASON_REQUIRED');
  }
  const expectedLocation = state.products[input.sku]?.locationId ?? '';
  const providedLocation = input.expectedLocationId?.trim() ?? '';
  const providedSku = input.scannedSku.trim();
  if (input.quantity === 0) {
    if (providedLocation && providedLocation.toLocaleUpperCase() !== expectedLocation.trim().toLocaleUpperCase()) {
      throw new PickingActionError(`Location does not match this line (expected ${expectedLocation}).`, 'LOCATION_MISMATCH');
    }
    if (providedSku && providedSku.toLocaleUpperCase() !== input.sku.trim().toLocaleUpperCase()) {
      throw new PickingActionError('SKU does not match this line.', 'SKU_MISMATCH');
    }
  } else {
    if (!providedLocation || providedLocation.toLocaleUpperCase() !== expectedLocation.trim().toLocaleUpperCase()) {
      throw new PickingActionError(`Location does not match this line (expected ${expectedLocation}).`, 'LOCATION_MISMATCH');
    }
    if (!providedSku || providedSku.toLocaleUpperCase() !== input.sku.trim().toLocaleUpperCase()) {
      throw new PickingActionError('SKU does not match this line.', 'SKU_MISMATCH');
    }
  }
  const reason = input.reason === 'Other' ? `Other: ${detail}` : input.reason;
  let baseState = state;
  let movement: StockActionResult['movement'];
  if (input.quantity > 0) {
    const picked = pickItem(state, {
      orderId: input.orderId,
      sku: input.sku,
      scannedSku: line.sku,
      expectedLocationId: input.expectedLocationId,
      quantity: input.quantity,
      userId: input.userId,
      timestamp: input.timestamp,
      movementId: input.movementId,
      reason: `Short pick: ${reason}`,
    });
    baseState = picked.state;
    movement = picked.movement;
  }
  const updatedOrder = baseState.orders[input.orderId];
  const updatedLine = updatedOrder.lines.find((candidate) => candidate.sku === input.sku);
  if (!updatedLine) throw new PickingActionError(`${input.sku} is not on order ${order.id}.`, 'ORDER_LINE_NOT_FOUND');
  const shortQty = updatedLine.qty - updatedLine.pickedQty;
  const lines = updatedOrder.lines.map((candidate) => candidate.sku === input.sku
    ? { ...candidate, shortQty, shortReason: reason }
    : candidate);
  const finalOrder = closeOrderIfReady(updatedOrder, lines, input.timestamp);
  return {
    state: { ...baseState, orders: { ...baseState.orders, [order.id]: finalOrder } },
    movement,
    message: input.quantity > 0
      ? `Picked ${input.quantity} units; ${shortQty} marked short (${reason}).`
      : `${shortQty} units marked short (${reason}).`,
  };
}

export function selectNextPendingLine(sortedLines: OrderLine[]): OrderLine | undefined {
  return sortedLines.find((line) => line.pickedQty + (line.shortQty ?? 0) < line.qty);
}

export function getLinePickingStatus(line: OrderLine, onHand: number): 'Pending' | 'Picked' | 'Short' | 'Out of stock' {
  if (line.pickedQty + (line.shortQty ?? 0) >= line.qty) return (line.shortQty ?? 0) > 0 ? 'Short' : 'Picked';
  if (onHand === 0) return 'Out of stock';
  return 'Pending';
}
