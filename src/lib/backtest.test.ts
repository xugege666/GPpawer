import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, runBacktest, validateConfig } from "./backtest";

describe("deterministic synthetic backtests", () => {
  it("reproduces every point and trade for the same input without mutating config", () => {
    const config = { ...DEFAULT_CONFIG };
    const first = runBacktest(config);
    expect(runBacktest(config)).toEqual(first);
    expect(config).toEqual(DEFAULT_CONFIG);
    expect(first.points[0].equity).toBe(1);
    expect(first.points[0].benchmark).toBe(1);
    expect(first.points.at(-1)?.date).toBe("2026-09-30");
  });

  it("conserves cash, holdings, realized profit and fees across all trades", () => {
    const config = { ...DEFAULT_CONFIG, feeBps: 15 };
    const result = runBacktest(config);
    let cash = config.initialCapital;
    let quantity = 0;
    for (const trade of result.trades) {
      expect(trade.quantity % 100).toBe(0);
      expect(trade.fee).toBeCloseTo(
        (trade.price * trade.quantity * config.feeBps) / 10_000,
        8,
      );
      if (trade.side === "buy") {
        const before = cash + quantity * trade.price;
        cash -= trade.quantity * trade.price + trade.fee;
        quantity += trade.quantity;
        expect(
          (quantity * trade.price) / (before - trade.fee),
        ).toBeLessThanOrEqual(config.maxPosition + 1e-10);
        expect(trade.pnl).toBeNull();
      } else {
        cash += trade.quantity * trade.price - trade.fee;
        quantity -= trade.quantity;
        expect(trade.pnl).not.toBeNull();
      }
      expect(cash).toBeGreaterThanOrEqual(-1e-7);
      expect(quantity).toBeGreaterThanOrEqual(0);
    }
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.cash).toBeCloseTo(cash, 7);
    expect(result.quantity).toBe(quantity);
    expect(result.finalEquity).toBeCloseTo(
      cash + quantity * result.lastPrice,
      7,
    );
    expect(result.totalFees).toBeCloseTo(
      result.trades.reduce((sum, trade) => sum + trade.fee, 0),
      7,
    );
    expect(result.points.at(-1)?.equity).toBeCloseTo(
      result.finalEquity / config.initialCapital,
      10,
    );
  });

  it("executes close-based signals on the next sampled trading day", () => {
    const result = runBacktest(DEFAULT_CONFIG);
    for (const trade of result.trades) {
      const signalDate = trade.reason.slice(0, 10);
      const tradeIndex = result.points.findIndex(
        (point) => point.date === trade.date,
      );
      expect(tradeIndex).toBeGreaterThan(0);
      expect(result.points[tradeIndex - 1].date).toBe(signalDate);
      expect(signalDate < trade.date).toBe(true);
    }
  });

  it("counts completed holding cycles, aggregates partial-sale profit, and excludes open cycles from win rate", () => {
    const result = runBacktest(DEFAULT_CONFIG);
    let quantity = 0;
    let cycleCost = 0;
    let cycleProceeds = 0;
    let partialSells = 0;
    const completedProfits: number[] = [];
    for (const trade of result.trades) {
      if (trade.side === "buy") {
        quantity += trade.quantity;
        cycleCost += trade.quantity * trade.price + trade.fee;
      } else {
        quantity -= trade.quantity;
        cycleProceeds += trade.quantity * trade.price - trade.fee;
        if (quantity === 0) {
          completedProfits.push(cycleProceeds - cycleCost);
          cycleCost = 0;
          cycleProceeds = 0;
        } else {
          partialSells++;
        }
      }
    }
    // This sample deliberately contains both partial reductions and an open
    // final position, so the assertion cannot pass by counting sell orders.
    expect(partialSells).toBeGreaterThan(0);
    expect(quantity).toBeGreaterThan(0);
    expect(result.completedTrades).toBe(completedProfits.length);
    expect(result.completedTrades).toBeLessThan(
      result.trades.filter((trade) => trade.side === "sell").length,
    );
    expect(result.completedTrades).toBe(
      result.trades.filter((trade) => trade.side === "buy").length - 1,
    );
    expect(result.winRate).toBe(
      completedProfits.filter((pnl) => pnl > 0).length /
        completedProfits.length,
    );
  });

  it("keeps insufficient capital and zero allocation in cash", () => {
    for (const override of [{ initialCapital: 1 }, { maxPosition: 0 }]) {
      const config = { ...DEFAULT_CONFIG, ...override };
      const result = runBacktest(config);
      expect(result.trades).toEqual([]);
      expect(result.finalEquity).toBe(config.initialCapital);
      expect(result.totalReturn).toBe(0);
      expect(result.maxDrawdown).toBe(0);
      expect(result.sharpe).toBe(0);
    }
  });

  it("uses different rules for each strategy and honors the requested sample length", () => {
    const trend = runBacktest(DEFAULT_CONFIG);
    const momentum = runBacktest({ ...DEFAULT_CONFIG, strategy: "momentum" });
    const reversion = runBacktest({ ...DEFAULT_CONFIG, strategy: "reversion" });
    expect(momentum.trades).not.toEqual(trend.trades);
    expect(reversion.trades).not.toEqual(trend.trades);
    expect(
      runBacktest({ ...DEFAULT_CONFIG, period: "1y" }).points,
    ).toHaveLength(252);
    expect(trend.points).toHaveLength(756);
    expect(
      runBacktest({ ...DEFAULT_CONFIG, period: "5y" }).points,
    ).toHaveLength(1260);
  });

  it("rejects malformed configuration instead of producing invalid metrics", () => {
    const config = {
      ...DEFAULT_CONFIG,
      shortWindow: 50,
      longWindow: 20,
      feeBps: -1,
      maxPosition: 2,
    };
    expect(validateConfig(config)).toHaveLength(3);
    expect(() => runBacktest(config)).toThrow("短周期必须小于长周期");
    expect(
      validateConfig({ ...DEFAULT_CONFIG, initialCapital: Number.NaN }),
    ).toHaveLength(1);
  });

  it("reports drawdown and compounded monthly returns consistently", () => {
    const result = runBacktest(DEFAULT_CONFIG);
    const compounded = result.monthlyReturns.reduce(
      (value, month) => value * (1 + month.value),
      1,
    );
    expect(compounded).toBeCloseTo(1 + result.totalReturn, 10);
    expect(result.maxDrawdown).toBeCloseTo(
      -Math.min(...result.points.map((point) => point.drawdown)),
      10,
    );
    expect(result.points.every((point) => point.drawdown <= 0)).toBe(true);
  });
});
