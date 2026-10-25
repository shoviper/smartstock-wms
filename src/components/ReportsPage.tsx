import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  MOVEMENT_TYPES, parseMovementQuery, serializeMovementQuery,
} from '../domain/movements';
import { createReportFilename, formatReportMovementTime, selectInventoryReport, selectLowStockReport, selectMovementReport, toCsv } from '../domain/reports';
import { useStore } from '../store/StoreProvider';

function downloadCsv(name: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ReportCard({ title, description, headers, rows, file, preview, previewHeaders, previewNote }: {
  title: string; description: string; headers: string[]; rows: (string | number)[][]; file: string; preview?: boolean;
  previewHeaders?: string[]; previewNote?: string;
}) {
  const sample = preview ? rows.slice(0, 10) : rows;
  const visibleHeaders = previewHeaders ?? headers;
  return <section aria-label={title} className="report-card">
    <div className="report-card-heading"><div><h2>{title}</h2><p>{description}</p></div><span className="report-row-count">{rows.length} rows</span></div>
    <div className="report-table-wrap"><table className="report-table"><thead><tr>{visibleHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>
      {sample.map((row, index) => <tr key={index}>{row.slice(0, visibleHeaders.length).map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}
    </tbody></table></div>
    {rows.length === 0 && <p className="report-empty">No rows match this report.</p>}
    {preview && rows.length > 10 && <p className="report-preview-note">Showing the first 10 of {rows.length} rows.</p>}
    {previewNote && <p className="report-preview-note">{previewNote}</p>}
    <button className="primary-button report-download" disabled={rows.length === 0} onClick={() => downloadCsv(file, toCsv(headers, rows))} type="button">Download CSV</button>
  </section>;
}

export function ReportsPage() {
  const { state } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const now = useMemo(() => new Date(), [state.movements]);
  const filters = useMemo(() => parseMovementQuery(searchParams), [searchParams]);
  const inventory = useMemo(() => selectInventoryReport(state), [state.products, state.locations]);
  const lowStock = useMemo(() => selectLowStockReport(state, now), [state.products, state.movements]);
  const movements = useMemo(() => selectMovementReport(state, filters, now), [state.movements, state.products, state.users, state.locations, filters, now]);
  const movementHeaders = ['Time', 'Type', 'SKU', 'Name', 'Quantity', 'Before', 'After', 'Location', 'By', 'Reference', 'Reason'];
  const movementRows = movements.map(({ movement, productName, userName, locationName }) => [
    formatReportMovementTime(movement.timestamp, 'csv'), movement.type, movement.sku, productName, movement.qty,
    movement.qtyBefore, movement.qtyAfter, locationName, userName, movement.reference ?? '', movement.reason,
  ]);
  const movementPreviewRows = movements.map(({ movement, productName, userName, locationName }) => [
    formatReportMovementTime(movement.timestamp, 'display'), movement.type, movement.sku, productName, movement.qty,
    movement.qtyBefore, movement.qtyAfter, locationName, userName, movement.reference ?? '', movement.reason,
  ]);
  const inventoryHeaders = ['SKU', 'Name', 'Category', 'Unit', 'On-hand', 'Location', 'Reorder point', 'Status'];
  const inventoryRows = inventory.map((row) => [row.sku, row.name, row.category, row.unit, row.onHand, row.location, row.reorderPoint, row.status]);
  const lowHeaders = ['SKU', 'Name', 'On-hand', 'Reorder point', 'Status', 'Recommended replenishment', 'Calculation / reason', 'Suggested next action'];
  const lowRows = lowStock.map((row) => [row.sku, row.name, row.onHand, row.reorderPoint, row.status, row.recommendedReplenishment, row.calculation, row.suggestedAction]);
  const rangeLabels = { today: 'Today', '7d': '7 days', '30d': '30 days', all: 'All' } as const;

  function updateFilters(updater: (current: typeof filters) => typeof filters) {
    setSearchParams(serializeMovementQuery(updater(filters)));
  }

  return <main className="page-content reports-page">
    <header className="reports-header"><p className="eyebrow">SMARTSTOCK WMS · REPORTING</p><h1>Reports</h1><p className="intro">Export current store data as CSV for review in spreadsheet tools.</p></header>
    <ReportCard title="Inventory snapshot" description="Current on-hand quantities, locations and stock status across all products." headers={inventoryHeaders} rows={inventoryRows} file={createReportFilename('inventory', now)} preview />
    <ReportCard title="Low-stock & reorder list" description="Simulated data — concept only. Uses on-hand, reorder point, 30-day PICK demand and lead time; review the calculation and verify supplier lead time before ordering." headers={lowHeaders} rows={lowRows} file={createReportFilename('low-stock', now)} preview previewHeaders={lowHeaders.slice(0, 6)} previewNote="CSV includes the calculation, reason and suggested next step for every row." />
    <section className="report-card">
      <div className="report-card-heading"><div><h2>Stock Movements</h2><p>Audit records matching the same movement filter and query rules as Stock Movements.</p></div><span className="report-row-count">{movements.length} rows</span></div>
      <div aria-label="Stock Movements report filters" className="report-filters">
        <label><span>Time range</span><select onChange={(event) => updateFilters((current) => ({ ...current, range: event.target.value as typeof current.range, page: 1 }))} value={filters.range}>{Object.entries(rangeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <fieldset><legend>Type</legend>{MOVEMENT_TYPES.map((type) => <label key={type}><input checked={filters.types.includes(type)} onChange={() => updateFilters((current) => ({ ...current, types: current.types.includes(type) ? current.types.filter((item) => item !== type) : [...current.types, type], page: 1 }))} type="checkbox" />{type}</label>)}</fieldset>
        <label><span>SKU or product name</span><input onChange={(event) => updateFilters((current) => ({ ...current, search: event.target.value, page: 1 }))} placeholder="Search SKU or name" type="search" value={filters.search} /></label>
      </div>
      {movements.length > 0 ? <div className="report-table-wrap"><table className="report-table"><thead><tr>{movementHeaders.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{movementPreviewRows.slice(0, 10).map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : <p className="report-empty">No movements match these filters.</p>}
      {movements.length > 10 && <p className="report-preview-note">Showing the first 10 of {movements.length} rows.</p>}
      <button className="primary-button report-download" disabled={!movements.length} onClick={() => downloadCsv(createReportFilename('movements', now), toCsv(movementHeaders, movementRows))} type="button">Download CSV</button>
    </section>
  </main>;
}
