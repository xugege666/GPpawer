/** Deterministic, synthetic daily data. This module does not fetch market prices. */
export type StrategyId = "trend" | "momentum" | "reversion";
export type Period = "1y" | "3y" | "5y";

export interface BacktestConfig {
  strategy: StrategyId;
  period: Period;
  initialCapital: number;
  feeBps: number;
  maxPosition: number;
  stopLoss: number;
  shortWindow: number;
  longWindow: number;
}

export const DEFAULT_CONFIG: BacktestConfig = {
  strategy: "trend",
  period: "3y",
  initialCapital: 1_000_000,
  feeBps: 5,
  maxPosition: 0.8,
  stopLoss: 0.08,
  shortWindow: 10,
  longWindow: 40,
};

export interface EquityPoint {
  date: string;
  equity: number;
  benchmark: number;
  drawdown: number;
}

export interface Trade {
  date: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  fee: number;
  reason: string;
  pnl: number | null;
}

export interface BacktestResult {
  config: BacktestConfig;
  points: EquityPoint[];
  trades: Trade[];
  totalReturn: number;
  annualReturn: number;
  /** Maximum drawdown as a positive magnitude; point drawdowns are negative. */
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
  /** Number of holding cycles fully closed during the sample. */
  completedTrades: number;
  annualVolatility: number;
  benchmarkReturn: number;
  finalEquity: number;
  positionValue: number;
  cash: number;
  quantity: number;
  lastPrice: number;
  totalFees: number;
  annualReturns: { year: string; strategy: number; benchmark: number }[];
  monthlyReturns: { month: string; value: number }[];
  sampleLabel: string;
}

interface Bar {
  date: string;
  open: number;
  close: number;
}

const PERIOD_DAYS: Record<Period, number> = {
  "1y": 252,
  "3y": 756,
  "5y": 1260,
};
const LOT_SIZE = 100;
const DAYS_PER_YEAR = 252;

export function validateConfig(config: BacktestConfig): string[] {
  const errors: string[] = [];
  if (!["trend", "momentum", "reversion"].includes(config.strategy))
    errors.push("请选择有效的策略模板。");
  if (!Object.hasOwn(PERIOD_DAYS, config.period))
    errors.push("请选择 1 年、3 年或 5 年回测区间。");
  if (
    !Number.isFinite(config.initialCapital) ||
    config.initialCapital <= 0 ||
    config.initialCapital > 1e12
  ) {
    errors.push("初始资金必须大于 0 且不超过 1 万亿元。");
  }
  if (
    !Number.isFinite(config.feeBps) ||
    config.feeBps < 0 ||
    config.feeBps > 100
  ) {
    errors.push("交易费率必须在 0–100 个基点之间。");
  }
  if (
    !Number.isFinite(config.maxPosition) ||
    config.maxPosition < 0 ||
    config.maxPosition > 1
  ) {
    errors.push("最大仓位必须在 0%–100% 之间。");
  }
  if (
    !Number.isFinite(config.stopLoss) ||
    config.stopLoss <= 0 ||
    config.stopLoss > 1
  ) {
    errors.push("止损比例必须大于 0% 且不超过 100%。");
  }
  if (
    !Number.isInteger(config.shortWindow) ||
    config.shortWindow < 2 ||
    config.shortWindow > 120
  ) {
    errors.push("短周期必须为 2–120 个交易日的整数。");
  }
  if (
    !Number.isInteger(config.longWindow) ||
    config.longWindow < 3 ||
    config.longWindow > 240
  ) {
    errors.push("长周期必须为 3–240 个交易日的整数。");
  }
  if (config.shortWindow >= config.longWindow)
    errors.push("短周期必须小于长周期。");
  return errors;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function createSyntheticBars(): Bar[] {
  const dates: string[] = [];
  const day = new Date("2026-09-30T00:00:00Z");
  // Extra history supplies indicators before each requested sample starts.
  while (dates.length < 1600) {
    const weekday = day.getUTCDay();
    if (weekday !== 0 && weekday !== 6)
      dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() - 1);
  }
  dates.reverse();
  const random = seededRandom(20260930);
  let close = 42;
  return dates.map((date, index) => {
    // Cyclic trend, alternating volatility, and seeded shocks create distinct
    // conditions without claiming to reproduce any exchange or listed stock.
    const cycle =
      Math.sin(index / 57) * 0.0017 + Math.sin(index / 173) * 0.0007;
    const volatility = 0.008 + (Math.sin(index / 91) > 0.5 ? 0.007 : 0);
    const overnight = (random() - 0.5) * volatility * 0.48;
    const open = close * (1 + overnight);
    const shock = (random() + random() + random() - 1.5) * volatility;
    close = Math.max(5, open * (1 + 0.00032 + cycle + shock));
    return { date, open, close };
  });
}

const MARKET = createSyntheticBars();

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deviation(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      (values.length - 1),
  );
}

type PendingOrder = { action: "enter" | "exit" | "rebalance"; reason: string };

function strategySignal(
  index: number,
  holding: boolean,
  config: BacktestConfig,
): PendingOrder | null {
  const close = MARKET[index].close;
  const shortPrices = MARKET.slice(
    index - config.shortWindow + 1,
    index + 1,
  ).map((bar) => bar.close);
  const longPrices = MARKET.slice(index - config.longWindow + 1, index + 1).map(
    (bar) => bar.close,
  );
  const shortMean = average(shortPrices);
  const longMean = average(longPrices);
  const signalDate = MARKET[index].date;
  if (config.strategy === "trend") {
    if (!holding && shortMean > longMean * 1.003) {
      return {
        action: "enter",
        reason: `${signalDate} 收盘：短期均线突破长期均线`,
      };
    }
    if (holding && shortMean < longMean * 0.997) {
      return {
        action: "exit",
        reason: `${signalDate} 收盘：短期均线跌破长期均线`,
      };
    }
  } else if (config.strategy === "momentum") {
    const momentum = close / MARKET[index - config.longWindow].close - 1;
    const recentMomentum = close / MARKET[index - config.shortWindow].close - 1;
    if (!holding && momentum > 0.035 && recentMomentum > 0.008) {
      return {
        action: "enter",
        reason: `${signalDate} 收盘：中期动量与短期动量同时转强`,
      };
    }
    if (holding && (momentum < 0 || recentMomentum < -0.025)) {
      return {
        action: "exit",
        reason: `${signalDate} 收盘：动量减弱，退出持仓`,
      };
    }
  } else {
    const sigma = deviation(longPrices);
    const zScore = sigma > 0 ? (close - longMean) / sigma : 0;
    if (!holding && zScore < -1.25 && close > shortMean * 0.97) {
      return {
        action: "enter",
        reason: `${signalDate} 收盘：价格偏离均值超过 1.25 倍标准差`,
      };
    }
    if (holding && zScore > 0.15) {
      return { action: "exit", reason: `${signalDate} 收盘：价格回归均值` };
    }
  }
  return null;
}

function periodReturns(points: EquityPoint[]): {
  annualReturns: BacktestResult["annualReturns"];
  monthlyReturns: BacktestResult["monthlyReturns"];
} {
  const years = new Map<
    string,
    { start: number; benchmarkStart: number; end: number; benchmarkEnd: number }
  >();
  const months = new Map<string, { start: number; end: number }>();
  let previous: EquityPoint | undefined;
  for (const point of points) {
    const year = point.date.slice(0, 4);
    const month = point.date.slice(0, 7);
    const yearEntry = years.get(year) ?? {
      start: previous?.equity ?? point.equity,
      benchmarkStart: previous?.benchmark ?? point.benchmark,
      end: point.equity,
      benchmarkEnd: point.benchmark,
    };
    yearEntry.end = point.equity;
    yearEntry.benchmarkEnd = point.benchmark;
    years.set(year, yearEntry);
    const monthEntry = months.get(month) ?? {
      start: previous?.equity ?? point.equity,
      end: point.equity,
    };
    monthEntry.end = point.equity;
    months.set(month, monthEntry);
    previous = point;
  }
  return {
    annualReturns: [...years].map(([year, value]) => ({
      year,
      strategy: value.end / value.start - 1,
      benchmark: value.benchmarkEnd / value.benchmarkStart - 1,
    })),
    monthlyReturns: [...months].map(([month, value]) => ({
      month,
      value: value.end / value.start - 1,
    })),
  };
}

export function runBacktest(input: BacktestConfig): BacktestResult {
  const config = { ...input };
  const errors = validateConfig(config);
  if (errors.length) throw new Error(errors.join("\n"));

  const sample = MARKET.slice(-PERIOD_DAYS[config.period]);
  const marketOffset = MARKET.length - sample.length;
  const feeRate = config.feeBps / 10_000;
  let cash = config.initialCapital;
  let quantity = 0;
  let entryPrice = 0;
  let entryUnitCost = 0;
  let totalFees = 0;
  let cyclePnl = 0;
  const completedCyclePnls: number[] = [];
  let peak = 1;
  let pending: PendingOrder | null = null;
  const trades: Trade[] = [];
  const points: EquityPoint[] = [];

  sample.forEach((bar, index) => {
    // Only the previous session's close can create an order for this open.
    if (pending && index > 0) {
      const openNav = cash + quantity * bar.open;
      if (pending.action === "enter" && quantity === 0) {
        // Include fees in both the cash and post-fee maximum-weight limits.
        const byCash =
          Math.floor(cash / (bar.open * (1 + feeRate)) / LOT_SIZE) * LOT_SIZE;
        const byWeight =
          Math.floor(
            (config.maxPosition * openNav) /
              (bar.open * (1 + config.maxPosition * feeRate)) /
              LOT_SIZE,
          ) * LOT_SIZE;
        const bought = Math.max(0, Math.min(byCash, byWeight));
        if (bought > 0) {
          const fee = bought * bar.open * feeRate;
          cash -= bought * bar.open + fee;
          quantity = bought;
          entryPrice = bar.open;
          entryUnitCost = bar.open * (1 + feeRate);
          cyclePnl = 0;
          totalFees += fee;
          trades.push({
            date: bar.date,
            side: "buy",
            price: bar.open,
            quantity: bought,
            fee,
            reason: pending.reason,
            pnl: null,
          });
        }
      } else if (quantity > 0 && pending.action !== "enter") {
        const target =
          pending.action === "exit"
            ? 0
            : Math.floor(
                (config.maxPosition *
                  (openNav - quantity * bar.open * feeRate)) /
                  (bar.open * (1 - config.maxPosition * feeRate)) /
                  LOT_SIZE,
              ) * LOT_SIZE;
        const sold = Math.min(quantity, Math.max(0, quantity - target));
        if (sold > 0) {
          const fee = sold * bar.open * feeRate;
          const proceeds = sold * bar.open - fee;
          const pnl = proceeds - sold * entryUnitCost;
          cash += proceeds;
          quantity -= sold;
          totalFees += fee;
          cyclePnl += pnl;
          trades.push({
            date: bar.date,
            side: "sell",
            price: bar.open,
            quantity: sold,
            fee,
            reason: pending.reason,
            pnl,
          });
          if (quantity === 0) {
            completedCyclePnls.push(cyclePnl);
            cyclePnl = 0;
            entryPrice = 0;
            entryUnitCost = 0;
          }
        }
      }
    }

    const equity = (cash + quantity * bar.close) / config.initialCapital;
    peak = Math.max(peak, equity);
    points.push({
      date: bar.date,
      equity,
      benchmark: bar.close / sample[0].close,
      drawdown: equity / peak - 1,
    });

    pending = null;
    if (quantity > 0 && bar.close <= entryPrice * (1 - config.stopLoss)) {
      pending = {
        action: "exit",
        reason: `${bar.date} 收盘：触发 ${(config.stopLoss * 100).toFixed(1)}% 止损`,
      };
    } else {
      pending = strategySignal(marketOffset + index, quantity > 0, config);
      // A growing position may cross the limit between opens. Reduce it on
      // the following open; the limit is an execution target, not a price cap.
      if (
        !pending &&
        quantity > 0 &&
        quantity * bar.close >
          config.maxPosition * equity * config.initialCapital +
            bar.close * LOT_SIZE
      ) {
        pending = {
          action: "rebalance",
          reason: `${bar.date} 收盘：仓位超过上限，次日减仓`,
        };
      }
    }
  });

  const dailyReturns = points
    .slice(1)
    .map((point, index) => point.equity / points[index].equity - 1);
  const dailyVolatility = deviation(dailyReturns);
  const totalReturn = points[points.length - 1].equity - 1;
  const lastPrice = sample[sample.length - 1].close;
  return {
    config,
    points,
    trades,
    totalReturn,
    annualReturn:
      Math.pow(1 + totalReturn, DAYS_PER_YEAR / (points.length - 1)) - 1,
    maxDrawdown: Math.max(
      0,
      -Math.min(...points.map((point) => point.drawdown)),
    ),
    sharpe:
      dailyVolatility > 0
        ? (average(dailyReturns) / dailyVolatility) * Math.sqrt(DAYS_PER_YEAR)
        : 0,
    winRate: completedCyclePnls.length
      ? completedCyclePnls.filter((pnl) => pnl > 0).length /
        completedCyclePnls.length
      : 0,
    completedTrades: completedCyclePnls.length,
    annualVolatility: dailyVolatility * Math.sqrt(DAYS_PER_YEAR),
    benchmarkReturn: points[points.length - 1].benchmark - 1,
    finalEquity: cash + quantity * lastPrice,
    positionValue: quantity * lastPrice,
    cash,
    quantity,
    lastPrice,
    totalFees,
    ...periodReturns(points),
    sampleLabel: `固定种子模拟行情 · ${sample[0].date} — 2026-09-30 · 工作日日线（未模拟节假日）`,
  };
}
