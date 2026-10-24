import type { Movement, Product, StockStatus, StoreState } from './models';
import { getStockStatus } from './inventory';
import { isLargeVariance } from './adjustment';

export const STOCKOUT_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type StockoutRisk = 'STOCKED_OUT' | 'HIGH' | 'AT_RISK' | 'WATCH' | 'OK' | 'NO_RECENT_DEMAND';
export type StockoutRiskFilter = StockoutRisk | 'ALL';

export interface StockoutPrediction {
  product: Product;
  stockStatus: StockStatus;
  pickedUnits30Days: number;
  averageDailyUse: number;
  daysOfSupply: number | null;
  leadTimeDays: number;
  risk: StockoutRisk;
  recommendedReplenishment: number;
  reason: string;
  calculation: string;
  suggestedAction: string;
}

export interface StockoutInsights {
  asOf: Date;
  predictions: StockoutPrediction[];
  riskCounts: Record<StockoutRisk, number>;
}

export interface StockoutMethodSummary {
  dataUsed: string;
  formula: string;
  limitations: string;
  nextStep: string;
}

export type ManagerIssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';
export type ManagerIssueEntityType = 'SKU' | 'ORDER' | 'MOVEMENT';

export interface ManagerIssue {
  id: string;
  entityType: ManagerIssueEntityType;
  entityId: string;
  severity: ManagerIssueSeverity;
  title: string;
  reason: string;
  nextAction: string;
  href: string;
}

export interface ManagerSummary {
  generatedAt: Date;
  summaryText: string;
  issues: ManagerIssue[];
  bySeverity: Record<ManagerIssueSeverity, ManagerIssue[]>;
  doFirst: ManagerIssue[];
  explanation: string;
  reviewNote: string;
}

export function getStockoutMethodSummary(): StockoutMethodSummary {
  return {
    dataUsed: 'PICK Movements from the trailing 30 days, current on-hand, reorder point, and supplier lead time.',
    formula: 'Average daily use = PICK units ÷ 30. Days of supply = on-hand ÷ average daily use. Stocked out means zero on-hand with demand; High is below 0.5× lead time, At risk below 1×, and Watch below 1.5×. With no recent demand, assign No recent demand and do not divide by zero; note when on-hand is below reorder point. Suggested replenishment = ceil(max(0, reorder point + average daily use × lead time − on-hand)).',
    limitations: 'This is a transparent rule over simulated data, not a model trained on real data, and it makes no accuracy claim.',
    nextStep: 'Review suggested fills and verify supplier lead time before ordering.',
  };
}

const MANAGER_SEVERITY_ORDER: Record<ManagerIssueSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
const MANAGER_SEVEN_DAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const MANAGER_DUE_WINDOW_MS = 24 * 60 * 60 * 1000;

interface MutableManagerIssue {
  issue: ManagerIssue;
  reasons: Set<string>;
  priority: number;
  urgency: number;
}

function isOpenOrderStatus(status: string): boolean {
  return status === 'PENDING' || status === 'IN_PROGRESS';
}

function formatBangkokDateTime(timestamp: string): string {
  const value = new Date(timestamp);
  if (!Number.isFinite(value.getTime())) return 'an unknown due time';
  return new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short',
  }).format(value);
}

function buildManagerSummarySentence(issues: ManagerIssue[], bySeverity: ManagerSummary['bySeverity']): string {
  if (issues.length === 0) return 'No urgent issues need attention today.';
  const noun = issues.length === 1 ? 'issue needs' : 'issues need';
  return `${issues.length} ${noun} attention today: ${bySeverity.CRITICAL.length} critical, ${bySeverity.HIGH.length} high, and ${bySeverity.MEDIUM.length} medium.`;
}

export function buildManagerSummary(state: StoreState, now: Date): ManagerSummary {
  const nowMs = now.getTime();
  const validNow = Number.isFinite(nowMs) ? nowMs : 0;
  const openOrders = Object.values(state.orders).filter((order) => isOpenOrderStatus(order.status));
  const stockoutBySku = new Map(selectStockoutInsights(state, now).predictions.map((row) => [row.product.sku, row]));
  const issueMap = new Map<string, MutableManagerIssue>();

  function addIssue(issue: ManagerIssue, priority: number, urgency = 0): void {
    const existing = issueMap.get(issue.id);
    if (!existing) {
      issueMap.set(issue.id, { issue, reasons: new Set([issue.reason]), priority, urgency });
      return;
    }
    existing.reasons.add(issue.reason);
    if (MANAGER_SEVERITY_ORDER[issue.severity] < MANAGER_SEVERITY_ORDER[existing.issue.severity]
      || (issue.severity === existing.issue.severity && priority < existing.priority)) {
      existing.issue = { ...issue, reason: [...existing.reasons].join(' ') };
    }
    existing.priority = Math.min(existing.priority, priority);
    existing.urgency = Math.min(existing.urgency, urgency);
  }

  for (const product of Object.values(state.products)) {
    const sku = product.sku;
    const status = getStockStatus(product);
    const prediction = stockoutBySku.get(sku);
    const openDemandLines = openOrders.flatMap((order) => order.lines
      .filter((line) => line.sku === sku && line.qty - line.pickedQty - (line.shortQty ?? 0) > 0)
      .map((line) => ({ order, remaining: line.qty - line.pickedQty - (line.shortQty ?? 0) })));

    if (status === 'OUT' && openDemandLines.length > 0) {
      const remainingUnits = openDemandLines.reduce((sum, line) => sum + line.remaining, 0);
      const orderCount = new Set(openDemandLines.map(({ order }) => order.id)).size;
      addIssue({
        id: `SKU:${sku}`, entityType: 'SKU', entityId: sku, severity: 'CRITICAL',
        title: `${sku} is out of stock with open demand`,
        reason: `On-hand is 0; ${remainingUnits} units remain to pick across ${orderCount} open order${orderCount === 1 ? '' : 's'}.`,
        nextAction: 'Prioritize replenishment before picking the remaining demand.',
        href: `/inventory/${encodeURIComponent(sku)}`,
      }, 0);
    }

    if (prediction && (prediction.risk === 'STOCKED_OUT' || prediction.risk === 'HIGH')) {
      addIssue({
        id: `SKU:${sku}`, entityType: 'SKU', entityId: sku, severity: 'CRITICAL',
        title: `${sku} may run out before replenishment`,
        reason: `Stockout Prediction: ${prediction.reason} Suggested fill is ${prediction.recommendedReplenishment} ${product.unit}.`,
        nextAction: `Review the ${prediction.recommendedReplenishment} ${product.unit} fill and verify supplier lead time.`,
        href: `/inventory/${encodeURIComponent(sku)}`,
      }, prediction.risk === 'STOCKED_OUT' ? 1 : 2);
    }

    if (status === 'CRITICAL') {
      addIssue({
        id: `SKU:${sku}`, entityType: 'SKU', entityId: sku, severity: 'HIGH',
        title: `${sku} stock is Critical`,
        reason: `On-hand is ${product.onHand}, at or below the Critical threshold of ${product.reorderPoint * 0.5} (${product.reorderPoint} reorder point).`,
        nextAction: 'Review stock accuracy and plan replenishment.',
        href: `/inventory/${encodeURIComponent(sku)}`,
      }, 3);
    }

    if (status === 'LOW') {
      addIssue({
        id: `SKU:${sku}`, entityType: 'SKU', entityId: sku, severity: 'MEDIUM',
        title: `${sku} is below reorder point`,
        reason: `On-hand is ${product.onHand} against a reorder point of ${product.reorderPoint}.`,
        nextAction: 'Review replenishment needs.',
        href: `/inventory/${encodeURIComponent(sku)}`,
      }, 7);
    }

    if (prediction && (prediction.risk === 'AT_RISK' || prediction.risk === 'WATCH')) {
      addIssue({
        id: `SKU:${sku}`, entityType: 'SKU', entityId: sku, severity: 'MEDIUM',
        title: `${sku} has ${prediction.risk === 'AT_RISK' ? 'At risk' : 'Watch'} stock cover`,
        reason: `Stockout Prediction: ${prediction.reason} Suggested fill is ${prediction.recommendedReplenishment} ${product.unit}.`,
        nextAction: `Review the ${prediction.recommendedReplenishment} ${product.unit} fill and verify supplier lead time.`,
        href: `/inventory/${encodeURIComponent(sku)}`,
      }, prediction.risk === 'AT_RISK' ? 8 : 9);
    }
  }

  for (const order of Object.values(state.orders)) {
    const dueAt = Date.parse(order.dueAt);
    if (!Number.isFinite(dueAt)) continue;
    if (isOpenOrderStatus(order.status) && dueAt < validNow) {
      addIssue({
        id: `ORDER:${order.id}`, entityType: 'ORDER', entityId: order.id, severity: 'CRITICAL',
        title: `Order ${order.id} is overdue`,
        reason: `Order ${order.id} (${order.customer}) was due ${formatBangkokDateTime(order.dueAt)} and remains ${order.status === 'PENDING' ? 'Pending' : 'In Progress'}.`,
        nextAction: 'Open the order and resolve the remaining lines or update its delivery plan.',
        href: `/orders-picking/${encodeURIComponent(order.id)}`,
      }, 0, dueAt);
    } else if (order.status === 'PENDING' && dueAt >= validNow && dueAt <= validNow + MANAGER_DUE_WINDOW_MS) {
      const hoursUntilDue = Math.max(0, Math.ceil((dueAt - validNow) / (60 * 60 * 1000)));
      addIssue({
        id: `ORDER:${order.id}`, entityType: 'ORDER', entityId: order.id, severity: 'HIGH',
        title: `Pending order ${order.id} is due soon`,
        reason: `Order ${order.id} (${order.customer}) is due in ${hoursUntilDue} hour${hoursUntilDue === 1 ? '' : 's'} at ${formatBangkokDateTime(order.dueAt)}.`,
        nextAction: 'Start picking and confirm the assigned picker.',
        href: `/orders-picking/${encodeURIComponent(order.id)}`,
      }, 4, dueAt);
    }

    const completedAt = order.completedAt ? Date.parse(order.completedAt) : Number.NaN;
    const shortLines = order.lines.filter((line) => (line.shortQty ?? 0) > 0);
    if ((order.status === 'COMPLETED' || order.status === 'COMPLETED_WITH_SHORTAGE')
      && Number.isFinite(completedAt) && completedAt >= validNow - MANAGER_SEVEN_DAY_WINDOW_MS
      && completedAt <= validNow && shortLines.length > 0) {
      const lineCount = shortLines.length;
      addIssue({
        id: `ORDER:${order.id}`, entityType: 'ORDER', entityId: order.id, severity: 'HIGH',
        title: `Order ${order.id} completed with short picks`,
        reason: `Order ${order.id} completed with ${lineCount} short line${lineCount === 1 ? '' : 's'} in the last 7 days.`,
        nextAction: 'Review the short lines and follow up on unavailable quantities.',
        href: `/orders-picking/${encodeURIComponent(order.id)}`,
      }, 5);
    }
  }

  for (const movement of state.movements) {
    if (movement.type !== 'ADJUST' || !isLargeVariance(movement.qtyBefore, movement.qtyAfter)) continue;
    const timestamp = Date.parse(movement.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < validNow - MANAGER_SEVEN_DAY_WINDOW_MS || timestamp > validNow) continue;
    const difference = movement.qtyAfter - movement.qtyBefore;
    addIssue({
      id: `MOVEMENT:${movement.id}`, entityType: 'MOVEMENT', entityId: movement.id, severity: 'HIGH',
      title: `Large adjustment for ${movement.sku}`,
      reason: `Adjustment ${movement.id} changed ${movement.sku} from ${movement.qtyBefore} to ${movement.qtyAfter} (${difference > 0 ? '+' : ''}${difference} units) within the last 7 days.`,
      nextAction: 'Review the count, reason, and Movement history.',
      href: '/movements',
    }, 6);
  }

  const mutableIssues = [...issueMap.values()];
  for (const item of mutableIssues) item.issue = { ...item.issue, reason: [...item.reasons].join(' ') };
  const compareUrgency = (left: MutableManagerIssue, right: MutableManagerIssue) => left.priority - right.priority
    || left.urgency - right.urgency || left.issue.title.localeCompare(right.issue.title);
  const issues: ManagerIssue[] = [];
  for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM'] as const) {
    const group = mutableIssues.filter(({ issue }) => issue.severity === severity);
    const products = group.filter(({ issue }) => issue.entityType === 'SKU').sort(compareUrgency);
    const orders = group.filter(({ issue }) => issue.entityType === 'ORDER').sort(compareUrgency);
    const other = group.filter(({ issue }) => issue.entityType === 'MOVEMENT').sort(compareUrgency);
    let productIndex = 0;
    let orderIndex = 0;
    let takeProduct = products.length > 0 && (orders.length === 0 || compareUrgency(products[0], orders[0]) <= 0);
    while (productIndex < products.length || orderIndex < orders.length) {
      if (productIndex >= products.length) takeProduct = false;
      else if (orderIndex >= orders.length) takeProduct = true;
      if (takeProduct) issues.push(products[productIndex++].issue);
      else issues.push(orders[orderIndex++].issue);
      takeProduct = !takeProduct;
    }
    issues.push(...other.map(({ issue }) => issue));
  }
  const bySeverity: ManagerSummary['bySeverity'] = {
    CRITICAL: issues.filter((issue) => issue.severity === 'CRITICAL'),
    HIGH: issues.filter((issue) => issue.severity === 'HIGH'),
    MEDIUM: issues.filter((issue) => issue.severity === 'MEDIUM'),
  };
  const summaryText = buildManagerSummarySentence(issues, bySeverity);
  const explanation = `Generated from ${Object.keys(state.products).length} SKUs, ${Object.keys(state.orders).length} orders, and ${state.movements.length} Movements. Rules: open demand with Out stock or High/Stocked out prediction is Critical; Critical stock, overdue orders, due-soon Pending orders, recent short picks, and large recent adjustments are High; Low stock and At risk/Watch predictions are Medium. Short pick uses the Order completion time as a proxy because the system does not record when the short occurred.`;

  return {
    generatedAt: new Date(validNow),
    summaryText,
    issues,
    bySeverity,
    doFirst: issues.slice(0, 3),
    explanation,
    reviewNote: 'This is simulated, rule-based information. A manager must verify the source records and confirm next steps before acting.',
  };
}

const RISK_ORDER: Record<StockoutRisk, number> = {
  STOCKED_OUT: 0,
  HIGH: 1,
  AT_RISK: 2,
  WATCH: 3,
  OK: 4,
  NO_RECENT_DEMAND: 5,
};

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits }).format(value);
}

function formatCalculationNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function dailyUseUnit(averageDailyUse: number): string {
  return averageDailyUse === 1 ? 'unit/day' : 'units/day';
}

function formatReasonDailyUse(averageDailyUse: number): string {
  return averageDailyUse === 1 ? '1' : formatCalculationNumber(averageDailyUse);
}

function sumRecentPickUnits(movements: Movement[], sku: string, now: Date): number {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return 0;
  const cutoff = nowMs - STOCKOUT_WINDOW_DAYS * DAY_MS;
  return movements.reduce((total, movement) => {
    if (movement.type !== 'PICK' || movement.sku !== sku) return total;
    const timestamp = Date.parse(movement.timestamp);
    if (!Number.isFinite(timestamp) || timestamp < cutoff || timestamp > nowMs) return total;
    const quantity = Math.abs(movement.qty);
    return Number.isFinite(quantity) ? total + quantity : total;
  }, 0);
}

function getRisk(onHand: number, averageDailyUse: number, daysOfSupply: number | null, leadTimeDays: number): StockoutRisk {
  if (averageDailyUse === 0) return 'NO_RECENT_DEMAND';
  if (onHand === 0) return 'STOCKED_OUT';
  if (daysOfSupply === null) return 'OK';
  if (daysOfSupply < leadTimeDays * 0.5) return 'HIGH';
  if (daysOfSupply < leadTimeDays) return 'AT_RISK';
  if (daysOfSupply < leadTimeDays * 1.5) return 'WATCH';
  return 'OK';
}

function getRecommendedReplenishment(onHand: number, reorderPoint: number, averageDailyUse: number, leadTimeDays: number): number {
  const raw = reorderPoint + averageDailyUse * leadTimeDays - onHand;
  if (!Number.isFinite(raw)) return Number.MAX_SAFE_INTEGER;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(Math.max(0, raw)));
}

function buildReason(
  onHand: number,
  reorderPoint: number,
  averageDailyUse: number,
  daysOfSupply: number | null,
  leadTimeDays: number,
  risk: StockoutRisk,
): string {
  if (risk === 'NO_RECENT_DEMAND') {
    const demandMessage = 'No PICK demand in the last 30 days; no stockout risk score is assigned.';
    return onHand < reorderPoint
      ? `${demandMessage} On-hand ${formatNumber(onHand, 0)} is below the reorder point of ${formatNumber(reorderPoint, 0)}.`
      : demandMessage;
  }
  if (risk === 'STOCKED_OUT') {
    return `On-hand is 0 while PICK demand averages ${formatReasonDailyUse(averageDailyUse)} ${dailyUseUnit(averageDailyUse)} over 30 days.`;
  }
  if (daysOfSupply === null) return 'Stock cover could not be estimated from the available values.';
  const cover = formatCalculationNumber(daysOfSupply);
  const dailyUse = formatReasonDailyUse(averageDailyUse);
  const lead = formatNumber(leadTimeDays, 0);
  if (risk === 'HIGH') {
    return `On-hand ${formatNumber(onHand, 0)} covers about ${cover} days at ${dailyUse} ${dailyUseUnit(averageDailyUse)}, shorter than half of the ${lead}-day lead time.`;
  }
  if (risk === 'AT_RISK') {
    return `On-hand ${formatNumber(onHand, 0)} covers about ${cover} days at ${dailyUse} ${dailyUseUnit(averageDailyUse)}, shorter than the ${lead}-day lead time.`;
  }
  if (risk === 'WATCH') {
    return `On-hand ${formatNumber(onHand, 0)} covers about ${cover} days at ${dailyUse} ${dailyUseUnit(averageDailyUse)}, below 1.5× the ${lead}-day lead time.`;
  }
  return `On-hand ${formatNumber(onHand, 0)} covers about ${cover} days at ${dailyUse} ${dailyUseUnit(averageDailyUse)}, beyond the ${lead}-day lead time watch threshold.`;
}

function buildCalculation(
  pickedUnits30Days: number,
  onHand: number,
  reorderPoint: number,
  averageDailyUse: number,
  daysOfSupply: number | null,
  leadTimeDays: number,
  risk: StockoutRisk,
  recommendedReplenishment: number,
): string {
  const pickUnits = formatCalculationNumber(pickedUnits30Days);
  const windowDays = formatCalculationNumber(STOCKOUT_WINDOW_DAYS);
  const lead = formatCalculationNumber(leadTimeDays);
  const averageExpression = `(${pickUnits} / ${windowDays})`;
  const averageText = `${pickUnits} / ${windowDays} = ${formatCalculationNumber(averageDailyUse)} ${dailyUseUnit(averageDailyUse)}`;
  const recommendation = `Suggested replenishment = ceil(max(0, reorder point + (PICK units / 30) × lead time − on-hand)) = ceil(max(0, ${formatCalculationNumber(reorderPoint)} + ${averageExpression} × ${lead} − ${formatCalculationNumber(onHand)})) = ${formatCalculationNumber(recommendedReplenishment)} units.`;
  if (risk === 'NO_RECENT_DEMAND') {
    return `Average daily use = 30-day PICK units / 30 = ${averageText}. Days of supply is not calculated because demand is zero. ${recommendation}`;
  }
  const coverText = daysOfSupply === null
    ? 'Days of supply could not be represented as a finite number.'
    : `Days of supply = on-hand / (PICK units / 30) = ${formatCalculationNumber(onHand)} / ${averageExpression} = ${formatCalculationNumber(daysOfSupply)} days.`;
  const days = daysOfSupply ?? 0;
  const halfLead = leadTimeDays * 0.5;
  const watchLimit = leadTimeDays * 1.5;
  const coverExpression = `${formatCalculationNumber(onHand)} / ${averageExpression} = ${formatCalculationNumber(days)}`;
  const threshold = risk === 'STOCKED_OUT'
    ? 'Stocked out: on-hand is 0 while recent PICK demand exists.'
    : risk === 'HIGH'
      ? `Risk check: ${coverExpression} days < ${lead} × 0.50 = ${formatCalculationNumber(halfLead)} days, so High.`
      : risk === 'AT_RISK'
        ? `Risk check: ${coverExpression} days is ≥ ${formatCalculationNumber(halfLead)} and < ${lead} lead-time days, so At risk.`
        : risk === 'WATCH'
          ? `Risk check: ${coverExpression} days is ≥ ${lead} and < ${lead} × 1.50 = ${formatCalculationNumber(watchLimit)} days, so Watch.`
          : `Risk check: ${coverExpression} days is ≥ ${formatCalculationNumber(watchLimit)}-day Watch threshold, so OK.`;
  return `Average daily use = 30-day PICK units / 30 = ${averageText}. ${coverText} ${threshold} ${recommendation}`;
}

function predictProduct(product: Product, movements: Movement[], now: Date): StockoutPrediction {
  const onHand = finiteNonNegative(product.onHand);
  const reorderPoint = finiteNonNegative(product.reorderPoint);
  const leadTimeDays = finiteNonNegative(product.leadTimeDays);
  const pickedUnits30Days = finiteNonNegative(sumRecentPickUnits(movements, product.sku, now));
  const averageDailyUse = finiteNonNegative(pickedUnits30Days / STOCKOUT_WINDOW_DAYS);
  const rawDaysOfSupply = averageDailyUse > 0 ? onHand / averageDailyUse : null;
  const daysOfSupply = rawDaysOfSupply !== null && Number.isFinite(rawDaysOfSupply) ? rawDaysOfSupply : null;
  const risk = getRisk(onHand, averageDailyUse, daysOfSupply, leadTimeDays);
  const recommendedReplenishment = getRecommendedReplenishment(onHand, reorderPoint, averageDailyUse, leadTimeDays);
  return {
    product,
    stockStatus: getStockStatus({ ...product, onHand }),
    pickedUnits30Days,
    averageDailyUse,
    daysOfSupply,
    leadTimeDays,
    risk,
    recommendedReplenishment,
    reason: buildReason(onHand, reorderPoint, averageDailyUse, daysOfSupply, leadTimeDays, risk),
    calculation: buildCalculation(pickedUnits30Days, onHand, reorderPoint, averageDailyUse, daysOfSupply, leadTimeDays, risk, recommendedReplenishment),
    suggestedAction: `Suggested fill: ${formatNumber(recommendedReplenishment, 0)} ${product.unit}`,
  };
}

export function selectStockoutInsights(state: StoreState, now: Date): StockoutInsights {
  const predictions = Object.values(state.products)
    .map((product) => predictProduct(product, state.movements, now))
    .sort((left, right) => RISK_ORDER[left.risk] - RISK_ORDER[right.risk]
      || (left.daysOfSupply ?? Number.MAX_SAFE_INTEGER) - (right.daysOfSupply ?? Number.MAX_SAFE_INTEGER)
      || left.product.sku.localeCompare(right.product.sku));
  const riskCounts: StockoutInsights['riskCounts'] = {
    STOCKED_OUT: 0, HIGH: 0, AT_RISK: 0, WATCH: 0, OK: 0, NO_RECENT_DEMAND: 0,
  };
  for (const prediction of predictions) riskCounts[prediction.risk] += 1;
  const nowMs = now.getTime();
  return { asOf: new Date(Number.isFinite(nowMs) ? nowMs : 0), predictions, riskCounts };
}

export function filterStockoutPredictions(predictions: StockoutPrediction[], risk: StockoutRiskFilter): StockoutPrediction[] {
  return risk === 'ALL' ? predictions : predictions.filter((prediction) => prediction.risk === risk);
}
