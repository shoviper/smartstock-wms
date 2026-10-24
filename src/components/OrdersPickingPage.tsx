import { useMemo, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
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

function assignedUser(order: Order, users: ReturnType<typeof useStore>['state']['users'], session: ReturnType<typeof useStore>['state']['session']) {
  if (!order.assignedTo) return 'Unassigned';
  return (session?.id === order.assignedTo ? session.name : users[order.assignedTo]?.name) ?? order.assignedTo;
}

export function OrdersListPage() {
  const { state } = useStore();
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
          return <tr key={order.id}><td><Link className="orders-id-link" to={`/orders-picking/${encodeURIComponent(order.id)}${searchParams.size ? `?${searchParams.toString()}` : ''}`}>{order.id}</Link></td><td>{order.customer}</td><td><PriorityBadge priority={order.priority} /></td><td><span className={due.overdue ? 'order-due-overdue' : 'order-due'}>{due.label}</span><span className="order-due-date">{formatDate(order.dueAt)}</span></td><td>{order.lines.length}</td><td><Progress order={order} /></td><td><StatusBadge status={order.status} /></td><td>{assignedUser(order, state.users, state.session)}</td></tr>;
        })}
      </tbody></table></div>
      <div aria-label="Orders" className="orders-cards">{filtered.map((order) => {
        const due = dueDescription(order.dueAt, now);
        return <article className="orders-card" key={order.id}>
          <div className="orders-card-heading"><div><Link className="orders-id-link" to={`/orders-picking/${encodeURIComponent(order.id)}${searchParams.size ? `?${searchParams.toString()}` : ''}`}>{order.id}</Link><strong>{order.customer}</strong></div><PriorityBadge priority={order.priority} /></div>
          <div className="orders-card-badges"><StatusBadge status={order.status} /><span className={due.overdue ? 'order-due-overdue' : 'order-due'}>{due.label}</span></div>
          <Progress order={order} />
          <dl><div><dt>Lines</dt><dd>{order.lines.length}</dd></div><div><dt>Assigned to</dt><dd>{assignedUser(order, state.users, state.session)}</dd></div></dl>
        </article>;
      })}</div>
    </>}
  </main>;
}

type LineStatus = 'Pending' | 'Picked' | 'Short' | 'Out of stock';

function getLineStatus(order: Order, qty: number, pickedQty: number, onHand: number): LineStatus {
  if (pickedQty >= qty) return 'Picked';
  if (order.status === 'COMPLETED_WITH_SHORTAGE') return 'Short';
  if (onHand === 0) return 'Out of stock';
  return 'Pending';
}

export function OrderDetailPage() {
  const { orderId = '' } = useParams<{ orderId: string }>();
  const location = useLocation();
  const { state, startPicking, clearFeedback } = useStore();
  const [submitted, setSubmitted] = useState(false);
  const order = state.orders[orderId];
  const session = state.session;
  const canStart = ['PICKER', 'MANAGER', 'ADMIN'].includes(session?.role ?? '');
  const pathLines = useMemo(() => order ? sortPickPath(order.lines, state.products, state.locations) : [], [order, state.products, state.locations]);

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

  return <main className="page-content order-detail-page">
    <Link className="product-back-link" to={`/orders-picking${location.search}`}>← Back to Orders</Link>
    <header className="order-detail-header">
      <div><p className="eyebrow">SMARTSTOCK WMS · ORDER DETAIL</p><h1>{order.id}</h1><p className="order-detail-customer">{order.customer}</p></div>
      <div className="order-detail-actions">{order.status === 'PENDING' && canStart && <button className="order-start-button" onClick={handleStartPicking} type="button">Start Picking</button>}<StatusBadge status={order.status} /></div>
    </header>
    {feedbackMessage && <p aria-live="polite" className={`order-feedback${state.feedback?.kind === 'error' ? ' order-feedback-error' : ' order-feedback-success'}`}>{feedbackMessage}</p>}
    <section aria-label="Order information" className="order-detail-summary">
      <article><span>Priority</span><PriorityBadge priority={order.priority} /></article>
      <article><span>Due</span><strong className={due.overdue ? 'order-due-overdue' : ''}>{due.label}</strong><small>{formatDate(order.dueAt)}</small></article>
      <article><span>Assigned to</span><strong>{assignedUser(order, state.users, session)}</strong>{order.startedAt && <small>Started {formatDate(order.startedAt)}</small>}</article>
      <article><span>Picking progress</span><Progress order={order} /></article>
    </section>
    <section aria-label="Pick list" className="order-pick-list-section">
      <header><div><h2>Pick list</h2><p>Sorted by warehouse pick path: Zone → Aisle → Rack → Level.</p></div><span>{order.lines.length} {order.lines.length === 1 ? 'line' : 'lines'}</span></header>
      <div className="inventory-table-wrap order-pick-table-wrap"><table className="inventory-table order-pick-table"><thead><tr><th>Line</th><th>Location</th><th>SKU</th><th>Product</th><th>Required</th><th>Picked</th><th>On-hand now</th><th>Line status</th></tr></thead><tbody>
        {pathLines.map((line, index) => {
          const product = state.products[line.sku];
          const position = product ? state.locations[product.locationId]?.id ?? product.locationId : '—';
          const lineStatus = getLineStatus(order, line.qty, line.pickedQty, product?.onHand ?? 0);
          return <tr key={`${line.sku}-${index}`}><td>{String(index + 1).padStart(2, '0')}</td><td><strong className="order-location-code">{position}</strong></td><td className="inventory-sku">{line.sku}</td><td>{product?.name ?? line.sku}</td><td>{line.qty} {product?.unit ?? ''}</td><td>{line.pickedQty} {product?.unit ?? ''}</td><td>{product?.onHand ?? '—'} {product?.unit ?? ''}</td><td><span className={`order-line-status order-line-status-${lineStatus.toLowerCase().replaceAll(' ', '-')}`}>{lineStatus}</span></td></tr>;
        })}
      </tbody></table></div>
      <div className="order-pick-cards">{pathLines.map((line, index) => {
        const product = state.products[line.sku];
        const position = product ? state.locations[product.locationId]?.id ?? product.locationId : '—';
        const lineStatus = getLineStatus(order, line.qty, line.pickedQty, product?.onHand ?? 0);
        return <article className="order-pick-card" key={`${line.sku}-${index}`}><div className="order-pick-card-heading"><span>Line {index + 1}</span><span className={`order-line-status order-line-status-${lineStatus.toLowerCase().replaceAll(' ', '-')}`}>{lineStatus}</span></div><strong className="order-location-code">{position}</strong><div className="order-pick-card-product"><strong>{product?.name ?? line.sku}</strong><span>{line.sku}</span></div><dl><div><dt>Required</dt><dd>{line.qty} {product?.unit ?? ''}</dd></div><div><dt>Picked</dt><dd>{line.pickedQty} {product?.unit ?? ''}</dd></div><div><dt>On-hand now</dt><dd>{product?.onHand ?? '—'} {product?.unit ?? ''}</dd></div></dl></article>;
      })}</div>
    </section>
  </main>;
}
