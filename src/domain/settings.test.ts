import { describe, expect, it } from 'vitest';
import { createInitialStoreState } from '../store/persistence';
import {
  DEFAULT_REORDER_POINT,
  MAX_DEFAULT_REORDER_POINT,
  MIN_DEFAULT_REORDER_POINT,
  SettingsActionError,
  resetDefaultReorderPointDraft,
  updateDefaultReorderPoint,
  validateDefaultReorderPointInput,
  validateDefaultReorderPointValue,
} from './settings';
import { storeReducer } from '../store/StoreProvider';

describe('default reorder point setting', () => {
  it.each([
    ['', 'Enter digits 0–9 only.'],
    ['0', 'Default reorder point must be a whole number'],
    ['1.5', 'Enter digits 0–9 only.'],
    [String(MAX_DEFAULT_REORDER_POINT + 1), 'Enter a safe whole number.'],
  ])('rejects invalid text input %j', (raw, message) => {
    expect(validateDefaultReorderPointInput(raw)).toMatchObject({ valid: false, message: expect.stringContaining(message) });
  });

  it('accepts both limits and reports the same range shown by Settings', () => {
    expect(validateDefaultReorderPointValue(MIN_DEFAULT_REORDER_POINT)).toEqual({ valid: true, value: 1 });
    expect(validateDefaultReorderPointValue(MAX_DEFAULT_REORDER_POINT)).toEqual({ valid: true, value: Number.MAX_SAFE_INTEGER });
    expect(validateDefaultReorderPointValue(0).valid).toBe(false);
  });

  it('starts with a valid default and updates the app setting without changing products or Movements', () => {
    const initial = createInitialStoreState();
    const manager = Object.values(initial.users).find((user) => user.role === 'MANAGER')!;
    const state = { ...initial, currentUserId: manager.id, session: manager };
    expect(initial.settings.defaultReorderPoint).toBe(DEFAULT_REORDER_POINT);

    const updated = updateDefaultReorderPoint(state, 24);
    expect(updated.settings.defaultReorderPoint).toBe(24);
    expect(updated.products).toBe(state.products);
    expect(updated.movements).toBe(state.movements);
    expect(Object.keys(updated.products).every((sku) => updated.products[sku].reorderPoint === state.products[sku].reorderPoint)).toBe(true);
    expect(storeReducer(state, { type: 'settings/default-reorder-point', value: 26 }).settings.defaultReorderPoint).toBe(26);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid default reorder point %s', (value) => {
      const initial = createInitialStoreState();
      const admin = Object.values(initial.users).find((user) => user.role === 'ADMIN')!;
      const state = { ...initial, currentUserId: admin.id, session: admin };
      expect(() => updateDefaultReorderPoint(state, value)).toThrowError(
        expect.objectContaining({ code: 'INVALID_DEFAULT_REORDER_POINT' }),
      );
    },
  );

  it('restricts the setting update to Manager and Admin', () => {
    const initial = createInitialStoreState();
    const picker = Object.values(initial.users).find((user) => user.role === 'PICKER')!;
    const state = { ...initial, currentUserId: picker.id, session: picker };
    expect(() => updateDefaultReorderPoint(state, 20)).toThrowError(
      expect.objectContaining<Partial<SettingsActionError>>({ code: 'FORBIDDEN' }),
    );
  });

  it('keeps the saved value after demo reset and restores the draft to the saved value on cancel/reset', () => {
    const initial = createInitialStoreState();
    const manager = Object.values(initial.users).find((user) => user.role === 'MANAGER')!;
    const state = { ...initial, currentUserId: manager.id, session: manager };
    const saved = updateDefaultReorderPoint(state, 37);
    expect(resetDefaultReorderPointDraft(saved.settings.defaultReorderPoint)).toBe('37');

    const reset = storeReducer(saved, { type: 'demo/reset' });
    expect(reset.settings.defaultReorderPoint).toBe(37);
    expect(resetDefaultReorderPointDraft(reset.settings.defaultReorderPoint)).toBe('37');
  });
});
