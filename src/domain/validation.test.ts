import { describe, expect, it } from 'vitest';
import { isQuantityReceivable, parseWholeNumber } from './validation';

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
