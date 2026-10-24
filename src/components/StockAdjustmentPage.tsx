import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ADJUSTMENT_REASONS, isLargeVariance, validateAdjustmentInput } from '../domain/adjustment';
import { parseWholeNumber } from '../domain/validation';
import { useStore } from '../store/StoreProvider';
import { SkuCombobox } from './SkuCombobox';

export function StockAdjustmentPage() {
  const { state, adjustStock, clearFeedback } = useStore();
  const location = useLocation();
  const [sku, setSku] = useState(() => new URLSearchParams(location.search).get('sku') ?? '');
  const [countedRaw, setCountedRaw] = useState('');
  const [reason, setReason] = useState('');
  const [otherReason, setOtherReason] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [savedSku, setSavedSku] = useState('');
  const [saved, setSaved] = useState(false);
  const products = useMemo(() => Object.values(state.products).sort((a, b) => a.sku.localeCompare(b.sku)), [state.products]);
  const product = state.products[sku];
  const storageLocation = product ? state.locations[product.locationId] : undefined;
  const role = state.session?.role ?? null;
  const validation = validateAdjustmentInput({ countedRaw, systemQty: product?.onHand ?? 0, capacity: storageLocation?.capacity ?? 0, reason, otherReason, role });
  const parsedCount = parseWholeNumber(countedRaw);
  const countError = countedRaw.trim() && !parsedCount.ok ? parsedCount.message
    : parsedCount.ok && storageLocation && parsedCount.value > storageLocation.capacity
      ? `Counted quantity cannot exceed location capacity of ${storageLocation.capacity}.` : '';
  const countedValid = Boolean(product && parsedCount.ok && storageLocation && parsedCount.value <= storageLocation.capacity);
  const difference = countedValid && product && parsedCount.ok ? parsedCount.value - product.onHand : null;
  const matches = difference === 0;
  const variance = difference !== null && product ? isLargeVariance(product.onHand, parsedCount.ok ? parsedCount.value : product.onHand) : false;
  const reasonError = validation.errors.find((error) => error !== 'Enter a reason for Other.' && (error === 'Select an adjustment reason.' || error.startsWith('Count is '))) ?? '';
  const otherError = validation.errors.find((error) => error === 'Enter a reason for Other.') ?? '';
  const reasonText = [reason, reason === 'Other' ? otherReason.trim() : '', note.trim()].filter(Boolean).join(': ');
  const formReady = Boolean(product && validation.valid && difference !== null && role && ['MANAGER', 'ADMIN'].includes(role));
  const adjustmentReady = formReady && !matches;
  const reasonHint = difference === null || difference === 0
    ? 'Select why the count differs from the system.'
    : difference > 0
      ? 'Count is higher than system. Suitable: Found stock, Data entry error, Cycle count correction, Other.'
      : 'Count is lower than system. Suitable: Lost / missing, Damaged goods, Data entry error, Cycle count correction, Other.';
  const recentAdjustments = useMemo(() => state.movements.filter((movement) => movement.type === 'ADJUST')
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp) || b.id.localeCompare(a.id)).slice(0, 10), [state.movements]);
  const feedback = saved ? state.feedback : null;

  function clearStatus() { setSaved(false); clearFeedback(); }
  function submitAdjustment() {
    if (!adjustmentReady || !product || validation.countedQty === null || !state.session) return;
    setSavedSku(product.sku);
    adjustStock({ sku: product.sku, countedQty: validation.countedQty, userId: state.session.id, reason: reasonText });
    setConfirming(false);
    setSku(''); setCountedRaw(''); setReason(''); setOtherReason(''); setNote('');
    setSaved(true);
  }

  return <main className="page-content adjustment-page">
    <p className="eyebrow">SMARTSTOCK WMS · INVENTORY OPERATIONS</p>
    <h1>Stock Adjustment</h1>
    <p className="intro">Reconcile system stock with a physical count. Only Managers and Admins can record adjustments.</p>
    <section aria-label="Stock adjustment form" className="product-section-card adjustment-form-card">
      <div className="adjustment-fields">
        <div className="adjustment-field receiving-field">
          <label htmlFor="adjustment-sku">SKU <span aria-hidden="true">*</span></label>
          <SkuCombobox id="adjustment-sku" products={products} selectedSku={sku} onSelect={(value) => { setSku(value); clearStatus(); }} onClear={() => { setSku(''); clearStatus(); }} />
        </div>
        <div className="adjustment-field receiving-field">
          <label className="receiving-label" htmlFor="adjustment-count">Counted quantity (total on shelf) <span aria-hidden="true">*</span></label>
          <input aria-describedby={['adjustment-count-help', countError ? 'adjustment-count-error' : null].filter(Boolean).join(' ')} aria-invalid={Boolean(countError)} autoComplete="off" id="adjustment-count" inputMode="numeric" onChange={(event) => { setCountedRaw(event.target.value); clearStatus(); }} placeholder="Whole number, 0 or more" type="text" value={countedRaw} />
          <span className="receiving-help" id="adjustment-count-help">{product
            ? `Enter the total you counted, not the change. System has ${product.onHand} ${product.unit}. Allowed: 0 to ${storageLocation?.capacity ?? 'unavailable'}.`
            : 'Select a SKU to see the system quantity. Enter the total you counted, not the change.'}</span>
          {countError && <span className="receiving-error" id="adjustment-count-error" role="alert">{countError}</span>}
        </div>
        <div className="adjustment-field receiving-field">
          <label className="receiving-label" htmlFor="adjustment-reason">Reason <span aria-hidden="true">*</span></label>
          <select aria-describedby={['adjustment-reason-help', reasonError ? 'adjustment-reason-error' : null].filter(Boolean).join(' ')} aria-invalid={Boolean(reasonError)} id="adjustment-reason" onChange={(event) => { setReason(event.target.value); clearStatus(); }} value={reason}><option value="">Select a reason</option>{ADJUSTMENT_REASONS.map((item) => <option key={item}>{item}</option>)}</select>
          {!reasonError && <span className="receiving-help" id="adjustment-reason-help">{reasonHint}</span>}
          {reasonError && <span className="receiving-error" id="adjustment-reason-error" role="alert">{reasonError}</span>}
        </div>
        {reason === 'Other' && <div className="adjustment-field receiving-field"><label className="receiving-label" htmlFor="adjustment-other">Other reason <span aria-hidden="true">*</span></label><input aria-describedby={['adjustment-other-help', otherError ? 'adjustment-other-error' : null].filter(Boolean).join(' ')} aria-invalid={Boolean(otherError)} id="adjustment-other" onChange={(event) => { setOtherReason(event.target.value); clearStatus(); }} value={otherReason} /><span className="receiving-help" id="adjustment-other-help">Describe the reason for this adjustment.</span>{otherError && <span className="receiving-error" id="adjustment-other-error" role="alert">{otherError}</span>}</div>}
        <div className="adjustment-field receiving-field"><label className="receiving-label" htmlFor="adjustment-note">Additional note <span className="receiving-optional">(optional)</span></label><input id="adjustment-note" onChange={(event) => { setNote(event.target.value); clearStatus(); }} value={note} /></div>
      </div>
      {product && <dl aria-label="Current stock information" className="adjustment-summary"><div><dt>On-hand in system</dt><dd>{product.onHand} {product.unit}</dd></div><div><dt>Location</dt><dd>{product.locationId}</dd></div><div><dt>Location capacity</dt><dd>{storageLocation?.capacity ?? 'Unavailable'} {product.unit}</dd></div></dl>}
      {feedback && <p aria-live="polite" className="adjustment-feedback" role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'success' ? <>Adjustment saved. <Link to={`/inventory/${encodeURIComponent(savedSku)}`}>View product</Link></> : feedback.message}</p>}
      <div className="receiving-actions-row receiving-actions-row-with-preview adjustment-actions-row">
        <section aria-live="polite" className="receiving-preview adjustment-preview">
          <h2>Preview</h2>
          {!formReady || difference === null || !product ? <p>Enter a counted quantity to preview the result</p>
            : matches ? <p>Count matches system — nothing to record</p>
              : <p>{product.onHand} → {parsedCount.ok ? parsedCount.value : ''} {product.unit} · {difference > 0 ? `+${difference} (Increase)` : `−${Math.abs(difference)} (Decrease)`}</p>}
          {formReady && variance && <p className="adjustment-variance">Large variance — review recommended</p>}
        </section>
        <button className="receiving-submit" disabled={!adjustmentReady} onClick={() => { if (adjustmentReady) setConfirming(true); }} type="button">Review adjustment</button>
      </div>
    </section>

    {confirming && product && difference !== null && <div className="adjustment-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirming(false); }}>
      <section aria-labelledby="adjustment-dialog-title" aria-modal="true" className="adjustment-dialog" role="dialog">
        <header><div><p className="eyebrow">CONFIRM STOCK CHANGE</p><h2 id="adjustment-dialog-title">Save adjustment?</h2></div><button aria-label="Close confirmation" className="adjustment-dialog-close" onClick={() => setConfirming(false)} type="button">×</button></header>
        <dl className="adjustment-confirm-details"><div><dt>Before → After</dt><dd>{product.onHand} → {validation.countedQty} {product.unit}</dd></div><div><dt>Difference</dt><dd>{difference > 0 ? '+' : ''}{difference} {product.unit}</dd></div><div><dt>Reason</dt><dd>{reasonText}</dd></div></dl>
        {variance && <p className="adjustment-variance">Large variance — review recommended.</p>}
        <div className="adjustment-dialog-actions"><button className="adjustment-cancel" onClick={() => setConfirming(false)} type="button">Cancel</button><button className="adjustment-submit" onClick={submitAdjustment} type="button">Confirm adjustment</button></div>
      </section>
    </div>}

    <section aria-label="Recent adjustments" className="product-section-card adjustment-recent">
      <div className="product-section-heading"><div><h2>Recent adjustments</h2><p>Latest 10 ADJUST movements from the central store.</p></div></div>
      {recentAdjustments.length === 0 ? <p className="product-empty-note">No adjustments have been recorded yet.</p> : <div className="adjustment-list">
        <div aria-hidden="true" className="adjustment-list-header"><span>Time</span><span>SKU</span><span>Before → After</span><span>Difference</span><span>Reason</span><span>By</span></div>
        {recentAdjustments.map((movement) => {
          const varianceBadge = isLargeVariance(movement.qtyBefore, movement.qtyAfter);
          return <article className="adjustment-list-row" key={movement.id}>
            <time data-label="Time" dateTime={movement.timestamp}>{new Date(movement.timestamp).toLocaleString()}</time>
            <Link data-label="SKU" to={`/inventory/${encodeURIComponent(movement.sku)}`}>{movement.sku} · {state.products[movement.sku]?.name ?? movement.sku}</Link>
            <span data-label="Before → After">{movement.qtyBefore} → {movement.qtyAfter} {state.products[movement.sku]?.unit ?? 'units'}</span>
            <span data-label="Difference">{movement.qty > 0 ? '+' : ''}{movement.qty} {state.products[movement.sku]?.unit ?? 'units'}</span>
            <span data-label="Reason">{movement.reason || '—'}{varianceBadge && <strong className="adjustment-large-badge">Large variance — review recommended</strong>}</span>
            <span data-label="By">{state.users[movement.userId]?.name ?? movement.userId}</span>
          </article>;
        })}
      </div>}
    </section>
  </main>;
}
