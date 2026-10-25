import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  buildManagerSummary,
  filterStockoutPredictions,
  FAST_MOVER_PERCENTILE,
  getStockoutMethodSummary,
  LOCATION_SCORE_WEIGHTS,
  recommendLocations,
  selectReslottingSuggestions,
  selectStockoutInsights,
  type StockoutRisk,
  type StockoutRiskFilter,
  type ManagerIssueSeverity,
} from '../domain/insights';
import type { Location, Order, OrderLine, StockStatus } from '../domain/models';
import { buildPickingAisleBlocks, DISPATCH_POINT, optimizeRoute, walkingDistance } from '../domain/pickingRoute';
import { useStore } from '../store/StoreProvider';

const riskOrder: StockoutRisk[] = ['STOCKED_OUT', 'HIGH', 'AT_RISK', 'WATCH', 'OK', 'NO_RECENT_DEMAND'];
const insightSections = [
  { id: 'manager-summary', label: 'Manager Summary' },
  { id: 'stockout-prediction', label: 'Stockout Prediction' },
  { id: 'picking-route', label: 'Picking Route' },
  { id: 'storage-location-recommendation', label: 'Storage Location Recommendation' },
];
const severityOrder: ManagerIssueSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM'];
const severityLabels: Record<ManagerIssueSeverity, string> = { CRITICAL: 'Critical', HIGH: 'High', MEDIUM: 'Medium' };
const riskLabels: Record<StockoutRisk, string> = {
  STOCKED_OUT: 'Stocked out', HIGH: 'High', AT_RISK: 'At risk', WATCH: 'Watch', OK: 'OK', NO_RECENT_DEMAND: 'No recent demand',
};
const stockLabels: Record<StockStatus, string> = { OUT: 'Out', CRITICAL: 'Critical', LOW: 'Low', NORMAL: 'Normal' };
const asOfFormatter = new Intl.DateTimeFormat('en', {
  timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
});
const quantity = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
const preciseQuantity = (value: number) => new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

function mapPoint(point: { x: number; y: number }) {
  return { x: 56 + point.x * 18, y: 42 + point.y * 18 };
}

function routePath(sequence: OrderLine[], locationsBySku: Record<string, Location>): string {
  const points = [DISPATCH_POINT, ...sequence.map((line) => locationsBySku[line.sku].coordinates), DISPATCH_POINT].map(mapPoint);
  return points.slice(1).reduce((path, point) => `${path} H ${point.x} V ${point.y}`, `M ${points[0].x} ${points[0].y}`);
}

function sequenceLabelPositions(sequence: OrderLine[], locationsBySku: Record<string, Location>, side: 'baseline' | 'suggested') {
  const occurrences = new Map<string, number>();
  return sequence.map((line, index) => {
    const point = mapPoint(locationsBySku[line.sku].coordinates);
    const key = `${point.x}:${point.y}`;
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return {
      point,
      index,
      x: side === 'baseline' ? point.x - 38 : point.x + 12,
      y: side === 'baseline' ? point.y - 14 - occurrence * 16 : point.y + 4 + occurrence * 16,
    };
  });
}

function SimulatedDataBadge() {
  return <span className="insights-concept-badge">Simulated data — concept only</span>;
}

function PickingRouteMap({
  baseline,
  suggested,
  locationsBySku,
  allLocations,
}: {
  baseline: OrderLine[];
  suggested: OrderLine[];
  locationsBySku: Record<string, Location>;
  allLocations: Record<string, Location>;
}) {
  const occupiedIds = new Set(Object.values(locationsBySku).map((location) => location.id));
  const aisleBlocks = buildPickingAisleBlocks(allLocations, occupiedIds);
  const dispatch = mapPoint(DISPATCH_POINT);
  const baselineLabels = sequenceLabelPositions(baseline, locationsBySku, 'baseline');
  const suggestedLabels = sequenceLabelPositions(suggested, locationsBySku, 'suggested');
  return <div className="picking-route-map-scroll"><svg aria-label="Warehouse picking route map" className="picking-route-map" role="img" viewBox="0 40 1060 430">
    {aisleBlocks.map((block) => {
      return <g key={block.id}><rect className="picking-route-aisle" height={block.height} rx="8" width={block.width} x={block.x} y={block.y} /><text className="picking-route-block-label" textAnchor="middle" x={block.x + block.width / 2} y={block.y - 7}>{`${block.zone}${block.aisle}`}</text></g>;
    })}
    <path className="picking-route-line picking-route-baseline" d={routePath(baseline, locationsBySku)} transform="translate(0 -3)" />
    <path className="picking-route-line picking-route-suggested" d={routePath(suggested, locationsBySku)} />
    <circle className="picking-route-dispatch" cx={dispatch.x} cy={dispatch.y} r="9" />
    <text className="picking-route-point-label" x={dispatch.x + 14} y={dispatch.y - 5}>D · Dispatch</text>
    {baselineLabels.map(({ point, index, x, y }) => {
      return <g key={`baseline-${index}`}><circle className="picking-route-marker picking-route-marker-baseline" cx={point.x} cy={point.y} r="8" /><rect className="picking-route-sequence-label" height="17" rx="4" width="32" x={x} y={y} /><text className="picking-route-sequence-text" textAnchor="middle" x={x + 16} y={y + 12}>{`B${index + 1}`}</text></g>;
    })}
    {suggestedLabels.map(({ point, index, x, y }) => {
      return <g key={`suggested-${index}`}><circle className="picking-route-marker picking-route-marker-suggested" cx={point.x} cy={point.y} r="5" /><rect className="picking-route-sequence-label" height="17" rx="4" width="32" x={x} y={y} /><text className="picking-route-sequence-text" textAnchor="middle" x={x + 16} y={y + 12}>{`A${index + 1}`}</text></g>;
    })}
  </svg></div>;
}

export function AIInsightsPage() {
  const { state } = useStore();
  const [now, setNow] = useState(() => new Date());
  const [riskFilter, setRiskFilter] = useState<StockoutRiskFilter>('ALL');
  const [selectedRouteOrderId, setSelectedRouteOrderId] = useState('');
  const [selectedLocationSku, setSelectedLocationSku] = useState('');
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const insights = useMemo(() => selectStockoutInsights(state, now), [state, now]);
  const managerSummary = useMemo(() => buildManagerSummary(state, now), [state, now]);
  const visibleRows = useMemo(() => filterStockoutPredictions(insights.predictions, riskFilter), [insights.predictions, riskFilter]);
  const method = useMemo(() => getStockoutMethodSummary(), []);
  const routeOrders = useMemo(() => Object.values(state.orders).filter((order) => order.lines.length >= 3), [state.orders]);
  const locationProducts = useMemo(() => Object.values(state.products).sort((left, right) => left.sku.localeCompare(right.sku)), [state.products]);
  const selectedLocationProduct = locationProducts.find((product) => product.sku === selectedLocationSku) ?? locationProducts[0];
  const locationRecommendations = useMemo(() => selectedLocationProduct
    ? recommendLocations(selectedLocationProduct, state, now, 3) : [], [selectedLocationProduct, state, now]);
  const reslottingSuggestions = useMemo(() => selectReslottingSuggestions(state, now, 5), [state, now]);
  const routeLocationsBySku = useMemo(() => Object.fromEntries(Object.values(state.products).flatMap((product) => {
    const location = state.locations[product.locationId];
    return location ? [[product.sku, location]] : [];
  })) as Record<string, Location>, [state.products, state.locations]);
  const selectedRouteOrder = routeOrders.find((order) => order.id === selectedRouteOrderId) ?? routeOrders[0];
  const routeComparison = useMemo(() => {
    if (!selectedRouteOrder) return null;
    const baseline = selectedRouteOrder.lines;
    const suggested = optimizeRoute(baseline, routeLocationsBySku);
    return { baseline, baselineDistance: walkingDistance(baseline, routeLocationsBySku), suggested: suggested.sequence, suggestedDistance: suggested.distanceMeters };
  }, [routeLocationsBySku, selectedRouteOrder]);

  return (
    <main className="page-content insights-page">
      <p className="eyebrow">SMARTSTOCK WMS · EXPLORE</p>
      <div className="insights-page-heading">
        <div className="insights-page-title-row">
          <h1>AI Insights</h1>
          <div className="insights-as-of">
            <span>Simulated data — concept only</span>
            <small>As of {asOfFormatter.format(insights.asOf)} Bangkok time</small>
          </div>
        </div>
        <p className="intro">Simulated, rule-based insights from current warehouse data: Manager Summary, Stockout Prediction, Picking Route and Storage Location Recommendation.</p>
      </div>

      {insightSections.length > 1 && (
        <nav aria-label="AI Insights sections" className="insights-shortcuts">
          {insightSections.map((section) => <a href={`#${section.id}`} key={section.id}>{section.label}</a>)}
        </nav>
      )}

      <section aria-labelledby="manager-summary-title" className="insights-section manager-summary" id="manager-summary">
        <div className="insights-section-heading">
          <div>
            <h2 id="manager-summary-title">Manager Summary</h2>
            <p>Current warehouse issues grouped by severity.</p>
          </div>
        </div>
        <div className="manager-summary-overview">
          <div className="manager-summary-lead">
            <p>{managerSummary.summaryText}</p>
            <h3>Do first</h3>
            {managerSummary.doFirst.length === 0 ? <p className="manager-summary-good-news">No urgent issues. Current rules found nothing requiring attention.</p> : (
              <ol>{managerSummary.doFirst.map((issue) => <li key={issue.id}><span className={`manager-issue-badge manager-issue-${issue.severity.toLowerCase()}`}>{severityLabels[issue.severity]}</span><Link to={issue.href}>{issue.title}</Link><small>{issue.nextAction}</small></li>)}</ol>
            )}
          </div>
          <div className="manager-summary-explanation insights-how-panel">
            <div className="insights-how-heading"><h3>How this summary works</h3><SimulatedDataBadge /></div>
            <div className="insights-how-content"><p>{managerSummary.explanation}</p><p>{managerSummary.reviewNote}</p></div>
          </div>
        </div>
        <div className="manager-summary-groups">
          {severityOrder.map((severity, index) => {
            const issues = managerSummary.bySeverity[severity];
            return <details className="manager-issue-group" key={severity} open={index === 0 && issues.length > 0}>
              <summary><span className={`manager-issue-badge manager-issue-${severity.toLowerCase()}`}>{severityLabels[severity]}</span><strong>{issues.length}</strong><span>issues</span></summary>
              {issues.length === 0 ? <p className="manager-group-empty">No {severityLabels[severity].toLowerCase()} issues.</p> : <ul>{issues.map((issue) => <li key={issue.id}>
                <div className="manager-issue-heading"><strong>{issue.title}</strong><Link to={issue.href}>View details</Link></div>
                <p>{issue.reason}</p><small>{issue.nextAction}</small>
              </li>)}</ul>}
            </details>;
          })}
        </div>
      </section>

      <section aria-labelledby="stockout-prediction-title" className="insights-section" id="stockout-prediction">
        <div className="insights-section-heading">
          <div>
            <h2 id="stockout-prediction-title">Stockout Prediction</h2>
            <p>Estimate how long current stock may last before replenishment arrives.</p>
            <p className="insights-next-action-note">Next action: {method.nextStep}</p>
          </div>
          <SimulatedDataBadge />
        </div>

        <div aria-label="Filter predictions by risk level" className="insights-risk-chips" role="group">
          <button aria-pressed={riskFilter === 'ALL'} className="insights-risk-chip" onClick={() => setRiskFilter('ALL')} type="button">
            <span>All</span><strong>{insights.predictions.length}</strong>
          </button>
          {riskOrder.map((risk) => (
            <button
              aria-pressed={riskFilter === risk}
              className={`insights-risk-chip insights-chip-${risk.toLowerCase().replaceAll('_', '-')}`}
              key={risk}
              onClick={() => setRiskFilter(risk)}
              type="button"
            >
              <span>{riskLabels[risk]}</span><strong>{insights.riskCounts[risk]}</strong>
            </button>
          ))}
        </div>

        {visibleRows.length === 0 ? (
          <section className="filter-empty-state insights-empty">
            <h2>{insights.predictions.length === 0 ? 'No products to analyze' : `No ${riskLabels[riskFilter as StockoutRisk]} products`}</h2>
            <p>{insights.predictions.length === 0 ? 'Product and Movement data will appear here when available.' : 'Choose another risk level to view its predictions.'}</p>
            {insights.predictions.length > 0 && <button className="inventory-clear-button" onClick={() => setRiskFilter('ALL')} type="button">Show all risk levels</button>}
          </section>
        ) : (
          <>
            <div className="insights-table-wrap">
              <table className="insights-table">
                <thead><tr>
                  <th scope="col">SKU / Product</th>
                  <th scope="col">Stock status</th>
                  <th scope="col">On-hand / avg use</th>
                  <th scope="col">Days of supply</th>
                  <th scope="col">Lead time</th>
                  <th scope="col">Risk level</th>
                  <th scope="col">Suggested fill</th>
                  <th scope="col">Product</th>
                </tr></thead>
                <tbody>
                  {visibleRows.map((row) => <Fragment key={row.product.sku}>
                    <tr>
                      <td className="insights-product-cell"><strong>{row.product.sku}</strong><span>{row.product.name}</span></td>
                      <td><span className={`inventory-status inventory-status-${row.stockStatus.toLowerCase()}`}>{stockLabels[row.stockStatus]}</span></td>
                      <td className="insights-usage-cell">
                        <span><strong className="insights-primary-number">{quantity(row.product.onHand)}</strong> <span className="insights-unit">{row.product.unit}</span><small>On-hand</small></span>
                        <span><strong className="insights-primary-number">{preciseQuantity(row.averageDailyUse)}</strong> <span className="insights-unit">{row.product.unit}/day</span><small>Avg use</small></span>
                      </td>
                      <td><strong className="insights-primary-number">{row.daysOfSupply === null ? '—' : preciseQuantity(row.daysOfSupply)}</strong>{row.daysOfSupply !== null && <span className="insights-unit"> days</span>}</td>
                      <td><strong className="insights-primary-number">{quantity(row.leadTimeDays)}</strong><span className="insights-unit"> days</span></td>
                      <td><span className={`insights-risk-badge insights-risk-${row.risk.toLowerCase().replaceAll('_', '-')}`}>{riskLabels[row.risk]}</span></td>
                      <td><strong className="insights-primary-number">{quantity(row.recommendedReplenishment)}</strong> <span className="insights-unit">{row.product.unit}</span></td>
                      <td><Link className="insights-product-link" to={`/inventory/${encodeURIComponent(row.product.sku)}`}>View product</Link></td>
                    </tr>
                    <tr className="insights-reason-row">
                      <td colSpan={8}>
                        <div className="insights-reason-cell">
                          <strong className="insights-reason-title">Reason</strong>
                          <p>{row.reason}</p>
                          <small>{row.suggestedAction}</small>
                          <details><summary>Show calculation</summary><p>{row.calculation}</p></details>
                        </div>
                      </td>
                    </tr>
                  </Fragment>)}
                </tbody>
              </table>
            </div>
            <div aria-label="Stockout predictions" className="insights-cards">
              {visibleRows.map((row) => (
                <article className="insights-card" key={row.product.sku}>
                  <header className="insights-card-heading">
                    <div><strong>{row.product.sku}</strong><span>{row.product.name}</span></div>
                    <span className={`insights-risk-badge insights-risk-${row.risk.toLowerCase().replaceAll('_', '-')}`}>{riskLabels[row.risk]}</span>
                  </header>
                  <div className="insights-card-badges"><span className={`inventory-status inventory-status-${row.stockStatus.toLowerCase()}`}>{stockLabels[row.stockStatus]}</span></div>
                  <dl>
                    <div><dt>On-hand</dt><dd>{quantity(row.product.onHand)} {row.product.unit}</dd></div>
                    <div><dt>Use / day (30 days)</dt><dd>{preciseQuantity(row.averageDailyUse)} {row.product.unit}/day</dd></div>
                    <div><dt>Days of supply</dt><dd>{row.daysOfSupply === null ? '—' : `${preciseQuantity(row.daysOfSupply)} days`}</dd></div>
                    <div><dt>Lead time</dt><dd>{quantity(row.leadTimeDays)} days</dd></div>
                    <div><dt>Suggested fill</dt><dd>{quantity(row.recommendedReplenishment)} {row.product.unit}</dd></div>
                  </dl>
                  <strong className="insights-reason-title">Reason</strong>
                  <p className="insights-card-reason">{row.reason}</p>
                  <small className="insights-card-action">{row.suggestedAction}</small>
                  <details><summary>Show calculation</summary><p>{row.calculation}</p></details>
                  <Link className="insights-product-link" to={`/inventory/${encodeURIComponent(row.product.sku)}`}>View product</Link>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="picking-route-title" className="insights-section picking-route-section" id="picking-route">
        <div className="insights-section-heading">
          <div>
            <h2 id="picking-route-title">Picking Route</h2>
            <p>Compare the saved Order line sequence with a nearest-neighbor suggestion.</p>
          </div>
          <SimulatedDataBadge />
        </div>
        {routeOrders.length === 0 || !routeComparison || !selectedRouteOrder ? (
          <div className="filter-empty-state insights-empty"><h3>No Orders with 3 or more lines</h3><p>Picking Route comparison will appear when an Order has at least three lines.</p></div>
        ) : (
          <>
            <label className="picking-route-order-select">Select Order
              <select onChange={(event) => setSelectedRouteOrderId(event.target.value)} value={selectedRouteOrder.id}>
                {routeOrders.map((order: Order) => <option key={order.id} value={order.id}>{order.id} · {order.customer} ({order.lines.length} lines)</option>)}
              </select>
            </label>
            <div className="picking-route-comparison">
              <article><h3>Baseline · saved Order line order</h3><strong>{routeComparison.baselineDistance} m</strong><p>{routeComparison.baseline.map((line) => line.sku).join(' → ')}</p></article>
              <article><h3>Suggested · nearest-neighbor</h3><strong>{routeComparison.suggestedDistance} m</strong><p>{routeComparison.suggested.map((line) => line.sku).join(' → ')}</p></article>
            </div>
            {routeComparison.baselineDistance > routeComparison.suggestedDistance ? (
              <p className="picking-route-result">Suggested route is {routeComparison.baselineDistance - routeComparison.suggestedDistance} m shorter for this order.</p>
            ) : routeComparison.baselineDistance === routeComparison.suggestedDistance ? (
              <p className="picking-route-result">Suggested route is not shorter for this order. Difference: 0 m.</p>
            ) : (
              <p className="picking-route-result">Suggested route is not shorter for this order; it is {routeComparison.suggestedDistance - routeComparison.baselineDistance} m longer.</p>
            )}
            <p className="picking-route-distance-note">Distances are calculated from coordinates in the simulated warehouse layout, not actual warehouse walking distances.</p>
            <PickingRouteMap allLocations={state.locations} baseline={routeComparison.baseline} locationsBySku={routeLocationsBySku} suggested={routeComparison.suggested} />
            <div aria-label="Picking route map legend" className="picking-route-legend">
              <span><i className="picking-route-legend-line picking-route-legend-baseline" />Baseline (dashed gray)</span>
              <span><i className="picking-route-legend-line picking-route-legend-suggested" />Suggested route (solid blue)</span>
              <span><b>D</b>Dispatch</span><span><b>B1 / A1</b>Pick sequence number</span>
            </div>
            <div className="picking-route-method insights-how-panel">
              <div className="insights-how-heading"><h3>How this works</h3><SimulatedDataBadge /></div>
              <div className="insights-how-content">
                <p><strong>Data used:</strong> product locations for the lines in this Order.</p>
                <p><strong>Method:</strong> simple nearest-neighbor selection from the dispatch point, using Manhattan distance from the simulated coordinates. Ties keep the earlier Order line first.</p>
                <p><strong>Limitations:</strong> this heuristic does not guarantee the shortest route. Distances are calculated from coordinates in the simulated warehouse layout, not actual warehouse walking distances.</p>
              </div>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="storage-location-title" className="insights-section storage-location-section" id="storage-location-recommendation">
        <div className="insights-section-heading">
          <div>
            <h2 id="storage-location-title">Storage Location Recommendation</h2>
            <p>Compare vacant positions using category, PICK activity, distance and capacity.</p>
          </div>
          <SimulatedDataBadge />
        </div>
        <p className="storage-location-roadmap-note">Recommendations only. No product is moved in the store; a real system would create a TRANSFER movement (Roadmap).</p>
        <section aria-labelledby="location-explorer-title" className="storage-location-explorer">
          <h3 id="location-explorer-title">Try a SKU</h3>
          {locationProducts.length === 0 ? <p className="storage-location-empty">No products are available to recommend a location.</p> : (
            <>
              <label className="storage-location-select">Select SKU
                <select onChange={(event) => setSelectedLocationSku(event.target.value)} value={selectedLocationProduct?.sku ?? ''}>
                  {locationProducts.map((product) => <option key={product.sku} value={product.sku}>{product.sku} · {product.name}</option>)}
                </select>
              </label>
              {!locationRecommendations.length ? <p className="storage-location-empty">No vacant location has enough capacity for on-hand plus suggested fill.</p> : (
                <div className="storage-location-recommendations">
                  {locationRecommendations.map((recommendation, index) => <article className="storage-location-card" key={recommendation.location.id}>
                    <div className="storage-location-card-heading"><strong>{index + 1}. {recommendation.location.id}</strong><span>{recommendation.totalScore} points</span></div>
                    <p>{recommendation.reason}</p>
                    <dl>
                      <div><dt>Category zone</dt><dd>{recommendation.factorScores.categoryZone}/{LOCATION_SCORE_WEIGHTS.categoryZone}</dd></div>
                      <div><dt>Velocity fit</dt><dd>{recommendation.factorScores.velocityFit}/{LOCATION_SCORE_WEIGHTS.velocityFit}</dd></div>
                      <div><dt>Capacity fit</dt><dd>{recommendation.factorScores.capacityFit}/{LOCATION_SCORE_WEIGHTS.capacityFit}</dd></div>
                    </dl>
                  </article>)}
                </div>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="reslotting-title" className="storage-reslotting">
          <div className="storage-reslotting-heading"><div><h3 id="reslotting-title">Re-slotting suggestions</h3><p>Up to five suggestions; each vacant location is assigned to one SKU at most.</p></div></div>
          {!reslottingSuggestions.length ? <p className="storage-location-empty">No current product locations meet the re-slotting rules.</p> : (
            <div className="storage-reslotting-list">
              {reslottingSuggestions.map((suggestion) => <article className="storage-reslotting-item" key={suggestion.product.sku}>
                <div className="storage-reslotting-title"><strong>{suggestion.product.sku} · {suggestion.product.name}</strong><span>{suggestion.pickedUnits30Days} PICK units / 30 days</span></div>
                <p>{suggestion.reason}</p>
                <div className="storage-reslotting-route"><span>{suggestion.currentLocation.id}</span><span aria-hidden="true">→</span><span>{suggestion.recommendation.location.id}</span></div>
                <small>Simulated dispatch distance: {suggestion.currentDistanceMeters} m → {suggestion.recommendation.dispatchDistanceMeters} m ({suggestion.distanceChangeMeters > 0 ? '+' : ''}{suggestion.distanceChangeMeters} m)</small>
              </article>)}
            </div>
          )}
        </section>

        <div className="storage-location-method insights-how-panel">
          <div className="insights-how-heading"><h3>How this works</h3><SimulatedDataBadge /></div>
          <div className="insights-how-content">
            <p><strong>Data used:</strong> vacant positions, category locations, product on-hand, reorder point, lead time and PICK movements in the last 30 days.</p>
            <p><strong>Rules:</strong> category zone {LOCATION_SCORE_WEIGHTS.categoryZone} points, velocity fit {LOCATION_SCORE_WEIGHTS.velocityFit} points and capacity fit {LOCATION_SCORE_WEIGHTS.capacityFit} points. Fast-moving means the top quartile among SKUs with PICK demand in the last 30 days; the cutoff is the nearest-rank {Math.round(FAST_MOVER_PERCENTILE * 100)}th percentile and ties at the cutoff count as fast. No-demand SKUs count as slow. Distance uses Manhattan coordinates from dispatch (0,5).</p>
            <p><strong>Limitations:</strong> these are simulated recommendations only and do not move products. A real system would create a TRANSFER movement, which is on the Roadmap. Verify warehouse layout and capacity before acting.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="insights-method-title" className="insights-method-card">
        <h2 id="insights-method-title">How this works</h2>
        <div className="insights-method-grid">
          <div><h3>Data used</h3><p>{method.dataUsed}</p></div>
          <div><h3>Rules</h3><p>{method.formula}</p></div>
          <div><h3>Limitations</h3><p>{method.limitations}</p></div>
        </div>
      </section>
    </main>
  );
}
