import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  DEFAULT_MOVEMENT_FILTERS,
  MOVEMENT_TYPES,
  filterAndSortMovements,
  hasActiveMovementFilters,
  paginateMovements,
  parseMovementQuery,
  selectMovementRows,
  serializeMovementQuery,
  summarizeMovements,
  toggleMovementSort,
  type MovementFilters,
  type MovementRow,
  type MovementSort,
} from '../domain/movements';
import { useStore } from '../store/StoreProvider';

const rangeLabels = { today: 'Today', '7d': '7 days', '30d': '30 days', all: 'All' } as const;
const sortLabels: [MovementSort, string][] = [
  ['timestamp', 'Time'], ['type', 'Type'], ['sku', 'Product'], ['qty', 'Quantity'], ['qtyBefore', 'Before → After'],
  ['location', 'Location'], ['user', 'By'], ['reference', 'Reference / Reason'],
];

function formatTime(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function signedQuantity(qty: number) {
  if (qty === 0) return '0';
  return `${qty > 0 ? '+' : '−'}${Math.abs(qty)}`;
}

function TypeBadge({ type }: { type: string }) {
  return <span className={`movement-type-badge movement-type-${type.toLowerCase()}`}>{type}</span>;
}

function MovementDetails({ row }: { row: MovementRow }) {
  const { movement } = row;
  return <dl>
    <div><dt>Quantity</dt><dd className={movement.qty < 0 ? 'movement-quantity-negative' : 'movement-quantity-positive'}>{signedQuantity(movement.qty)}</dd></div>
    <div><dt>Before → After</dt><dd>{movement.qtyBefore} → {movement.qtyAfter}</dd></div>
    <div><dt>Location</dt><dd>{row.locationName}</dd></div>
    <div><dt>By</dt><dd>{row.userName}</dd></div>
    <div><dt>Reference / Reason</dt><dd>{movement.reference || '—'}{movement.reason ? ` · ${movement.reason}` : ''}</dd></div>
  </dl>;
}

export function StockMovementsPage() {
  const { state } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const resultsRef = useRef<HTMLElement>(null);
  const pendingPageDirection = useRef<'next' | 'previous' | null>(null);
  const previousButtonRef = useRef<HTMLButtonElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const filters = useMemo(() => parseMovementQuery(searchParams), [searchParams]);
  const rows = useMemo(() => selectMovementRows(state), [state.movements, state.products, state.users, state.locations]);
  const now = useMemo(() => new Date(), [state.movements]);
  const filtered = useMemo(() => filterAndSortMovements(rows, filters, now), [rows, filters, now]);
  const summary = useMemo(() => summarizeMovements(filtered), [filtered]);
  const page = useMemo(() => paginateMovements(filtered, filters.page), [filtered, filters.page]);
  const actors = useMemo(() => [...new Map(rows.map(({ movement, userName }) => [movement.userId, userName])).entries()]
    .sort((left, right) => left[1].localeCompare(right[1])), [rows]);

  useEffect(() => {
    if (page.page !== filters.page) {
      const next = { ...filters, page: page.page };
      setSearchParams(serializeMovementQuery(next), { replace: true });
    }
  }, [filters, page.page, setSearchParams]);

  useLayoutEffect(() => {
    const direction = pendingPageDirection.current;
    if (!direction || !resultsRef.current) return;
    pendingPageDirection.current = null;
    const container = resultsRef.current;
    const behavior: ScrollBehavior = 'auto';
    if (direction === 'next') {
      const listStart = [...container.querySelectorAll<HTMLElement>('.movements-table-wrap, .movements-cards')]
        .find((element) => element.getClientRects().length > 0);
      if (!listStart) return;
      const topbar = document.querySelector<HTMLElement>('.topbar');
      const offset = topbar?.getBoundingClientRect().height ?? 0;
      window.scrollTo({ top: Math.max(0, window.scrollY + listStart.getBoundingClientRect().top - offset - 12), behavior });
    } else {
      const pagination = container.querySelector<HTMLElement>('.movements-pagination');
      pagination?.scrollIntoView({ block: 'end', behavior });
    }

    const targetButton = direction === 'next' ? nextButtonRef.current : previousButtonRef.current;
    if (targetButton && !targetButton.disabled) targetButton.focus({ preventScroll: true });
    else resultsHeadingRef.current?.focus({ preventScroll: true });
  }, [filters.page]);

  function updateFilters(updater: (current: MovementFilters) => MovementFilters) {
    setSearchParams(serializeMovementQuery(updater(filters)));
  }

  function clearFilters() {
    setSearchParams(serializeMovementQuery(DEFAULT_MOVEMENT_FILTERS));
  }

  function sortButton(key: MovementSort, label: string) {
    const marker = filters.sort === key ? (filters.direction === 'asc' ? ' ↑' : ' ↓') : '';
    return <button aria-label={`Sort by ${label}`} onClick={() => updateFilters((current) => toggleMovementSort(current, key))} type="button">{label}{marker}</button>;
  }

  return <main className="page-content movements-page">
    <header className="movements-header"><div><p className="eyebrow">SMARTSTOCK WMS · AUDIT LOG</p><h1>Stock Movements</h1><p className="intro">Review and filter stock changes recorded in the store.</p></div><Link className="movements-export-link" to={`/reports${serializeMovementQuery(filters).size ? `?${serializeMovementQuery(filters)}` : ''}`}>Export this view</Link></header>

    <section aria-label="Movement filters" className="movements-filters">
      <label className="inventory-filter-field movements-filter-field"><span className="inventory-filter-label">Time range</span><select onChange={(event) => updateFilters((current) => ({ ...current, range: event.target.value as MovementFilters['range'], page: 1 }))} value={filters.range}>{Object.entries(rangeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <div aria-label="Type" className="inventory-status-filter movements-type-filter" role="group"><span className="inventory-filter-label">Type</span><div className="inventory-status-options movements-type-options">{MOVEMENT_TYPES.map((type) => <label aria-label={type} className={`inventory-status-chip${filters.types.includes(type) ? ' inventory-status-chip-selected' : ''}`} key={type}><input checked={filters.types.includes(type)} onChange={() => updateFilters((current) => ({ ...current, types: current.types.includes(type) ? current.types.filter((item) => item !== type) : [...current.types, type], page: 1 }))} type="checkbox" /><span>{type}</span></label>)}</div></div>
      <label className="inventory-filter-field movements-filter-field"><span className="inventory-filter-label">SKU or product name</span><input onChange={(event) => updateFilters((current) => ({ ...current, search: event.target.value, page: 1 }))} placeholder="Search SKU or name" type="search" value={filters.search} /></label>
      <label className="inventory-filter-field movements-filter-field"><span className="inventory-filter-label">Actor</span><select onChange={(event) => updateFilters((current) => ({ ...current, userId: event.target.value, page: 1 }))} value={filters.userId}><option value="">All users</option>{actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label className="inventory-filter-field movements-filter-field"><span className="inventory-filter-label">Reference</span><input onChange={(event) => updateFilters((current) => ({ ...current, reference: event.target.value, page: 1 }))} placeholder="Search reference" type="search" value={filters.reference} /></label>
    </section>

    <section aria-label="Movement summary" className="movements-summary">
      <article><span>Matching movements</span><strong>{summary.total}</strong></article>
      <article><span>RECEIVE</span><strong>{summary.byType.RECEIVE}</strong></article>
      <article><span>PICK</span><strong>{summary.byType.PICK}</strong></article>
      <article><span>ADJUST</span><strong>{summary.byType.ADJUST}</strong></article>
      <article><span>Net units</span><strong className={summary.netUnits < 0 ? 'movement-quantity-negative' : summary.netUnits > 0 ? 'movement-quantity-positive' : 'movement-quantity-neutral'}>{signedQuantity(summary.netUnits)}</strong></article>
    </section>

    <div className="inventory-result-toolbar movements-result-toolbar"><span aria-live="polite" className="inventory-result-count">{hasActiveMovementFilters(filters) ? `${filtered.length} of ${rows.length} movements` : `${rows.length} movements`}</span>{hasActiveMovementFilters(filters) && filtered.length > 0 && <button className="inventory-clear-link" onClick={clearFilters} type="button"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8" /></svg>Clear filters</button>}</div>
    {filtered.length === 0 ? <section className="filter-empty-state"><h2>No movements found</h2><p>Try changing the filters to see matching stock movements.</p><button className="inventory-clear-button" onClick={clearFilters} type="button">Clear filters</button></section> : <section aria-label="Movement results" className="movements-results" ref={resultsRef}>
      <h2 className="movements-results-heading" ref={resultsHeadingRef} tabIndex={-1}>Movement records</h2>
      <div className="inventory-table-wrap movements-table-wrap"><table className="inventory-table movements-table"><thead><tr>{sortLabels.map(([key, label]) => <th key={key} scope="col">{sortButton(key, label)}</th>)}</tr></thead><tbody>{page.rows.map((row) => {
        const { movement } = row;
        return <tr className="movement-record" key={movement.id}>
          <td><time dateTime={movement.timestamp}>{formatTime(movement.timestamp)}</time></td>
          <td><TypeBadge type={movement.type} /></td>
          <td><strong className="inventory-sku">{movement.sku}</strong><span className="movement-product-name">{row.productName}</span></td>
          <td className={movement.qty < 0 ? 'movement-quantity-negative' : 'movement-quantity-positive'}>{signedQuantity(movement.qty)}</td>
          <td>{movement.qtyBefore} → {movement.qtyAfter}</td><td>{row.locationName}</td><td>{row.userName}</td>
          <td>{movement.reference || '—'}{movement.reason ? <span className="movement-product-name">{movement.reason}</span> : null}</td>
        </tr>;
      })}</tbody></table></div>
      <div aria-label="Movement cards" className="movements-cards">{page.rows.map((row) => <article className="movements-card movement-record" key={row.movement.id}>
        <div className="movements-card-heading"><div><strong>{row.movement.sku}</strong><span>{row.productName}</span></div><TypeBadge type={row.movement.type} /></div>
        <time dateTime={row.movement.timestamp}>{formatTime(row.movement.timestamp)}</time><MovementDetails row={row} />
      </article>)}</div>
      <nav aria-label="Movement pages" className="movements-pagination"><span>Showing {filtered.length ? (page.page - 1) * page.pageSize + 1 : 0}–{Math.min(page.page * page.pageSize, page.total)} of {page.total} matching movements</span><div><button aria-disabled={page.page <= 1} aria-label="Previous page" disabled={page.page <= 1} onClick={() => { pendingPageDirection.current = 'previous'; updateFilters((current) => ({ ...current, page: current.page - 1 })); }} ref={previousButtonRef} type="button">Previous</button><span>Page {page.page} of {page.pageCount}</span><button aria-disabled={page.page >= page.pageCount} aria-label="Next page" disabled={page.page >= page.pageCount} onClick={() => { pendingPageDirection.current = 'next'; updateFilters((current) => ({ ...current, page: current.page + 1 })); }} ref={nextButtonRef} type="button">Next</button></div></nav>
    </section>}
  </main>;
}
