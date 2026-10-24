import { describe, expect, it } from 'vitest';
import { createInitialStoreState } from '../store/persistence';
import { storeReducer } from '../store/StoreProvider';
import type { StoreState } from './models';
import { completeShortPick, confirmPicking, getLinePickingStatus, selectNextPendingLine } from './picking';
import { parseWholeNumber } from './validation';

function pickingState(onHand = 12, status: 'IN_PROGRESS' | 'PENDING' | 'COMPLETED' = 'IN_PROGRESS'): StoreState {
  const state = createInitialStoreState();
  const userId = 'user-picker-01';
  return {
    ...state,
    currentUserId: userId,
    session: state.users[userId],
    products: { ...state.products, 'SKU-010': { ...state.products['SKU-010'], onHand } },
    orders: {
      ...state.orders,
      'ORD-PICK-TEST': {
        id: 'ORD-PICK-TEST', customer: 'Pick Test', createdAt: '2026-01-01T00:00:00.000Z', dueAt: '2026-01-02T00:00:00.000Z',
        priority: 'NORMAL', status, lines: [{ sku: 'SKU-010', qty: 5, pickedQty: 0 }],
      },
    },
  };
}

const pickInput = { orderId: 'ORD-PICK-TEST', sku: 'SKU-010', scannedSku: 'SKU-010', expectedLocationId: 'C-01-04-1', quantity: 2, userId: 'user-picker-01' };

describe('picking validation and short pick', () => {
  it('rejects wrong location and SKU without changing stock, movements, or picked quantity', () => {
    for (const input of [
      { ...pickInput, expectedLocationId: 'A-01-01-1' },
      { ...pickInput, scannedSku: 'SKU-011' },
    ]) {
      const state = pickingState();
      expect(() => confirmPicking(state, input)).toThrow();
      expect(state.products['SKU-010'].onHand).toBe(12);
      expect(state.movements).toHaveLength(createInitialStoreState().movements.length);
      expect(state.orders['ORD-PICK-TEST'].lines[0].pickedQty).toBe(0);
    }
  });

  it('compares scanned location and SKU after trimming and without case sensitivity', () => {
    const state = pickingState();
    const result = confirmPicking(state, { ...pickInput, expectedLocationId: ' c-01-04-1 ', scannedSku: ' sku-010 ' });
    expect(result.state.products['SKU-010'].onHand).toBe(10);
  });

  it('rejects malformed, non-positive and over-remaining quantities atomically', () => {
    expect(parseWholeNumber('2.5').ok).toBe(false);
    for (const quantity of [0, -1, 1.5, 6]) {
      const state = pickingState();
      expect(() => confirmPicking(state, { ...pickInput, quantity })).toThrow();
      expect(state.products['SKU-010'].onHand).toBe(12);
      expect(state.movements).toHaveLength(createInitialStoreState().movements.length);
      expect(state.orders['ORD-PICK-TEST'].lines[0].pickedQty).toBe(0);
    }
  });

  it('blocks a pick above on-hand without a partial mutation', () => {
    const state = pickingState(1);
    expect(() => confirmPicking(state, pickInput)).toThrowError(expect.objectContaining({ code: 'NEGATIVE_STOCK' }));
    expect(state.products['SKU-010'].onHand).toBe(1);
    expect(state.movements).toHaveLength(createInitialStoreState().movements.length);
    expect(state.orders['ORD-PICK-TEST'].lines[0].pickedQty).toBe(0);
  });

  it('blocks a short pick above on-hand without recording any Movement', () => {
    const state = pickingState(1);
    expect(() => completeShortPick(state, { ...pickInput, quantity: 2, reason: 'Damaged' }))
      .toThrowError(expect.objectContaining({ code: 'NEGATIVE_STOCK' }));
    expect(state.products['SKU-010'].onHand).toBe(1);
    expect(state.movements).toHaveLength(createInitialStoreState().movements.length);
    expect(state.orders['ORD-PICK-TEST'].lines[0]).toMatchObject({ pickedQty: 0 });
  });

  it('picks stock through pickItem and records a complete PICK Movement', () => {
    const state = pickingState();
    const result = confirmPicking(state, { ...pickInput, quantity: 5, timestamp: '2026-10-25T12:00:00.000Z', movementId: 'pick-test' });
    expect(result.state.products['SKU-010'].onHand).toBe(7);
    expect(result.state.orders['ORD-PICK-TEST']).toMatchObject({ status: 'COMPLETED', completedAt: '2026-10-25T12:00:00.000Z', lines: [{ sku: 'SKU-010', qty: 5, pickedQty: 5 }] });
    expect(result.movement).toMatchObject({ type: 'PICK', sku: 'SKU-010', qty: -5, qtyBefore: 12, qtyAfter: 7, locationId: 'C-01-04-1', userId: 'user-picker-01', reference: 'ORD-PICK-TEST' });
  });

  it.each(['PENDING', 'COMPLETED'] as const)('blocks order status %s from picking', (status) => {
    const state = pickingState(12, status);
    expect(() => confirmPicking(state, pickInput)).toThrow();
    expect(state.products['SKU-010'].onHand).toBe(12);
    expect(state.orders['ORD-PICK-TEST'].lines[0].pickedQty).toBe(0);
  });

  it('blocks Receiver and spoofed user actions', () => {
    const state = pickingState();
    const receiverId = 'user-receiver-01';
    const receiverState = { ...state, currentUserId: receiverId, session: state.users[receiverId] };
    expect(() => confirmPicking(receiverState, { ...pickInput, userId: receiverId })).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(() => confirmPicking(state, { ...pickInput, userId: 'user-admin-01' })).toThrowError(expect.objectContaining({ code: 'FORBIDDEN' }));
    expect(state.products['SKU-010'].onHand).toBe(12);
  });

  it('enforces picking permission in the central store action', () => {
    const state = pickingState();
    const receiverId = 'user-receiver-01';
    const receiverState = { ...state, currentUserId: receiverId, session: state.users[receiverId] };
    const blocked = storeReducer(receiverState, { type: 'stock/pick', input: { ...pickInput, userId: receiverId } });
    expect(blocked.products['SKU-010'].onHand).toBe(12);
    expect(blocked.movements).toHaveLength(state.movements.length);
    expect(blocked.orders['ORD-PICK-TEST'].lines[0].pickedQty).toBe(0);
    expect(blocked.feedback?.kind).toBe('error');
  });

  it.each(['MANAGER', 'ADMIN'] as const)('allows %s to pick with the active session', (role) => {
    const state = pickingState();
    const userId = role === 'MANAGER' ? 'user-manager-01' : 'user-admin-01';
    const authorizedState = { ...state, currentUserId: userId, session: state.users[userId] };
    const result = confirmPicking(authorizedState, { ...pickInput, userId, quantity: 1 });
    expect(result.state.products['SKU-010'].onHand).toBe(11);
    expect(result.movement?.userId).toBe(userId);
  });

  it('short picks a positive quantity through pickItem and closes the remaining quantity', () => {
    const state = pickingState();
    const result = completeShortPick(state, { ...pickInput, quantity: 2, reason: 'Damaged', timestamp: '2026-10-25T12:00:00.000Z', movementId: 'short-pick-test' });
    expect(result.state.products['SKU-010'].onHand).toBe(10);
    expect(result.state.orders['ORD-PICK-TEST']).toMatchObject({ status: 'COMPLETED_WITH_SHORTAGE', completedAt: '2026-10-25T12:00:00.000Z', lines: [{ pickedQty: 2, shortQty: 3, shortReason: 'Damaged' }] });
    expect(result.movement).toMatchObject({ type: 'PICK', qty: -2, qtyBefore: 12, qtyAfter: 10, reference: 'ORD-PICK-TEST', reason: 'Short pick: Damaged' });
  });

  it('records a zero-quantity short pick without Movement and completes the order', () => {
    const state = pickingState();
    const result = completeShortPick(state, { ...pickInput, expectedLocationId: '', scannedSku: '', quantity: 0, reason: 'Not found at location', timestamp: '2026-10-25T12:00:00.000Z' });
    expect(result.state.products['SKU-010'].onHand).toBe(12);
    expect(result.state.movements).toHaveLength(state.movements.length);
    expect(result.state.orders['ORD-PICK-TEST']).toMatchObject({ status: 'COMPLETED_WITH_SHORTAGE', lines: [{ pickedQty: 0, shortQty: 5, shortReason: 'Not found at location' }] });
    expect(result.state.orders['ORD-PICK-TEST'].completedAt).toBe('2026-10-25T12:00:00.000Z');
    expect(result.movement).toBeUndefined();
  });

  it('allows blank scan fields for a zero-quantity short pick', () => {
    const result = completeShortPick(pickingState(), { ...pickInput, expectedLocationId: '  ', scannedSku: ' ', quantity: 0, reason: 'Out of stock' });
    expect(result.state.orders['ORD-PICK-TEST'].lines[0]).toMatchObject({ pickedQty: 0, shortQty: 5, shortReason: 'Out of stock' });
    expect(result.movement).toBeUndefined();
  });

  it.each([
    ['location', { expectedLocationId: 'A-02-03-2', scannedSku: '' }],
    ['SKU', { expectedLocationId: '', scannedSku: 'SKU-999' }],
  ] as const)('blocks a zero-quantity short pick with an incorrect %s and leaves state unchanged', (_field, scan) => {
    const state = pickingState();
    expect(() => completeShortPick(state, { ...pickInput, ...scan, quantity: 0, reason: 'Out of stock' })).toThrow();
    expect(state.products['SKU-010'].onHand).toBe(12);
    expect(state.movements).toHaveLength(createInitialStoreState().movements.length);
    expect(state.orders['ORD-PICK-TEST'].lines[0]).toMatchObject({ pickedQty: 0 });
    expect(state.orders['ORD-PICK-TEST'].lines[0].shortQty).toBeUndefined();
  });

  it('accepts correct non-empty scan fields for a zero-quantity short pick', () => {
    const result = completeShortPick(pickingState(), { ...pickInput, quantity: 0, reason: 'Out of stock' });
    expect(result.state.orders['ORD-PICK-TEST'].lines[0]).toMatchObject({ shortQty: 5, shortReason: 'Out of stock' });
    expect(result.movement).toBeUndefined();
  });

  it('still requires correct location and SKU for a positive short pick', () => {
    for (const scan of [
      { expectedLocationId: '', scannedSku: 'SKU-010' },
      { expectedLocationId: 'C-01-04-1', scannedSku: '' },
    ]) {
      const state = pickingState();
      expect(() => completeShortPick(state, { ...pickInput, ...scan, quantity: 2, reason: 'Damaged' })).toThrow();
      expect(state.products['SKU-010'].onHand).toBe(12);
      expect(state.movements).toHaveLength(createInitialStoreState().movements.length);
      expect(state.orders['ORD-PICK-TEST'].lines[0].pickedQty).toBe(0);
    }
    const valid = completeShortPick(pickingState(), { ...pickInput, quantity: 2, reason: 'Damaged' });
    expect(valid.state.products['SKU-010'].onHand).toBe(10);
    expect(valid.movement?.type).toBe('PICK');
  });

  it('requires detail for Other and rejects repeated short pick on a closed line', () => {
    const state = pickingState();
    expect(() => completeShortPick(state, { ...pickInput, quantity: 0, reason: 'Other' })).toThrowError(expect.objectContaining({ code: 'REASON_REQUIRED' }));
    const closed = completeShortPick(state, { ...pickInput, quantity: 0, reason: 'Other', otherReason: 'Damaged package' });
    expect(() => completeShortPick(closed.state, { ...pickInput, quantity: 0, reason: 'Out of stock' })).toThrowError(expect.objectContaining({ code: 'ORDER_COMPLETED' }));
  });

  it('requires Confirm pick when the short pick quantity equals the remaining quantity', () => {
    expect(() => completeShortPick(pickingState(), { ...pickInput, quantity: 5, reason: 'Damaged' }))
      .toThrowError(expect.objectContaining({ code: 'USE_CONFIRM_PICK', message: expect.stringContaining('Confirm pick') }));
  });

  it('closes completed orders only when every line is fully picked or short', () => {
    const state = pickingState();
    const order = state.orders['ORD-PICK-TEST'];
    const secondLine = { ...order.lines[0], sku: 'SKU-011', qty: 3 };
    state.orders['ORD-PICK-TEST'] = { ...order, lines: [...order.lines, secondLine] };
    const partial = confirmPicking(state, { ...pickInput, quantity: 5 });
    expect(partial.state.orders['ORD-PICK-TEST'].status).toBe('IN_PROGRESS');
    const completed = completeShortPick(partial.state, { ...pickInput, sku: 'SKU-011', scannedSku: 'SKU-011', expectedLocationId: partial.state.products['SKU-011'].locationId, quantity: 0, reason: 'Out of stock' });
    expect(completed.state.orders['ORD-PICK-TEST'].status).toBe('COMPLETED_WITH_SHORTAGE');
  });

  it('selects the next open pick-path line and reports each line status', () => {
    const lines = [
      { sku: 'SKU-010', qty: 5, pickedQty: 2 },
      { sku: 'SKU-011', qty: 3, pickedQty: 3 },
      { sku: 'SKU-012', qty: 2, pickedQty: 0, shortQty: 2, shortReason: 'Out of stock' },
    ];
    expect(selectNextPendingLine(lines)?.sku).toBe('SKU-010');
    expect(getLinePickingStatus(lines[0], 4)).toBe('Pending');
    expect(getLinePickingStatus(lines[1], 4)).toBe('Picked');
    expect(getLinePickingStatus(lines[2], 0)).toBe('Short');
    expect(getLinePickingStatus({ sku: 'SKU-010', qty: 5, pickedQty: 0 }, 0)).toBe('Out of stock');
  });
});
