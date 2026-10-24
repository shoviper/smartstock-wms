import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { getStockStatus, selectOpenOrdersForSku, selectSkuMovementHistory } from '../domain/inventory';
import type { StockStatus } from '../domain/models';
import { useStore } from '../store/StoreProvider';

const statusLabels: Record<StockStatus, string> = { OUT: 'Out', CRITICAL: 'Critical', LOW: 'Low', NORMAL: 'Normal' };

function StatusBadge({ status }: { status: StockStatus }) {
  return <span className={`inventory-status inventory-status-${status.toLowerCase()}`}>{statusLabels[status]}</span>;
}

function formatTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function formatThreshold(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function ProductDetailPage() {
  const { sku = '' } = useParams<{ sku: string }>();
  const location = useLocation();
  const { state, updateReorderPoint, clearFeedback } = useStore();
  const product = state.products[sku];
  const storageLocation = product ? state.locations[product.locationId] : undefined;
  const movements = useMemo(() => selectSkuMovementHistory(state, sku), [state, sku]);
  const openOrders = useMemo(() => selectOpenOrdersForSku(state, sku), [state, sku]);
  const [visibleMovements, setVisibleMovements] = useState(20);
  const [reorderPointDraft, setReorderPointDraft] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const canEditReorderPoint = state.session?.role === 'MANAGER' || state.session?.role === 'ADMIN';
  const canReceiveStock = ['RECEIVER', 'MANAGER', 'ADMIN'].includes(state.session?.role ?? '');

  useEffect(() => {
    if (product) setReorderPointDraft(String(product.reorderPoint));
  }, [product?.sku, product?.reorderPoint]);

  if (!product) {
    return (
      <main className="page-content product-not-found">
        <Link className="product-back-link" to={`/inventory${location.search}`}>← Back to Inventory</Link>
        <section className="product-not-found-card"><h1>Product not found</h1><p>No product matches SKU {sku || '—'}.</p><Link className="product-primary-link" to={`/inventory${location.search}`}>Back to Inventory</Link></section>
      </main>
    );
  }

  const stockStatus = getStockStatus(product);
  const criticalThreshold = product.reorderPoint * 0.5;
  const capacity = storageLocation?.capacity ?? 0;
  const capacityPercent = capacity > 0 ? product.onHand / capacity * 100 : 0;
  const fillPercent = Math.max(0, Math.min(100, capacityPercent));
  const markerPosition = (threshold: number) => capacity > 0 ? Math.max(0, Math.min(100, threshold / capacity * 100)) : 0;
  const tickTransform = (position: number) => position <= 0 ? 'translateX(0)' : position >= 100 ? 'translateX(-100%)' : 'translateX(-50%)';
  const parsedReorderPoint = Number(reorderPointDraft);
  const isIntegerInput = /^\d+$/.test(reorderPointDraft.trim()) && Number.isInteger(parsedReorderPoint);
  const validationError = !isIntegerInput || parsedReorderPoint < 1
    ? 'Enter a whole number of at least 1.'
    : parsedReorderPoint > capacity
      ? `Reorder point cannot exceed the location capacity of ${capacity}.`
      : '';
  const isReorderPointChanged = parsedReorderPoint !== product.reorderPoint;
  const reorderPointError = validationError || (submitted && state.feedback?.kind === 'error' ? state.feedback.message : '');

  function handleReorderPointSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    updateReorderPoint(product.sku, Number(reorderPointDraft));
  }

  function handleReorderPointChange(value: string) {
    setReorderPointDraft(value);
    setSubmitted(false);
    clearFeedback();
  }

  return (
    <main className="page-content product-detail-page">
      <Link className="product-back-link" to={`/inventory${location.search}`}>← Back to Inventory</Link>
      <header className="product-detail-header">
        <div><p className="eyebrow">SMARTSTOCK WMS · PRODUCT DETAIL</p><h1>{product.name}</h1><p className="product-detail-subtitle">{product.sku} <span>·</span> {product.category}</p></div>
        {canReceiveStock && <Link className="product-primary-link" to={`/receiving?sku=${encodeURIComponent(product.sku)}`}>Receive stock</Link>}
        <StatusBadge status={stockStatus} />
      </header>

      <section aria-label="Product information" className="product-detail-grid">
        <article className="product-detail-card"><span>On-hand</span><strong>{product.onHand} <small>{product.unit}</small></strong></article>
        <article className="product-detail-card"><span>Reorder point</span><strong>{product.reorderPoint} <small>{product.unit}</small></strong></article>
        <article className="product-detail-card"><span>Critical threshold (50%)</span><strong>{formatThreshold(criticalThreshold)} <small>{product.unit}</small></strong></article>
        <article className="product-detail-card"><span>Lead time</span><strong>{product.leadTimeDays} <small>days</small></strong></article>
        <article className="product-detail-card"><span>Location</span><strong>{product.locationId}</strong>{storageLocation && <small className="product-location-description">Zone {storageLocation.zone} · Aisle {storageLocation.aisle} · Rack {storageLocation.rack} · Level {storageLocation.level}</small>}</article>
        <article className="product-detail-card"><span>Location capacity</span><strong>{storageLocation ? `${storageLocation.capacity} ${product.unit}` : 'Unavailable'}</strong></article>
        <article className="product-detail-card"><span>Capacity used</span><strong>{storageLocation ? `${capacityPercent.toFixed(1)}%` : 'Unavailable'}</strong></article>
        <article className="product-detail-card"><span>From dispatch point</span><strong>{storageLocation ? `${storageLocation.dispatchDistanceMeters} m` : 'Unavailable'}</strong></article>
      </section>

      <section aria-label="Stock level" className="product-section-card product-stock-section">
        <div className="product-section-heading"><div><h2>Stock level</h2><p>On-hand compared with critical, reorder and location capacity thresholds.</p></div><strong>{product.onHand} {product.unit} on-hand</strong></div>
        <div aria-label={`On-hand ${product.onHand} ${product.unit}, critical threshold ${formatThreshold(criticalThreshold)} ${product.unit}, reorder point ${product.reorderPoint} ${product.unit}, capacity ${capacity} ${product.unit}`} className={`stock-level-track stock-level-${stockStatus.toLowerCase()}`} role="img">
          <span className="stock-level-fill" style={{ width: `${fillPercent}%` }} />
          <span className="stock-level-marker stock-marker-critical" style={{ left: `${markerPosition(criticalThreshold)}%`, transform: tickTransform(markerPosition(criticalThreshold)) }} />
          <span className="stock-level-marker stock-marker-reorder" style={{ left: `${markerPosition(product.reorderPoint)}%`, transform: tickTransform(markerPosition(product.reorderPoint)) }} />
          <span className="stock-level-marker stock-marker-capacity" style={{ left: '100%', transform: 'translateX(-100%)' }} />
          <span className="stock-level-current-marker" style={{ left: `${fillPercent}%`, transform: fillPercent <= 0 ? 'translate(0, -50%)' : fillPercent >= 100 ? 'translate(-100%, -50%)' : 'translate(-50%, -50%)' }} />
        </div>
        <div aria-hidden="true" className="stock-level-scale"><span>0</span><span>Capacity · {capacity || 'Unavailable'}</span></div>
        <div aria-label="Stock level legend" className="stock-level-legend">
          <span className="stock-level-legend-item"><span aria-hidden="true" className={`stock-legend-symbol stock-legend-on-hand stock-legend-on-hand-${stockStatus.toLowerCase()}`} /><span>On-hand · {product.onHand} {product.unit}</span></span>
          <span className="stock-level-legend-item"><span aria-hidden="true" className="stock-legend-symbol stock-legend-critical" /><span>Critical threshold · {formatThreshold(criticalThreshold)} {product.unit}</span></span>
          <span className="stock-level-legend-item"><span aria-hidden="true" className="stock-legend-symbol stock-legend-reorder" /><span>Reorder point · {product.reorderPoint} {product.unit}</span></span>
          <span className="stock-level-legend-item"><span aria-hidden="true" className="stock-legend-symbol stock-legend-capacity" /><span>Capacity · {capacity || 'Unavailable'} {capacity ? product.unit : ''}</span></span>
        </div>
      </section>

      <section aria-label="Reorder point setting" className="product-section-card reorder-point-section">
        <div className="product-section-heading"><div><h2>Reorder point</h2><p>Set the threshold used for stock status and alerts.</p></div><strong>{product.reorderPoint} {product.unit}</strong></div>
        {canEditReorderPoint ? (
          <form className="reorder-point-form" onSubmit={handleReorderPointSubmit}>
            <div className="reorder-point-input-row">
              <label htmlFor="reorder-point-input">New reorder point</label>
              <input aria-describedby="reorder-point-help" aria-invalid={Boolean(reorderPointError)} id="reorder-point-input" max={capacity || undefined} min="1" onChange={(event) => handleReorderPointChange(event.target.value)} step="1" type="number" value={reorderPointDraft} />
              <button className="product-primary-button" disabled={Boolean(validationError) || !isReorderPointChanged} type="submit">Save</button>
            </div>
            <p className={`reorder-point-hint${reorderPointError ? ' reorder-point-hint-error' : ''}`} id="reorder-point-help">{reorderPointError || `Enter a whole number from 1 to ${capacity} ${product.unit}.`}</p>
            <p aria-live="polite" className={`reorder-point-feedback${submitted && state.feedback?.kind === 'success' ? ' feedback-success' : ''}`}>{submitted && state.feedback?.kind === 'success' ? state.feedback.message : ''}</p>
          </form>
        ) : <p className="product-readonly-note">Read only for your role. Current reorder point: {product.reorderPoint} {product.unit}.</p>}
      </section>

      <section aria-label="Open orders containing this product" className="product-section-card">
        <div className="product-section-heading"><div><h2>Open orders</h2><p>Orders that are not yet finished and include this SKU.</p></div></div>
        {openOrders.length === 0 ? <p className="product-empty-note">No open orders include this product.</p> : <div className="product-open-orders">{openOrders.map(({ order, quantity, pickedQuantity }) => <article className="product-order-row" key={order.id}><strong>{order.id}</strong><span>{quantity} {product.unit} to pick{pickedQuantity > 0 ? ` · ${pickedQuantity} picked` : ''}</span><span className={`product-order-status product-order-${order.status.toLowerCase()}`}>{order.status.replaceAll('_', ' ')}</span></article>)}</div>}
      </section>

      <section aria-label="Movement history" className="product-section-card product-movements-section">
        <div className="product-section-heading"><div><h2>Movement history</h2><p>{movements.length} records for {product.sku}, newest first.</p></div></div>
        {movements.length === 0 ? <p className="product-empty-note">No Movement history for this product.</p> : <div className="product-movement-list">{movements.slice(0, visibleMovements).map((movement) => {
          const actor = state.users[movement.userId];
          return <article className="product-movement-row" key={movement.id}>
            <div className="movement-row-top"><time dateTime={movement.timestamp}>{formatTimestamp(movement.timestamp)}</time><span className={`movement-type-badge movement-type-${movement.type.toLowerCase()}`}>{movement.type}</span></div>
            <dl><div><dt>Quantity</dt><dd className={movement.qty < 0 ? 'movement-quantity-negative' : 'movement-quantity-positive'}>{movement.qty > 0 ? '+' : ''}{movement.qty} {product.unit}</dd></div><div><dt>Before → After</dt><dd>{movement.qtyBefore} → {movement.qtyAfter}</dd></div><div><dt>By</dt><dd>{actor?.name ?? movement.userId}</dd></div><div><dt>Reference / Reason</dt><dd>{movement.reference ?? '—'}{movement.reason ? ` · ${movement.reason}` : ''}</dd></div></dl>
          </article>;
        })}</div>}
        {movements.length > visibleMovements && <button className="product-show-more" onClick={() => setVisibleMovements((count) => count + 20)} type="button">Show more</button>}
      </section>
    </main>
  );
}
