import { describe, expect, it } from 'vitest';
import { createSeedBusinessData } from '../data/seed';
import { adjustStock } from './stock';
import { isLargeVariance, validateAdjustmentInput } from './adjustment';

const base = { countedRaw: '10', systemQty: 8, capacity: 20, reason: 'Damaged goods', role: 'MANAGER' as const };

describe('validateAdjustmentInput', () => {
  it('accepts a valid count including zero', () => {
    expect(validateAdjustmentInput({ ...base, countedRaw: '0' })).toMatchObject({ valid: true, countedQty: 0 });
  });
  it.each(['', '1.5', '-1', '1e2', '１２'])('rejects malformed count %j', (countedRaw) => {
    expect(validateAdjustmentInput({ ...base, countedRaw }).valid).toBe(false);
  });
  it('rejects a count above capacity', () => {
    expect(validateAdjustmentInput({ ...base, countedRaw: '21' }).errors.join(' ')).toContain('capacity');
  });
  it('requires a reason and details for Other', () => {
    expect(validateAdjustmentInput({ ...base, reason: '' }).valid).toBe(false);
    expect(validateAdjustmentInput({ ...base, reason: 'Other' }).errors).toContain('Enter a reason for Other.');
    expect(validateAdjustmentInput({ ...base, reason: 'Other', otherReason: 'forklift accident' }).reasonText).toBe('Other: forklift accident');
  });
  it('allows equal counts for preview while the page blocks recording', () => {
    expect(validateAdjustmentInput({ ...base, countedRaw: '8' }).valid).toBe(true);
  });
  it.each([
    ['positive Lost / missing', '10', 'Lost / missing', false],
    ['positive Damaged goods', '10', 'Damaged goods', false],
    ['positive Found stock', '10', 'Found stock', true],
    ['negative Found stock', '6', 'Found stock', false],
    ['negative Lost / missing', '6', 'Lost / missing', true],
    ['negative Damaged goods', '6', 'Damaged goods', true],
  ])('validates direction: %s', (_label, countedRaw, reason, expected) => {
    expect(validateAdjustmentInput({ ...base, systemQty: 8, countedRaw, reason }).valid).toBe(expected);
  });
  it.each(['Cycle count correction', 'Data entry error', 'Other'] as const)('%s is accepted in either direction', (reason) => {
    for (const countedRaw of ['10', '6']) {
      expect(validateAdjustmentInput({ ...base, systemQty: 8, countedRaw, reason, otherReason: reason === 'Other' ? 'audit note' : undefined }).valid).toBe(true);
    }
  });
  it('skips reason-direction checks when the count matches system', () => {
    expect(validateAdjustmentInput({ ...base, systemQty: 8, countedRaw: '8', reason: 'Found stock' }).valid).toBe(true);
  });
  it.each(['PICKER', 'RECEIVER'] as const)('rejects %s role', (role) => {
    expect(validateAdjustmentInput({ ...base, role }).valid).toBe(false);
  });
});

describe('isLargeVariance', () => {
  it('requires 10 units or at least 3 units and 20 percent of system stock', () => {
    expect(isLargeVariance(5, 4)).toBe(false);
    expect(isLargeVariance(5, 2)).toBe(true);
    expect(isLargeVariance(50, 41)).toBe(false);
    expect(isLargeVariance(50, 40)).toBe(true);
    expect(isLargeVariance(20, 16)).toBe(true);
    expect(isLargeVariance(20, 17)).toBe(false);
    expect(isLargeVariance(0, 9)).toBe(false);
    expect(isLargeVariance(0, 10)).toBe(true);
  });
});

describe('adjustStock integration', () => {
  it('creates an ADJUST Movement with a continuous before/after and combined reason', () => {
    const state = { ...createSeedBusinessData(), currentUserId: null, session: null, theme: 'light' as const, feedback: null };
    const product = Object.values(state.products).find((item) => item.onHand > 0)!;
    const userId = Object.values(state.users).find((user) => user.role === 'MANAGER')!.id;
    const result = adjustStock(state, { sku: product.sku, countedQty: product.onHand - 1, userId, reason: 'Damaged goods: forklift accident' });
    expect(result.movement).toMatchObject({ type: 'ADJUST', sku: product.sku, qty: -1, qtyBefore: product.onHand, qtyAfter: product.onHand - 1, reason: 'Damaged goods: forklift accident' });
  });
});
