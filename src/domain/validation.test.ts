import { describe, expect, it } from 'vitest';
import { isQuantityReceivable, parseWholeNumber, validateReorderPointInput } from './validation';

describe('parseWholeNumber', () => {
  it.each(['20', ' 5 ', '007'])('accepts %j', (raw) => {
    expect(parseWholeNumber(raw)).toEqual({ ok: true, value: Number(raw.trim()) });
  });

  it.each(['', ' ', '2.', '2.0', '2.5', '.5', '+2', '-3', '1e2', '0x10', '2,000', 'abc', '１２', '٢', '9007199254740992'])(
    'rejects %j', (raw) => {
      expect(parseWholeNumber(raw).ok).toBe(false);
    },
  );
});

describe('Product Detail reorder point parser inputs', () => {
  it.each(['2.', '2.0', '1e3', '-1', '+1', '1,000', ' 2 ', '１２', ''])('keeps the existing whole-number error for %j', (raw) => {
    expect(validateReorderPointInput(raw, 100)).toEqual({ ok: false, message: 'Enter a whole number of at least 1.' });
  });

  it('keeps zero invalid and accepts a valid ASCII whole number', () => {
    expect(validateReorderPointInput('0', 100)).toEqual({ ok: false, message: 'Enter a whole number of at least 1.' });
    expect(validateReorderPointInput('2', 100)).toEqual({ ok: true, value: 2, message: '' });
  });

  it('keeps the existing capacity error for values above the assigned location capacity', () => {
    expect(validateReorderPointInput('101', 100)).toEqual({
      ok: false,
      message: 'Reorder point cannot exceed the location capacity of 100.',
    });
  });

  it('keeps the previous capacity message for finite unsafe integers', () => {
    expect(validateReorderPointInput('9007199254740992', 100)).toEqual({
      ok: false,
      message: 'Reorder point cannot exceed the location capacity of 100.',
    });
  });
});

describe('isQuantityReceivable', () => {
  it('accepts a valid quantity at or below remaining capacity', () => {
    expect(isQuantityReceivable('20', 100)).toBe(true);
    expect(isQuantityReceivable('100', 100)).toBe(true);
  });

  it('rejects quantities above remaining capacity', () => {
    expect(isQuantityReceivable('101', 100)).toBe(false);
    expect(isQuantityReceivable('1000', 100)).toBe(false);
  });

  it.each(['2.5', 'abc', ''])('rejects invalid quantity %j', (raw) => {
    expect(isQuantityReceivable(raw, 100)).toBe(false);
  });

  it('rejects a missing SKU/capacity', () => {
    expect(isQuantityReceivable('20', null)).toBe(false);
  });
});
