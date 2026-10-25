import type { StoreState } from './models';
import { selectInventoryRows } from './inventory';
import { filterAndSortMovements, selectMovementRows, type MovementFilters } from './movements';
import { filterStockoutPredictions, selectStockoutInsights } from './insights';
import { DASHBOARD_ATTENTION_STATUSES, DASHBOARD_TIME_ZONE } from './dashboard';

export type CsvCell = string | number | null | undefined;

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const escape = (value: CsvCell) => {
    const text = value == null ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `\uFEFF${[headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')}`;
}

export function createReportFilename(report: 'inventory' | 'low-stock' | 'movements', now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const timestamp = `${value('year')}${value('month')}${value('day')}-${value('hour')}${value('minute')}`;
  return `smartstock-${report}-${timestamp}.csv`;
}

export function formatReportMovementTime(timestamp: string, format: 'display' | 'csv'): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return timestamp;
  const numericParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const value = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const year = value(numericParts, 'year');
  const month = value(numericParts, 'month');
  const day = value(numericParts, 'day');
  const hour = value(numericParts, 'hour');
  const minute = value(numericParts, 'minute');
  if (format === 'csv') return `${year}-${month}-${day} ${hour}:${minute}`;
  const displayParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: DASHBOARD_TIME_ZONE, month: 'short',
  }).formatToParts(date);
  return `${day} ${value(displayParts, 'month')} ${year} ${hour}:${minute}`;
}

export function selectInventoryReport(state: StoreState) {
  return selectInventoryRows(state).map(({ product, status }) => ({
    sku: product.sku,
    name: product.name,
    category: product.category,
    unit: product.unit,
    onHand: product.onHand,
    location: state.locations[product.locationId]?.id ?? product.locationId,
    reorderPoint: product.reorderPoint,
    status,
  }));
}

export function selectLowStockReport(state: StoreState, now: Date) {
  const insights = selectStockoutInsights(state, now);
  const statusOrder = new Map(DASHBOARD_ATTENTION_STATUSES.map((status, index) => [status, index]));
  return filterStockoutPredictions(insights.predictions, 'ALL')
    .filter(({ stockStatus }) => stockStatus === 'LOW' || stockStatus === 'CRITICAL' || stockStatus === 'OUT')
    .map(({ product, stockStatus, recommendedReplenishment, calculation, suggestedAction }) => ({
      sku: product.sku, name: product.name, onHand: product.onHand,
      reorderPoint: product.reorderPoint, status: stockStatus,
      recommendedReplenishment,
      calculation,
      suggestedAction,
    }))
    .sort((left, right) => statusOrder.get(left.status)! - statusOrder.get(right.status)!
      || left.sku.localeCompare(right.sku));
}

export function selectMovementReport(state: StoreState, filters: MovementFilters, now: Date) {
  return filterAndSortMovements(selectMovementRows(state), filters, now);
}
