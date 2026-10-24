import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DASHBOARD_TIME_ZONE,
  selectDashboardDailyMovements,
  selectDashboardKpis,
  selectDashboardOrderStatusCounts,
  selectDashboardRecentMovements,
  selectDashboardStockStatusCounts,
  selectDashboardUrgentOrders,
  selectDashboardUrgentProducts,
} from '../domain/dashboard';
import { getStockStatus } from '../domain/inventory';
import type { MovementType, StockStatus } from '../domain/models';
import { useStore } from '../store/StoreProvider';

const stockLabels: Record<StockStatus, string> = { OUT: 'Out', CRITICAL: 'Critical', LOW: 'Low', NORMAL: 'Normal' };
const movementLabels: Record<MovementType, string> = { RECEIVE: 'Receive', PICK: 'Pick', ADJUST: 'Adjust' };
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: DASHBOARD_TIME_ZONE, day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00+07:00`));
const timestampLabel = (value: string) => new Intl.DateTimeFormat('en-GB', { timeZone: DASHBOARD_TIME_ZONE, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

export function DashboardPage() {
  const { state } = useStore();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const kpis = useMemo(() => selectDashboardKpis(state, now), [state, now]);
  const orderCounts = useMemo(() => selectDashboardOrderStatusCounts(state, now), [state, now]);
  const stockCounts = useMemo(() => selectDashboardStockStatusCounts(state, now), [state, now]);
  const daily = useMemo(() => selectDashboardDailyMovements(state, now), [state, now]);
  const products = useMemo(() => selectDashboardUrgentProducts(state, now), [state, now]);
  const urgentOrders = useMemo(() => selectDashboardUrgentOrders(state, now), [state, now]);
  const movements = useMemo(() => selectDashboardRecentMovements(state, now), [state, now]);
  const maxMovement = Math.max(1, ...daily.flatMap((day) => [day.receive, day.pick]));

  return <main className="page-content dashboard-page">
    <p className="eyebrow">SMARTSTOCK WMS · OVERVIEW</p>
    <h1>Dashboard</h1>
    <p className="intro">Warehouse status and actions that need attention.</p>

    <section aria-label="Key performance indicators" className="dashboard-kpis">
      <Link className="dashboard-kpi" to="/inventory"><span>Total SKU</span><strong>{kpis.totalSku}</strong><small>Products in inventory</small></Link>
      <Link aria-label={`Items needing attention: ${kpis.attentionTotal}`} className="dashboard-kpi" to="/inventory?status=out,critical,low">
        <span>Items needing attention</span><strong>{kpis.attentionTotal}</strong>
        <small>Out {kpis.attention.OUT} · Critical {kpis.attention.CRITICAL} · Low {kpis.attention.LOW}</small>
      </Link>
      <Link className="dashboard-kpi" to="/orders-picking?status=pending"><span>Pending orders</span><strong>{kpis.pendingOrders}</strong><small>In Progress {kpis.inProgressOrders} · Overdue {kpis.overdueOrders}</small></Link>
      <Link className="dashboard-kpi" to="/orders-picking?status=completed"><span>Picking completed today</span><strong>{kpis.completedOrdersToday}</strong><small>Asia/Bangkok calendar day · {kpis.unitsPickedToday} units picked</small></Link>
    </section>

    <section aria-label="Dashboard charts" className="dashboard-charts">
      <article className="dashboard-panel">
        <div className="dashboard-panel-heading"><h2>Order status</h2><span>Orders by current status</span></div>
        {Object.values(orderCounts).every((count) => count === 0) ? <p className="dashboard-empty">No order data yet.</p> : <div className="dashboard-bar-list">
          {[
            { id: 'pending', label: 'Pending', count: orderCounts.pending, href: '/orders-picking?status=pending' },
            { id: 'in-progress', label: 'In Progress', count: orderCounts.inProgress, href: '/orders-picking?status=in-progress' },
            { id: 'completed', label: 'Completed', count: orderCounts.completed, href: '/orders-picking?status=completed' },
          ].map(({ id, label, count, href }) => <Link className={`dashboard-bar-row dashboard-order-bar-${id}`} key={id} to={href}>
            <span>{label}</span><span aria-hidden="true" className="dashboard-bar-track"><i style={{ width: `${Math.max(0, Number(count) / Math.max(1, ...Object.values(orderCounts)) * 100)}%` }} /></span><strong>{count}</strong>
          </Link>)}
        </div>}
      </article>
      <article className="dashboard-panel">
        <div className="dashboard-panel-heading"><h2>Stock status</h2><span>Products by on-hand threshold</span></div>
        {Object.values(stockCounts).every((count) => count === 0) ? <p className="dashboard-empty">No product data yet.</p> : <div className="dashboard-bar-list">
          {(['OUT', 'CRITICAL', 'LOW', 'NORMAL'] as const).map((status) => <Link className="dashboard-bar-row" key={status} to={status === 'NORMAL' ? '/inventory?status=normal' : `/inventory?status=${status.toLowerCase()}`}>
            <span>{stockLabels[status]}</span><span aria-hidden="true" className={`dashboard-bar-track dashboard-bar-${status.toLowerCase()}`}><i style={{ width: `${stockCounts[status] / Math.max(1, ...Object.values(stockCounts)) * 100}%` }} /></span><strong>{stockCounts[status]}</strong>
          </Link>)}
        </div>}
      </article>
      <article className="dashboard-panel dashboard-movement-panel">
        <div className="dashboard-panel-heading dashboard-movement-heading"><div><h2>Daily stock movement</h2><small>Last 14 Bangkok calendar days · units</small></div><Link to="/movements?range=30d&type=receive,pick">View movements</Link></div>
        {daily.every((day) => day.receive === 0 && day.pick === 0) ? <p className="dashboard-empty">No RECEIVE or PICK movements in the last 14 days.</p> : <div aria-label="Daily RECEIVE and PICK quantities for the last 14 days" className="dashboard-daily-chart">
          {daily.map((day) => <Link aria-label={`${dateLabel(day.date)}: Receive ${day.receive}, Pick ${day.pick}`} className="dashboard-day" key={day.date} to="/movements?range=30d&type=receive,pick">
            <span className="dashboard-day-total">{day.receive + day.pick}</span><span className="dashboard-day-bars"><i className="dashboard-receive-bar" style={{ height: `${day.receive / maxMovement * 100}%` }} /><i className="dashboard-pick-bar" style={{ height: `${day.pick / maxMovement * 100}%` }} /></span><small>{dateLabel(day.date)}</small><span className="dashboard-day-detail">R {day.receive} · P {day.pick}</span>
          </Link>)}
        </div>}
        <p className="dashboard-chart-legend"><span><i className="dashboard-receive-key" /> Receive</span><span><i className="dashboard-pick-key" /> Pick</span></p>
      </article>
    </section>

    <section className="dashboard-lists">
      <article className="dashboard-panel">
        <div className="dashboard-panel-heading"><div><h2>Stock needing attention</h2><small>Out → Critical → Low, then SKU</small></div><Link to="/inventory?status=out,critical,low">View inventory</Link></div>
        {products.length === 0 ? <p className="dashboard-empty">All products are above their reorder point.</p> : <ul className="dashboard-list">
          {products.map((product) => { const status = getStockStatus(product); const statusClass = status.toLowerCase(); return <li key={product.sku}><Link className="dashboard-list-main" to={`/inventory/${encodeURIComponent(product.sku)}`}><strong>{product.sku}</strong><span>{product.name}</span></Link><span className={`dashboard-status dashboard-status-${statusClass} inventory-status inventory-status-${statusClass}`}>{stockLabels[status]}</span><small>{product.onHand} on hand · reorder at {product.reorderPoint}</small></li>; })}
        </ul>}
      </article>
      <article className="dashboard-panel">
        <div className="dashboard-panel-heading"><div><h2>Overdue or due soon</h2><small>Overdue first; then next due · maximum 5</small></div><Link to="/orders-picking">View orders</Link></div>
        <p className="dashboard-definition">Due soon means an open order due within the next 24 hours. Overdue means due before now.</p>
        {urgentOrders.length === 0 ? <p className="dashboard-empty">No overdue or due-soon orders.</p> : <ol className="dashboard-list dashboard-order-list">
          {urgentOrders.map(({ order, urgency, dueAt }) => <li key={order.id}><Link className="dashboard-list-main" to={`/orders-picking/${encodeURIComponent(order.id)}`}><strong>{order.id}</strong><span>{order.customer}</span></Link><span className={`dashboard-due-label dashboard-due-${urgency}`}>{urgency === 'overdue' ? 'Overdue' : 'Due soon'}</span><small>Due {timestampLabel(new Date(dueAt).toISOString())}</small></li>)}
        </ol>}
      </article>
    </section>

    <section className="dashboard-panel dashboard-activity">
      <div className="dashboard-panel-heading"><div><h2>Recent activity</h2><small>Latest 8 stock movements</small></div><Link to="/movements">View Stock Movements</Link></div>
      {movements.length === 0 ? <p className="dashboard-empty">No stock movements recorded yet.</p> : <ul className="dashboard-list dashboard-activity-list">
        {movements.map((movement) => <li key={movement.id}><span className={`dashboard-movement-type dashboard-movement-${movement.type.toLowerCase()}`}>{movementLabels[movement.type]}</span><Link className="dashboard-list-main" to={`/movements?type=${movement.type.toLowerCase()}&sku=${encodeURIComponent(movement.sku)}`}><strong>{movement.sku}</strong><span>{state.products[movement.sku]?.name ?? movement.sku}</span></Link><strong>{movement.qty > 0 ? '+' : ''}{movement.qty}</strong><small>{timestampLabel(movement.timestamp)} · {movement.reference || movement.reason || 'No reference'}</small></li>)}
      </ul>}
    </section>
  </main>;
}
