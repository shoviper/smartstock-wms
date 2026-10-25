import { describe, expect, it } from 'vitest';
import { createSeedBusinessData } from '../data/seed';
import { DEFAULT_MOVEMENT_FILTERS, filterAndSortMovements, parseMovementQuery, selectMovementRows, serializeMovementQuery } from './movements';
import type { StoreState } from './models';
import { createReportFilename, formatReportMovementTime, selectInventoryReport, selectLowStockReport, selectMovementReport, toCsv } from './reports';

function state(): StoreState {
  return { ...createSeedBusinessData(), currentUserId: null, session: null, theme: 'light', feedback: null };
}

describe('reports', () => {
  it('writes UTF-8 BOM and escapes commas, quotes, newlines, empty cells and Thai text', () => {
    const csv = toCsv(['SKU', 'Name', 'Note', 'Empty'], [['SKU-1', 'ภาษาไทย, "ดี"', 'first\nsecond', null]]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('\uFEFFSKU,Name,Note,Empty\r\nSKU-1,"ภาษาไทย, ""ดี""","first\nsecond",');
  });

  it('uses Bangkok time and an injected now for report filenames', () => {
    const now = new Date('2026-10-25T07:30:00.000Z');
    expect(createReportFilename('movements', now)).toBe('smartstock-movements-20261025-1430.csv');
  });

  it('formats Movement timestamps in Bangkok time for the preview and CSV', () => {
    const timestamp = '2026-10-24T12:00:00.000Z';
    expect(formatReportMovementTime(timestamp, 'display')).toBe('24 Oct 2026 19:00');
    expect(formatReportMovementTime(timestamp, 'csv')).toBe('2026-10-24 19:00');
  });

  it('exports every matching movement using the shared filter and URL helpers', () => {
    const data = state();
    const now = new Date('2026-10-25T12:00:00.000Z');
    const original = { ...DEFAULT_MOVEMENT_FILTERS, range: '30d' as const, types: ['PICK'] as const, search: 'SKU-00', page: 3 };
    const filters = parseMovementQuery(serializeMovementQuery({ ...original, types: [...original.types] }));
    const expected = filterAndSortMovements(selectMovementRows(data), filters, now);
    const reportRows = selectMovementReport(data, filters, now);
    expect(reportRows).toEqual(expected);
    expect(reportRows.length).toBe(expected.length);
    expect(filters.page).toBe(3);
  });

  it('includes only Low, Critical and Out statuses in the reorder report', () => {
    const data = state();
    const rows = selectLowStockReport(data, new Date('2026-10-25T12:00:00.000Z'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(({ status }) => ['LOW', 'CRITICAL', 'OUT'].includes(status))).toBe(true);
    expect(rows.length).toBe(selectInventoryReport(data).filter(({ status }) => status !== 'NORMAL').length);
    const rank = { OUT: 0, CRITICAL: 1, LOW: 2, NORMAL: 3 };
    expect(rows).toEqual([...rows].sort((left, right) => rank[left.status] - rank[right.status] || left.sku.localeCompare(right.sku)));
    expect(rows.every(({ calculation, suggestedAction }) => Boolean(calculation && suggestedAction))).toBe(true);
  });

  it('keeps signed quantities numeric in report rows', () => {
    const rows = selectMovementReport(state(), DEFAULT_MOVEMENT_FILTERS, new Date('2026-10-25T12:00:00.000Z'));
    expect(rows.some(({ movement }) => movement.qty < 0)).toBe(true);
    expect(rows.filter(({ movement }) => movement.qty < 0).every(({ movement }) => typeof movement.qty === 'number')).toBe(true);
  });
});
