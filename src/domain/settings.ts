import { getRoleCapabilities } from './access';
import type { StoreState } from './models';
import { parseWholeNumber } from './validation';

export const DEFAULT_REORDER_POINT = 10;
export const MIN_DEFAULT_REORDER_POINT = 1;
export const MAX_DEFAULT_REORDER_POINT = Number.MAX_SAFE_INTEGER;

export type DefaultReorderPointValidation =
  | { valid: true; value: number }
  | { valid: false; message: string };

export type SettingsErrorCode = 'FORBIDDEN' | 'INVALID_DEFAULT_REORDER_POINT';

export class SettingsActionError extends Error {
  constructor(message: string, readonly code: SettingsErrorCode) {
    super(message);
    this.name = 'SettingsActionError';
  }
}

export function validateDefaultReorderPointValue(value: number): DefaultReorderPointValidation {
  if (!Number.isSafeInteger(value) || value < MIN_DEFAULT_REORDER_POINT || value > MAX_DEFAULT_REORDER_POINT) {
    return {
      valid: false,
      message: `Default reorder point must be a whole number from ${MIN_DEFAULT_REORDER_POINT} to ${MAX_DEFAULT_REORDER_POINT.toLocaleString('en-US')}.`,
    };
  }
  return { valid: true, value };
}

export function validateDefaultReorderPointInput(raw: string): DefaultReorderPointValidation {
  const parsed = parseWholeNumber(raw);
  if (!parsed.ok) return { valid: false, message: parsed.message };
  return validateDefaultReorderPointValue(parsed.value);
}

export function resetDefaultReorderPointDraft(savedValue: number): string {
  return String(savedValue);
}

export function updateDefaultReorderPoint(state: StoreState, value: number): StoreState {
  if (!state.session || !getRoleCapabilities(state.session.role).canUpdateReorderPoint) {
    throw new SettingsActionError('Only a Manager or Admin can update Settings.', 'FORBIDDEN');
  }
  const validation = validateDefaultReorderPointValue(value);
  if (!validation.valid) throw new SettingsActionError(validation.message, 'INVALID_DEFAULT_REORDER_POINT');
  return { ...state, settings: { ...state.settings, defaultReorderPoint: validation.value } };
}
