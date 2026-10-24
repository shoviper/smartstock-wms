import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  DEFAULT_ORDER_LIST_FILTERS,
  filterAndSortOrders,
  parseOrderListQuery,
  selectOrderProgress,
  serializeOrderListQuery,
  sortPickPath,
  type OrderStatusTab,
} from '../domain/orders';
import type { Order, OrderStatus } from '../domain/models';
import { getLinePickingStatus, selectNextPendingLine, type ShortPickReason } from '../domain/picking';
import { parseWholeNumber } from '../domain/validation';
import { useStore } from '../store/StoreProvider';

const statusTabs: { id: OrderStatusTab; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'pending', label: 'Pending' },
  { id: 'in-progress', label: 'In Progress' }, { id: 'completed', label: 'Completed' },
];
const statusLabels: Record<OrderStatus, string> = {
  PENDING: 'Pending', IN_PROGRESS: 'In Progress', COMPLETED: 'Completed', COMPLETED_WITH_SHORTAGE: 'Completed with shortage',
};
const priorityLabels = { URGENT: 'Urgent', HIGH: 'High', NORMAL: 'Normal', LOW: 'Low' } as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function dueDescription(value: string, now: Date) {
  const dueAt = Date.parse(value);
  if (!Number.isFinite(dueAt)) return { label: 'Due date unavailable', overdue: false };
  const remaining = dueAt - now.getTime();
  if (remaining < 0) return { label: 'Overdue', overdue: true };
  const hours = Math.ceil(remaining / (60 * 60 * 1000));
  return { label: hours < 1 ? 'Due in <1h' : `Due in ${hours}h`, overdue: false };
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`order-status-badge order-status-${status.toLowerCase().replaceAll('_', '-')}`}>{statusLabels[status]}</span>;
}

function PriorityBadge({ priority }: { priority: Order['priority'] }) {
  return <span className={`order-priority-badge order-priority-${priority.toLowerCase()}`}>{priorityLabels[priority]}</span>;
}

function Progress({ order }: { order: Order }) {
  const progress = selectOrderProgress(order);
  return <div aria-label={`${progress.picked} of ${progress.required} units picked`} className="order-progress" role="group">
    <div aria-valuemax={progress.required || 1} aria-valuemin={0} aria-valuenow={progress.picked} className="order-progress-track" role="progressbar"><span style={{ width: `${progress.percent}%` }} /></div>
    <span>{progress.picked} / {progress.required} picked</span>
  </div>;
}

function shortageUnits(order: Order) {
  return order.lines.reduce((total, line) => total + (line.shortQty ?? 0), 0);
}

function assignedUser(order: Order, users: ReturnType<typeof useStore>['state']['users'], session: ReturnType<typeof useStore>['state']['session']) {
  if (!order.assignedTo) return 'Unassigned';
  return (session?.id === order.assignedTo ? session.name : users[order.assignedTo]?.name) ?? order.assignedTo;
}

export function OrdersListPage() {
  const { state } = useStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseOrderListQuery(searchParams), [searchParams]);
  const orders = useMemo(() => Object.values(state.orders), [state.orders]);
  const filtered = useMemo(() => filterAndSortOrders(orders, filters), [orders, filters]);
  const now = useMemo(() => new Date(), [state.orders]);
  const counts: Record<OrderStatusTab, number> = {
    all: orders.length,
    pending: orders.filter((order) => order.status === 'PENDING').length,
    'in-progress': orders.filter((order) => order.status === 'IN_PROGRESS').length,
    completed: orders.filter((order) => order.status === 'COMPLETED' || order.status === 'COMPLETED_WITH_SHORTAGE').length,
  };

  function updateFilters(next: Partial<typeof filters>) {
    setSearchParams(serializeOrderListQuery({ ...filters, ...next }));
  }

  function clearFilters() {
    setSearchParams(serializeOrderListQuery(DEFAULT_ORDER_LIST_FILTERS));
  }

  function openOrder(orderId: string) {
    navigate(`/orders-picking/${encodeURIComponent(orderId)}${searchParams.size ? `?${searchParams.toString()}` : ''}`);
  }

  function handleOrderRowKeyDown(event: KeyboardEvent<HTMLElement>, orderId: string) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openOrder(orderId);
    }
  }

  return <main className="page-content orders-page">
    <p className="eyebrow">SMARTSTOCK WMS · FULFILLMENT</p>
    <h1>Orders &amp; Picking</h1>
    <p className="intro">Review orders and pick stock from the warehouse locations.</p>
    <section aria-label="Filter orders by status" className="orders-status-tabs" role="group">
      {statusTabs.map(({ id, label }) => <button aria-pressed={filters.status === id} className="orders-status-tab" key={id} onClick={() => updateFilters({ status: id })} type="button"><span>{label}</span><strong>{counts[id]}</strong></button>)}
    </section>
    <section aria-label="Search orders" className="orders-search-panel">
      <label><span>Search</span><input onChange={(event) => updateFilters({ search: event.target.value })} placeholder="Order ID or customer" type="search" value={filters.search} /></label>
    </section>
    <div className="inventory-result-toolbar orders-result-toolbar"><span aria-live="polite" className="inventory-result-count">{filtered.length} {filtered.length === 1 ? 'order' : 'orders'}</span>{(filters.status !== 'all' || filters.search) && <button className="inventory-clear-link" onClick={clearFilters} type="button"><svg aria-hidden="true" viewBox="0 0 16 16"><path d="m4 4 8 8M12 4l-8 8" /></svg>Clear filters</button>}</div>
    {filtered.length === 0 ? <section className="orders-empty"><h2>No orders found</h2><p>Try another Order ID or customer name.</p>{(filters.status !== 'all' || filters.search) && <button className="inventory-clear-button" onClick={clearFilters} type="button">Clear filters</button>}</section> : <>
      <div className="inventory-table-wrap orders-table-wrap"><table className="inventory-table orders-table"><thead><tr><th>Order ID</th><th>Customer</th><th>Priority</th><th>Due</th><th>Lines</th><th>Progress</th><th>Status</th><th>Assigned to</th></tr></thead><tbody>
        {filtered.map((order) => {
          const due = dueDescription(order.dueAt, now);
          return <tr aria-label={`View order ${order.id}: ${order.customer}`} className="inventory-row-link" key={order.id} onClick={(event) => { if (!(event.target as HTMLElement).closest('a, button')) openOrder(order.id); }} onKeyDown={(event) => handleOrderRowKeyDown(event, order.id)} role="link" tabIndex={0}><td><Link className="orders-id-link" to={`/orders-picking/${encodeURIComponent(order.id)}${searchParams.size ? `?${searchParams.toString()}` : ''}`}>{order.id}</Link></td><td>{order.customer}</td><td><PriorityBadge priority={order.priority} /></td><td><span className={due.overdue ? 'order-due-overdue' : 'order-due'}>{due.label}</span><span className="order-due-date">{formatDate(order.dueAt)}</span></td><td>{order.lines.length}</td><td><Progress order={order} /></td><td><StatusBadge status={order.status} />{shortageUnits(order) > 0 && <small className="order-shortage-count">{shortageUnits(order)} short</small>}</td><td>{assignedUser(order, state.users, state.session)}</td></tr>;
        })}
      </tbody></table></div>
      <div aria-label="Orders" className="orders-cards">{filtered.map((order) => {
        const due = dueDescription(order.dueAt, now);
        return <article aria-label={`View order ${order.id}: ${order.customer}`} className="orders-card inventory-product-card-link" key={order.id} onClick={(event) => { if (!(event.target as HTMLElement).closest('a, button')) openOrder(order.id); }} onKeyDown={(event) => handleOrderRowKeyDown(event, order.id)} role="link" tabIndex={0}>
          <div className="orders-card-heading"><div><Link className="orders-id-link" to={`/orders-picking/${encodeURIComponent(order.id)}${searchParams.size ? `?${searchParams.toString()}` : ''}`}>{order.id}</Link><strong>{order.customer}</strong></div><PriorityBadge priority={order.priority} /></div>
          <div className="orders-card-badges"><StatusBadge status={order.status} /><span className={due.overdue ? 'order-due-overdue' : 'order-due'}>{due.label}</span></div>
          {shortageUnits(order) > 0 && <p className="order-shortage-count">{shortageUnits(order)} units short</p>}
          <Progress order={order} />
          <dl><div><dt>Lines</dt><dd>{order.lines.length}</dd></div><div><dt>Assigned to</dt><dd>{assignedUser(order, state.users, state.session)}</dd></div></dl>
        </article>;
      })}</div>
    </>}
  </main>;
}

type PickMode = 'confirm' | 'short';

interface PickDialogProps {
  orderId: string;
  sku: string;
  position: string;
  name: string;
  remaining: number;
  onHand: number;
  mode: PickMode;
  errorMessage: string;
  onClose(): void;
  onConfirm(values: { locationId: string; scannedSku: string; quantity: number; reason?: ShortPickReason; otherReason?: string }): void;
}

function PickDialog({ orderId, sku, position, name, remaining, onHand, mode, errorMessage, onClose, onConfirm }: PickDialogProps) {
  const [locationId, setLocationId] = useState('');
  const [scannedSku, setScannedSku] = useState('');
  const [quantityRaw, setQuantityRaw] = useState(String(mode === 'short' ? 0 : remaining));
  const [reason, setReason] = useState<ShortPickReason>('Out of stock');
  const [otherReason, setOtherReason] = useState('');
  const quantity = parseWholeNumber(quantityRaw);
  const quantityValue = quantity.ok ? quantity.value : null;
  const isShortZero = mode === 'short' && quantityValue === 0;
  const locationNormalized = locationId.trim().toLocaleUpperCase();
  const skuNormalized = scannedSku.trim().toLocaleUpperCase();
  const locationError = isShortZero
    ? locationNormalized && locationNormalized !== position.trim().toLocaleUpperCase() ? `Location does not match this line (expected ${position}).` : ''
    : locationNormalized !== position.trim().toLocaleUpperCase() ? `Location does not match this line (expected ${position}).` : '';
  const skuError = isShortZero
    ? skuNormalized && skuNormalized !== sku.trim().toLocaleUpperCase() ? 'SKU does not match this line.' : ''
    : skuNormalized !== sku.trim().toLocaleUpperCase() ? 'SKU does not match this line.' : '';
  const quantityError = !quantity.ok ? quantity.message
    : quantityValue === null || (mode === 'confirm' ? quantityValue < 1 : quantityValue < 0) ? 'Enter a valid whole quantity.'
      : quantityValue > remaining ? `Only ${remaining} units remain to pick.`
        : quantityValue > onHand ? `Only ${onHand} units are on hand.`
          : mode === 'short' && quantityValue === remaining ? 'Use Confirm pick when the full remaining quantity is available.' : '';
  const reasonError = mode === 'short' && reason === 'Other' && !otherReason.trim() ? 'Enter a reason for Other.' : '';
  const canSubmit = !locationError && !skuError && !quantityError && !reasonError;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || quantityValue === null) return;
    onConfirm({ locationId, scannedSku, quantity: quantityValue, ...(mode === 'short' ? { reason, otherReason } : {}) });
  }

  return <div className="pick-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section aria-labelledby="pick-dialog-title" aria-modal="true" className="pick-dialog" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }} role="dialog">
      <header><div><p className="eyebrow">{orderId}</p><h2 id="pick-dialog-title">{mode === 'short' ? 'Short pick' : 'Confirm pick'}</h2><p>{name} · <strong>{position}</strong></p></div><button aria-label="Close" className="pick-dialog-close" onClick={onClose} type="button">×</button></header>
      <form onSubmit={handleSubmit}>
        <label htmlFor="pick-location">Location code</label>
        <input aria-describedby={locationError ? 'pick-location-error' : undefined} aria-invalid={Boolean(locationError)} autoComplete="off" autoFocus id="pick-location" onChange={(event) => setLocationId(event.target.value)} value={locationId} />
        {locationError && <small className="pick-field-error" id="pick-location-error">{locationError}</small>}
        <label htmlFor="pick-sku">SKU</label>
        <input aria-describedby={skuError ? 'pick-sku-error' : undefined} aria-invalid={Boolean(skuError)} autoComplete="off" id="pick-sku" onChange={(event) => setScannedSku(event.target.value)} value={scannedSku} />
        {skuError && <small className="pick-field-error" id="pick-sku-error">{skuError}</small>}
        <label htmlFor="pick-quantity">{mode === 'short' ? 'Quantity actually picked' : 'Quantity'}</label>
        <input aria-describedby="pick-quantity-error" aria-invalid={Boolean(quantityError)} id="pick-quantity" inputMode="numeric" onChange={(event) => setQuantityRaw(event.target.value)} type="text" value={quantityRaw} />
        {quantityError && <small className="pick-field-error" id="pick-quantity-error">{quantityError}</small>}
        {mode === 'short' && <>
          <label htmlFor="pick-short-reason">Short pick reason</label>
          <select id="pick-short-reason" onChange={(event) => setReason(event.target.value as ShortPickReason)} value={reason}>
            <option>Out of stock</option><option>Damaged</option><option>Not found at location</option><option>Other</option>
          </select>
          {reason === 'Other' && <input aria-describedby={reasonError ? 'pick-short-reason-error' : undefined} aria-label="Other short pick reason" aria-required="true" id="pick-short-reason-details" onChange={(event) => setOtherReason(event.target.value)} placeholder="Describe the reason" required value={otherReason} />}
          {reasonError && <small className="pick-field-error" id="pick-short-reason-error">{reasonError}</small>}
        </>}
        <button className="pick-simulate-button" onClick={() => { setLocationId(position); setScannedSku(sku); }} type="button">Simulate scan</button>
        {errorMessage && <p aria-live="assertive" className="order-feedback order-feedback-error">{errorMessage}</p>}
        <div className="pick-dialog-actions"><button className="pick-cancel-button" onClick={onClose} type="button">Cancel</button><button className="order-start-button" disabled={!canSubmit} type="submit">{mode === 'short' ? 'Complete short pick' : 'Confirm pick'}</button></div>
      </form>
    </section>
  </div>;
}

export function OrderDetailPage() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const location = useLocation();
  const { state, startPicking, pickItem, shortPick, clearFeedback } = useStore();
  const [submitted, setSubmitted] = useState(false);
  const [activePick, setActivePick] = useState<{ sku: string; mode: PickMode } | null>(null);
  const [submittingPick, setSubmittingPick] = useState(false);
  const submitLock = useRef(false);
  const order = state.orders[orderId];
  const session = state.session;
  const canStart = ['PICKER', 'MANAGER', 'ADMIN'].includes(session?.role ?? '');
  const pathLines = useMemo(() => order ? sortPickPath(order.lines, state.products, state.locations) : [], [order, state.products, state.locations]);

  useEffect(() => {
    if (!submittingPick || !state.feedback) return;
    setSubmittingPick(false);
    submitLock.current = false;
    if (state.feedback.kind === 'success') setActivePick(null);
  }, [state.feedback, submittingPick]);

  useEffect(() => {
    if (!submitted || !state.feedback || state.feedback.kind !== 'success') return undefined;
    const timeout = window.setTimeout(() => {
      clearFeedback();
      setSubmitted(false);
    }, 5000);
    return () => window.clearTimeout(timeout);
  }, [clearFeedback, state.feedback, submitted]);

  if (!order) {
    return <main className="page-content order-not-found"><Link className="product-back-link" to={`/orders-picking${location.search}`}>← Back to Orders</Link><section className="product-not-found-card"><h1>Order not found</h1><p>No order matches {orderId || 'this ID'}.</p></section></main>;
  }

  const due = dueDescription(order.dueAt, new Date());
  const feedbackMessage = submitted ? state.feedback?.message ?? '' : '';

  function handleStartPicking() {
    setSubmitted(true);
    clearFeedback();
    startPicking(order.id);
  }

  function openPick(sku: string, mode: PickMode) {
    clearFeedback();
    setActivePick({ sku, mode });
  }

  function handlePickConfirm(values: { locationId: string; scannedSku: string; quantity: number; reason?: ShortPickReason; otherReason?: string }) {
    if (!activePick || !order || !session || submitLock.current) return;
    submitLock.current = true;
    setSubmittingPick(true);
    setSubmitted(true);
    clearFeedback();
    const common = { orderId: order.id, sku: activePick.sku, scannedSku: values.scannedSku, expectedLocationId: values.locationId, quantity: values.quantity, userId: session.id };
    if (activePick.mode === 'short' && values.reason) shortPick({ ...common, reason: values.reason, otherReason: values.otherReason });
    else pickItem(common);
  }

  function openNextPendingLine() {
    const next = selectNextPendingLine(pathLines);
    if (next) openPick(next.sku, 'confirm');
  }

  return <main className="page-content order-detail-page">
    <Link className="product-back-link" to={`/orders-picking${location.search}`}>← Back to Orders</Link>
    <header className="order-detail-header">
      <div><p className="eyebrow">SMARTSTOCK WMS · ORDER DETAIL</p><h1>{order.id}</h1><p className="order-detail-customer">{order.customer}</p></div>
      <div className="order-detail-actions">{order.status === 'PENDING' && canStart && <button className="order-start-button" onClick={handleStartPicking} type="button">Start Picking</button>}<StatusBadge status={order.status} /></div>
    </header>
    {feedbackMessage && <p aria-live="polite" className={`order-feedback${state.feedback?.kind === 'error' ? ' order-feedback-error' : feedbackMessage.toLocaleLowerCase().includes('marked short') ? ' order-feedback-short' : ' order-feedback-success'}`} role="status">{feedbackMessage}<button aria-label="Dismiss message" className="order-feedback-dismiss" onClick={() => { clearFeedback(); setSubmitted(false); }} type="button">×</button></p>}
    <section aria-label="Order information" className="order-detail-summary">
      <article><span>Priority</span><PriorityBadge priority={order.priority} /></article>
      <article><span>Due</span><strong className={due.overdue ? 'order-due-overdue' : ''}>{due.label}</strong><small>{formatDate(order.dueAt)}</small></article>
      <article><span>Assigned to</span><strong>{assignedUser(order, state.users, session)}</strong>{order.startedAt && <small>Started {formatDate(order.startedAt)}</small>}</article>
      <article><span>Picking progress</span><Progress order={order} /></article>
    </section>
    {order.status === 'COMPLETED_WITH_SHORTAGE' && <p className="order-shortage-summary"><strong>Completed with shortage</strong> · {shortageUnits(order)} units short</p>}
    {order.status === 'IN_PROGRESS' && shortageUnits(order) > 0 && <p className="order-shortage-summary"><strong>{shortageUnits(order)} units short so far</strong></p>}
    <section aria-label="Pick list" className="order-pick-list-section">
      <header><div><h2>Pick list</h2><p>Sorted by warehouse pick path: Zone → Aisle → Rack → Level.</p></div><span>{order.lines.length} {order.lines.length === 1 ? 'line' : 'lines'}</span></header>
      <div className="inventory-table-wrap order-pick-table-wrap"><table className="inventory-table order-pick-table"><thead><tr><th>Line</th><th>Location</th><th>SKU</th><th>Product</th><th>Required</th><th>Picked</th><th>On-hand now</th><th>Line status</th></tr></thead><tbody>
        {pathLines.map((line, index) => {
          const product = state.products[line.sku];
          const position = product ? state.locations[product.locationId]?.id ?? product.locationId : '—';
          const lineStatus = getLinePickingStatus(line, product?.onHand ?? 0);
          const remaining = line.qty - line.pickedQty - (line.shortQty ?? 0);
          return <tr key={`${line.sku}-${index}`}><td>{String(index + 1).padStart(2, '0')}</td><td><strong className="order-location-code">{position}</strong></td><td className="inventory-sku">{line.sku}</td><td>{product?.name ?? line.sku}</td><td>{line.qty} {product?.unit ?? ''}</td><td>{line.pickedQty} {product?.unit ?? ''}{(line.shortQty ?? 0) > 0 && <small className="order-short-line">{line.pickedQty} picked · {line.shortQty} short<br />{line.shortReason}</small>}</td><td>{product?.onHand ?? '—'} {product?.unit ?? ''}</td><td><span className={`order-line-status order-line-status-${lineStatus.toLowerCase().replaceAll(' ', '-')}`}>{lineStatus}</span>{remaining > 0 && order.status === 'IN_PROGRESS' && canStart && <div className="order-line-actions"><button className={`pick-line-button${selectNextPendingLine(pathLines)?.sku === line.sku ? ' pick-line-button-next' : ' pick-line-button-secondary'}`} onClick={() => openPick(line.sku, 'confirm')} type="button">Confirm pick</button><button className="short-line-button" onClick={() => openPick(line.sku, 'short')} type="button">Can't find / Short pick</button></div>}</td></tr>;
        })}
      </tbody></table></div>
      <div className="order-pick-cards">{pathLines.map((line, index) => {
        const product = state.products[line.sku];
        const position = product ? state.locations[product.locationId]?.id ?? product.locationId : '—';
        const lineStatus = getLinePickingStatus(line, product?.onHand ?? 0);
        const remaining = line.qty - line.pickedQty - (line.shortQty ?? 0);
        return <article className="order-pick-card" key={`${line.sku}-${index}`}><div className="order-pick-card-heading"><span>Line {index + 1}</span><span className={`order-line-status order-line-status-${lineStatus.toLowerCase().replaceAll(' ', '-')}`}>{lineStatus}</span></div><strong className="order-location-code">{position}</strong><div className="order-pick-card-product"><strong>{product?.name ?? line.sku}</strong><span>{line.sku}</span></div><dl><div><dt>Required</dt><dd>{line.qty} {product?.unit ?? ''}</dd></div><div><dt>Picked</dt><dd>{(line.shortQty ?? 0) > 0 ? <>{line.pickedQty} picked · {line.shortQty} short<small className="order-short-line">{line.shortReason}</small></> : `${line.pickedQty} ${product?.unit ?? ''}`}</dd></div><div><dt>On-hand now</dt><dd>{product?.onHand ?? '—'} {product?.unit ?? ''}</dd></div></dl>{remaining > 0 && order.status === 'IN_PROGRESS' && canStart && <div className="order-line-actions"><button className={`pick-line-button${selectNextPendingLine(pathLines)?.sku === line.sku ? ' pick-line-button-next' : ' pick-line-button-secondary'}`} onClick={() => openPick(line.sku, 'confirm')} type="button">Confirm pick</button><button className="short-line-button" onClick={() => openPick(line.sku, 'short')} type="button">Can't find / Short pick</button></div>}</article>;
      })}</div>
    </section>
    {order.status === 'IN_PROGRESS' && canStart && <div className="mobile-picking-bar"><Progress order={order} /><button className="order-start-button" disabled={!selectNextPendingLine(pathLines)} onClick={openNextPendingLine} type="button">Next line</button></div>}
    {activePick && (() => {
      const line = order.lines.find((candidate) => candidate.sku === activePick.sku);
      const product = line ? state.products[line.sku] : undefined;
      const currentLocation = product ? state.locations[product.locationId] : undefined;
      if (!line || !product || !currentLocation) return null;
      return <PickDialog key={`${activePick.sku}-${activePick.mode}`} errorMessage={state.feedback?.kind === 'error' ? state.feedback.message : ''} mode={activePick.mode} name={product.name} onClose={() => { if (!submittingPick) setActivePick(null); }} onConfirm={handlePickConfirm} onHand={product.onHand} orderId={order.id} position={currentLocation.id} remaining={line.qty - line.pickedQty - (line.shortQty ?? 0)} sku={line.sku} />;
    })()}
  </main>;
}
