export type WholeNumberResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

export function parseWholeNumber(raw: string): WholeNumberResult {
  const value = raw.trim();
  if (!/^[0-9]+$/.test(value)) {
    return { ok: false, message: 'Enter digits 0–9 only.' };
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return { ok: false, message: 'Enter a safe whole number.' };
  }
  return { ok: true, value: parsed };
}

export type ReorderPointInputResult =
  | { ok: true; value: number; message: '' }
  | { ok: false; message: string };

export function validateReorderPointInput(raw: string, capacity: number): ReorderPointInputResult {
  if (raw !== raw.trim()) return { ok: false, message: 'Enter a whole number of at least 1.' };
  const parsed = parseWholeNumber(raw);
  if (!parsed.ok) {
    const legacyNumericValue = Number(raw.trim());
    const legacyCapacityError = parsed.message === 'Enter a safe whole number.'
      && Number.isFinite(legacyNumericValue)
      && Number.isInteger(legacyNumericValue);
    return legacyCapacityError
      ? { ok: false, message: `Reorder point cannot exceed the location capacity of ${capacity}.` }
      : { ok: false, message: 'Enter a whole number of at least 1.' };
  }
  if (parsed.value < 1) return { ok: false, message: 'Enter a whole number of at least 1.' };
  if (parsed.value > capacity) return { ok: false, message: `Reorder point cannot exceed the location capacity of ${capacity}.` };
  return { ok: true, value: parsed.value, message: '' };
}

export function isQuantityReceivable(raw: string, remainingCapacity: number | null): boolean {
  const parsed = parseWholeNumber(raw);
  return parsed.ok
    && parsed.value >= 1
    && remainingCapacity !== null
    && Number.isSafeInteger(remainingCapacity)
    && remainingCapacity >= 0
    && parsed.value <= remainingCapacity;
}
