import { useMemo, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { filterAndSortInventory, hasActiveInventoryFilters, parseInventoryQuery, resetInventoryFilters, selectInventoryFacets, selectInventoryRows, serializeInventoryQuery, toggleInventorySort, type InventoryFilters, type InventorySort } from '../domain/inventory';
import type { StockStatus } from '../domain/models';
import { useStore } from '../store/StoreProvider';

const labels: Record<StockStatus, string> = { OUT: 'Out', CRITICAL: 'Critical', LOW: 'Low', NORMAL: 'Normal' };
const statusOrder: StockStatus[] = ['OUT', 'CRITICAL', 'LOW', 'NORMAL'];

function StatusBadge({ status }: { status: StockStatus }) {
  return <span className={`inventory-status inventory-status-${status.toLowerCase()}`}>{labels[status]}</span>;
}

export function InventoryPage() {
  const { state } = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const facets = useMemo(() => selectInventoryFacets(state), [state]);
  const filters = parseInventoryQuery(searchParams, facets.categories, facets.zones);
  const rows = useMemo(() => filterAndSortInventory(selectInventoryRows(state), filters), [state, filters]);
  const allRows = useMemo(() => selectInventoryRows(state), [state]);

  function updateFilters(update: Partial<InventoryFilters>) {
    setSearchParams(serializeInventoryQuery({ ...filters, ...update }));
  }
  function toggleStatus(status: StockStatus) {
    updateFilters({ statuses: filters.statuses.includes(status) ? filters.statuses.filter((item) => item !== status) : [...filters.statuses, status] });
  }
  function sortBy(sort: InventorySort) {
    setSearchParams(serializeInventoryQuery(toggleInventorySort(filters, sort)));
  }
  function sortIndicator(sort: InventorySort) {
    return <span aria-hidden="true" className={`inventory-sort-icon${filters.sort === sort ? ' inventory-sort-icon-active' : ''}`}>{filters.sort === sort ? (filters.direction === 'asc' ? '▲' : '▼') : '↕'}</span>;
  }
  function sortValue(sort: InventorySort) {
    return filters.sort === sort ? (filters.direction === 'asc' ? 'ascending' : 'descending') : 'none';
  }
  function clearFilters() {
    setSearchParams(serializeInventoryQuery(resetInventoryFilters()));
  }
  function openProduct(sku: string) {
    navigate(`/inventory/${encodeURIComponent(sku)}${location.search}`);
  }
  function handleRowKeyDown(event: KeyboardEvent<HTMLElement>, sku: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openProduct(sku);
    }
  }

  return (
    <main className="page-content inventory-page">
      <p className="eyebrow">SMARTSTOCK WMS · INVENTORY</p>
      <h1>Inventory</h1>
      <p className="intro">Search and review current stock across warehouse locations.</p>
      <div aria-label="Product counts by stock status" className="inventory-summary">
        {statusOrder.map((status) => {
          const count = allRows.filter((row) => row.status === status).length;
          return <button aria-pressed={filters.statuses.includes(status)} className={`inventory-summary-card inventory-summary-${status.toLowerCase()}`} key={status} onClick={() => toggleStatus(status)} type="button"><span>{labels[status]}</span><strong>{count}</strong></button>;
        })}
      </div>
      <section aria-label="Inventory filters" className="inventory-filters">
        <label className="inventory-filter-field"><span className="inventory-filter-label">Search</span><input onChange={(event) => updateFilters({ search: event.target.value })} placeholder="SKU or product name" type="search" value={filters.search} /></label>
        <label className="inventory-filter-field"><span className="inventory-filter-label">Category</span><select onChange={(event) => updateFilters({ category: event.target.value })} value={filters.category}><option value="">All categories</option>{facets.categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        <label className="inventory-filter-field"><span className="inventory-filter-label">Zone</span><select onChange={(event) => updateFilters({ zone: event.target.value })} value={filters.zone}><option value="">All zones</option>{facets.zones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}</select></label>
        <div aria-label="Status" className="inventory-status-filter" role="group"><span className="inventory-filter-label">Status</span><div className="inventory-status-options">{statusOrder.map((status) => <label className={`inventory-status-chip${filters.statuses.includes(status) ? ' inventory-status-chip-selected' : ''}`} key={status}><input checked={filters.statuses.includes(status)} onChange={() => toggleStatus(status)} type="checkbox" /><span>{labels[status]}</span></label>)}</div></div>
      </section>
      <div className="inventory-result-toolbar"><span aria-live="polite" className="inventory-result-count">{hasActiveInventoryFilters(filters) ? `${rows.length} of ${allRows.length} products` : `${allRows.length} products`}</span>{hasActiveInventoryFilters(filters) && rows.length > 0 && <button className="inventory-clear-link" onClick={clearFilters} type="button"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8" /></svg>Clear filters</button>}</div>
      {rows.length === 0 ? (
        <section className="filter-empty-state"><h2>No products found</h2><p>Try changing your search or filters.</p><button className="inventory-clear-button" onClick={clearFilters} type="button">Clear filters</button></section>
      ) : (
        <>
          <div className="inventory-table-wrap"><table className="inventory-table"><thead><tr>
            <th aria-sort={sortValue('sku')}><button onClick={() => sortBy('sku')} type="button">SKU{sortIndicator('sku')}</button></th>
            <th aria-sort={sortValue('name')}><button onClick={() => sortBy('name')} type="button">Product name{sortIndicator('name')}</button></th>
            <th>Category</th><th aria-sort={sortValue('onHand')}><button onClick={() => sortBy('onHand')} type="button">On-hand{sortIndicator('onHand')}</button></th><th>Location</th><th>Reorder point</th>
            <th aria-sort={sortValue('status')}><button onClick={() => sortBy('status')} type="button">Status{sortIndicator('status')}</button></th>
          </tr></thead><tbody>{rows.map(({ product, zone, status }) => <tr aria-label={`View product ${product.sku}: ${product.name}`} className="inventory-row-link" key={product.sku} onClick={() => openProduct(product.sku)} onKeyDown={(event) => handleRowKeyDown(event, product.sku)} role="link" tabIndex={0}>
            <td className="inventory-sku">{product.sku}</td><td title={product.name}>{product.name}</td><td>{product.category}</td><td>{product.onHand} {product.unit}</td><td>{product.locationId}{zone ? ` · Zone ${zone}` : ''}</td><td>{product.reorderPoint} {product.unit}</td><td><StatusBadge status={status} /></td>
          </tr>)}</tbody></table></div>
          <div aria-label="Inventory products" className="inventory-cards">{rows.map(({ product, zone, status }) => <article aria-label={`View product ${product.sku}: ${product.name}`} className="inventory-product-card inventory-product-card-link" key={product.sku} onClick={() => openProduct(product.sku)} onKeyDown={(event) => handleRowKeyDown(event, product.sku)} role="link" tabIndex={0}>
            <div className="inventory-card-heading"><div><strong>{product.name}</strong><span>{product.sku}</span></div><StatusBadge status={status} /></div>
            <dl><div><dt>Category</dt><dd>{product.category}</dd></div><div><dt>On-hand</dt><dd>{product.onHand} {product.unit}</dd></div><div><dt>Location</dt><dd>{product.locationId}{zone ? ` · Zone ${zone}` : ''}</dd></div><div><dt>Reorder point</dt><dd>{product.reorderPoint} {product.unit}</dd></div></dl>
          </article>)}</div>
        </>
      )}
    </main>
  );
}
