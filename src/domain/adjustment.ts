import type { Role } from './models';
import { parseWholeNumber } from './validation';

export const ADJUSTMENT_REASONS = [
  'Cycle count correction', 'Damaged goods', 'Lost / missing', 'Found stock', 'Data entry error', 'Other',
] as const;
export type AdjustmentReason = typeof ADJUSTMENT_REASONS[number];

export interface AdjustmentValidationInput {
  countedRaw: string;
  systemQty: number;
  capacity: number;
  reason: string;
  otherReason?: string;
  role: Role | null;
}

export interface AdjustmentValidationResult {
  valid: boolean;
  countedQty: number | null;
  reasonText: string;
  errors: string[];
}

export function validateAdjustmentInput(input: AdjustmentValidationInput): AdjustmentValidationResult {
  const errors: string[] = [];
  const parsed = parseWholeNumber(input.countedRaw);
  if (!parsed.ok) errors.push(parsed.message);
  else if (parsed.value > input.capacity) errors.push(`Counted quantity cannot exceed location capacity of ${input.capacity}.`);
  if (!ADJUSTMENT_REASONS.includes(input.reason as AdjustmentReason)) errors.push('Select an adjustment reason.');
  if (input.reason === 'Other' && !input.otherReason?.trim()) errors.push('Enter a reason for Other.');
  if (parsed.ok && parsed.value <= input.capacity && parsed.value !== input.systemQty) {
    const difference = parsed.value - input.systemQty;
    if (difference > 0 && ['Lost / missing', 'Damaged goods'].includes(input.reason)) {
      errors.push('Count is higher than system — choose Found stock, Data entry error or Other.');
    } else if (difference < 0 && input.reason === 'Found stock') {
      errors.push('Count is lower than system — Found stock does not apply.');
    }
  }
  if (input.role !== 'MANAGER' && input.role !== 'ADMIN') errors.push('Only a Manager or Admin can adjust stock.');
  const details = input.reason === 'Other' ? input.otherReason?.trim() : '';
  return {
    valid: errors.length === 0,
    countedQty: parsed.ok ? parsed.value : null,
    reasonText: [input.reason, details?.trim()].filter(Boolean).join(': '),
    errors,
  };
}

export function isLargeVariance(systemQty: number, counted: number): boolean {
  const difference = Math.abs(counted - systemQty);
  return difference >= 10 || (systemQty > 0 && difference >= 3 && difference / systemQty >= 0.2);
}
