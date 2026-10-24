import type { Movement, Product, StockStatus, StoreState } from './models';
import { getStockStatus } from './inventory';

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

export function getStockoutMethodSummary(): StockoutMethodSummary {
  return {
    dataUsed: 'PICK Movements from the trailing 30 days, current on-hand, reorder point, and supplier lead time.',
    formula: 'Average daily use = PICK units ÷ 30. Days of supply = on-hand ÷ average daily use. Stocked out means zero on-hand with demand; High is below 0.5× lead time, At risk below 1×, and Watch below 1.5×. With no recent demand, assign No recent demand and do not divide by zero; note when on-hand is below reorder point. Suggested replenishment = ceil(max(0, reorder point + average daily use × lead time − on-hand)).',
    limitations: 'This is a transparent rule over simulated data, not a model trained on real data, and it makes no accuracy claim.',
    nextStep: 'Review suggested fills and verify supplier lead time before ordering.',
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
