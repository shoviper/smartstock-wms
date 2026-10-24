import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  buildManagerSummary,
  filterStockoutPredictions,
  getStockoutMethodSummary,
  selectStockoutInsights,
  type StockoutRisk,
  type StockoutRiskFilter,
  type ManagerIssueSeverity,
} from '../domain/insights';
import type { StockStatus } from '../domain/models';
import { useStore } from '../store/StoreProvider';

const riskOrder: StockoutRisk[] = ['STOCKED_OUT', 'HIGH', 'AT_RISK', 'WATCH', 'OK', 'NO_RECENT_DEMAND'];
const insightSections = [
  { id: 'manager-summary', label: 'Manager Summary' },
  { id: 'stockout-prediction', label: 'Stockout Prediction' },
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

export function AIInsightsPage() {
  const { state } = useStore();
  const [now, setNow] = useState(() => new Date());
  const [riskFilter, setRiskFilter] = useState<StockoutRiskFilter>('ALL');
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const insights = useMemo(() => selectStockoutInsights(state, now), [state, now]);
  const managerSummary = useMemo(() => buildManagerSummary(state, now), [state, now]);
  const visibleRows = useMemo(() => filterStockoutPredictions(insights.predictions, riskFilter), [insights.predictions, riskFilter]);
  const method = useMemo(() => getStockoutMethodSummary(), []);

  return (
    <main className="page-content insights-page">
      <p className="eyebrow">SMARTSTOCK WMS · EXPLORE</p>
      <div className="insights-page-heading">
        <div>
          <h1>AI Insights</h1>
          <p className="intro">Simulated, rule-based insights from current warehouse data.</p>
        </div>
        <div className="insights-as-of">
          <span>Simulated data — concept only</span>
          <small>As of {asOfFormatter.format(insights.asOf)} Bangkok time</small>
        </div>
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
          <div className="manager-summary-explanation">
            <span className="insights-as-of manager-summary-concept">Simulated data — concept only</span>
            <h3>How this summary works</h3>
            <p>{managerSummary.explanation}</p>
            <p>{managerSummary.reviewNote}</p>
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
