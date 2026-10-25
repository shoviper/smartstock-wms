import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getStockStatus } from '../domain/inventory';
import type { StockStatus } from '../domain/models';
import { isQuantityReceivable, parseWholeNumber } from '../domain/validation';
import { SkuCombobox } from './SkuCombobox';
import { useStore } from '../store/StoreProvider';

const statusLabels: Record<StockStatus, string> = { OUT: 'Out', CRITICAL: 'Critical', LOW: 'Low', NORMAL: 'Normal' };

export function ReceivingPage() {
  const { state, receiveStock, clearFeedback } = useStore();
  const location = useLocation();
  const initialSku = new URLSearchParams(location.search).get('sku') ?? '';
  const [sku, setSku] = useState(initialSku);
  const [quantity, setQuantity] = useState('');
  const [quantityTouched, setQuantityTouched] = useState(false);
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [receivedSku, setReceivedSku] = useState('');
  const submitting = useRef(false);
  const products = useMemo(() => Object.values(state.products).sort((a, b) => a.sku.localeCompare(b.sku)), [state.products]);
  const product = state.products[sku];
  const storageLocation = product ? state.locations[product.locationId] : undefined;
  const availableCapacity = product && storageLocation ? Math.max(0, storageLocation.capacity - product.onHand) : 0;
  const quantityResult = parseWholeNumber(quantity);
  const quantityError = quantity.trim() && !quantityResult.ok
    ? quantityResult.message
    : quantityResult.ok && quantityResult.value < 1
      ? 'Quantity must be at least 1.'
      : '';
  const validQuantity = quantityResult.ok && quantityResult.value >= 1;
  const quantityReceivable = isQuantityReceivable(quantity, product ? availableCapacity : null);
  const capacityError = validQuantity && product && quantityResult.value > availableCapacity
    ? `This location can receive ${availableCapacity} more units.` : '';
  const projectedStock = product && quantityReceivable && quantityResult.ok ? product.onHand + quantityResult.value : null;
  const currentStatus = product ? getStockStatus(product) : null;
  const projectedStatus = product && projectedStock !== null
    ? getStockStatus({ ...product, onHand: projectedStock }) : null;
  const recentReceipts = useMemo(() => state.movements.filter((movement) => movement.type === 'RECEIVE')
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || b.id.localeCompare(a.id)).slice(0, 10), [state.movements]);
  const canReceive = state.session && ['RECEIVER', 'MANAGER', 'ADMIN'].includes(state.session.role);
  const feedback = submitted ? state.feedback : null;
  const submitDisabled = !canReceive || !product || !quantityReceivable || submitting.current;

  function clearFeedbackState() {
    setSubmitted(false);
    clearFeedback();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuantityTouched(true);
    if (submitting.current || !canReceive || !product || !quantityReceivable || !quantityResult.ok || !state.session) return;
    submitting.current = true;
    setSubmitted(true);
    setReceivedSku(product.sku);
    receiveStock({ sku: product.sku, quantity: quantityResult.value, userId: state.session.id, reference: reference.trim() || null, reason: reason.trim() });
    setSku(''); setQuantity(''); setQuantityTouched(false); setReference(''); setReason('');
    submitting.current = false;
  }

  const quantityDescribedBy = ['receiving-quantity-help', (quantityTouched && quantityError) || capacityError ? 'receiving-quantity-error' : null].filter(Boolean).join(' ');

  return <main className="page-content receiving-page">
    <p className="eyebrow">SMARTSTOCK WMS · INVENTORY OPERATIONS</p>
    <h1>Receiving</h1>
    <p className="intro">Record incoming stock at the product’s assigned location.</p>
    <form className="receiving-form product-section-card" onSubmit={handleSubmit}>
      <div className="receiving-fields">
        <div className="receiving-field">
          <label className="receiving-label" htmlFor="receiving-sku">SKU <span aria-hidden="true">*</span></label>
          <SkuCombobox id="receiving-sku" products={products} selectedSku={sku} onSelect={(nextSku) => { setSku(nextSku); clearFeedbackState(); }} onClear={() => { setSku(''); clearFeedbackState(); }} />
        </div>
        <div className="receiving-field">
          <label className="receiving-label" htmlFor="receiving-quantity">Quantity <span aria-hidden="true">*</span></label>
          <input aria-describedby={quantityDescribedBy} aria-invalid={Boolean((quantityTouched && quantityError) || capacityError)} autoComplete="off" id="receiving-quantity" inputMode="numeric" onBlur={() => setQuantityTouched(true)} onChange={(event) => { setQuantity(event.target.value); setQuantityTouched(true); clearFeedbackState(); }} placeholder="Whole number" required type="text" value={quantity} />
          <span className="receiving-help" id="receiving-quantity-help">Enter a whole number of at least 1.</span>
          {(quantityTouched && quantityError || capacityError) && <span className="receiving-error field-error-message" id="receiving-quantity-error" role="alert">{capacityError || quantityError}</span>}
        </div>
        <div className="receiving-field">
          <label className="receiving-label" htmlFor="receiving-reference">Reference <span className="receiving-optional">(optional)</span></label>
          <input id="receiving-reference" onChange={(event) => { setReference(event.target.value); clearFeedbackState(); }} placeholder="Delivery note" value={reference} />
        </div>
        <div className="receiving-field">
          <label className="receiving-label" htmlFor="receiving-reason">Note <span className="receiving-optional">(optional)</span></label>
          <input id="receiving-reason" onChange={(event) => { setReason(event.target.value); clearFeedbackState(); }} placeholder="Additional details" value={reason} />
        </div>
      </div>
      {product && <section aria-label="Selected product summary" className="receiving-summary">
        <h2>Product summary</h2>
        <dl><div><dt>Product</dt><dd>{product.name}</dd></div><div><dt>Category</dt><dd>{product.category}</dd></div><div><dt>On-hand</dt><dd>{product.onHand} {product.unit}</dd></div><div><dt>Assigned location</dt><dd>{product.locationId}</dd></div><div><dt>Capacity available</dt><dd>{availableCapacity} {product.unit}</dd></div><div><dt>Status</dt><dd><span className={`inventory-status inventory-status-${currentStatus?.toLowerCase()}`}>{currentStatus && statusLabels[currentStatus]}</span></dd></div></dl>
      </section>}
      {feedback && <div aria-live="polite" className={`receiving-feedback feedback-banner ${feedback.kind === 'success' ? 'feedback-success feedback-banner-success' : 'feedback-error feedback-banner-error'}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>
        {feedback.kind === 'success' ? <>Receipt saved. <Link to={`/inventory/${encodeURIComponent(receivedSku)}`}>View inventory</Link></> : feedback.message}
      </div>}
      <div className="receiving-actions-row receiving-actions-row-with-preview">
        <section aria-label="Projected result" className="receiving-preview">
          <h2>Preview</h2>
          {projectedStock === null || !product ? <p>Enter a quantity to preview the result.</p> : <p>{product.onHand} → {projectedStock} {product.unit} on-hand · {currentStatus && statusLabels[currentStatus] !== (projectedStatus && statusLabels[projectedStatus])
            ? <><span className={`inventory-status inventory-status-${currentStatus?.toLowerCase()}`}>{currentStatus && statusLabels[currentStatus]}</span> → <span className={`inventory-status inventory-status-${projectedStatus?.toLowerCase()}`}>{projectedStatus && statusLabels[projectedStatus]}</span></>
            : <span className={`inventory-status inventory-status-${currentStatus?.toLowerCase()}`}>{currentStatus && statusLabels[currentStatus]} (no change)</span>}</p>}
        </section>
        <button className="receiving-submit" disabled={submitDisabled} type="submit">Receive stock</button>
      </div>
    </form>
    <section aria-label="Recent receipts" className="product-section-card receiving-recent">
      <div className="product-section-heading"><div><h2>Recent receipts</h2><p>Latest RECEIVE movements from the store.</p></div></div>
      {recentReceipts.length === 0 ? <p className="product-empty-note">No receipts have been recorded yet.</p> : <div className="receiving-receipt-list">
        <div aria-hidden="true" className="receiving-receipt-header"><span>Time</span><span>Product</span><span>Quantity</span><span>By</span><span>Reference</span></div>
        {recentReceipts.map((movement) => <article className="receiving-receipt-row" key={movement.id}>
          <time data-label="Time" dateTime={movement.timestamp}>{new Date(movement.timestamp).toLocaleString()}</time><Link data-label="Product" to={`/inventory/${encodeURIComponent(movement.sku)}`}>{movement.sku} · {state.products[movement.sku]?.name ?? movement.sku}</Link><strong data-label="Quantity">+{movement.qty} {state.products[movement.sku]?.unit ?? 'units'}</strong><span data-label="By">{state.users[movement.userId]?.name ?? movement.userId}</span><span data-label="Reference">{movement.reference || '—'}</span>
        </article>)}
      </div>}
    </section>
  </main>;
}
