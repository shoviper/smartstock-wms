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

export function isQuantityReceivable(raw: string, remainingCapacity: number | null): boolean {
  const parsed = parseWholeNumber(raw);
  return parsed.ok
    && parsed.value >= 1
    && remainingCapacity !== null
    && Number.isSafeInteger(remainingCapacity)
    && remainingCapacity >= 0
    && parsed.value <= remainingCapacity;
}
