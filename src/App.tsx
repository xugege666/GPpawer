import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bookmark,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  CirclePlay,
  Clock3,
  Copy,
  Database,
  FlaskConical,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  PieChart,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
  Zap,
  Repeat2,
  ArrowLeftRight,
  Layers3,
  type LucideIcon,
} from "lucide-react";
import {
  DEFAULT_CONFIG,
  runBacktest,
  validateConfig,
  type BacktestConfig,
  type BacktestResult,
  type Period,
  type StrategyId,
} from "./lib/backtest";
import { EquityChart, Sparkline } from "./components/EquityChart";

type Page = "overview" | "strategies" | "portfolio" | "trades" | "guide";
type Modal = "parameters" | "data" | "search" | "workspace" | null;
type SavedStrategy = {
  id: string;
  name: string;
  config: BacktestConfig;
  savedAt: string;
};
const STORAGE_KEY = "alpha-lab.saved-strategies.v1";
const strategies: {
  id: StrategyId;
  name: string;
  en: string;
  description: string;
  tag: string;
  icon: LucideIcon;
  color: string;
}[] = [
  {
    id: "trend",
    name: "双均线趋势",
    en: "Moving Average",
    description: "跟随趋势，让时间成为朋友",
    tag: "趋势追踪",
    icon: TrendingUp,
    color: "purple",
  },
  {
    id: "momentum",
    name: "动量突破",
    en: "Momentum",
    description: "捕捉强势行情的延续机会",
    tag: "动量驱动",
    icon: Zap,
    color: "orange",
  },
  {
    id: "reversion",
    name: "均值回归",
    en: "Mean Reversion",
    description: "在价格偏离中寻找回归机会",
    tag: "震荡适用",
    icon: Repeat2,
    color: "blue",
  },
];
const nav: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "研究总览", icon: LayoutDashboard },
  { id: "strategies", label: "策略实验室", icon: FlaskConical },
  { id: "portfolio", label: "组合与风控", icon: PieChart },
  { id: "trades", label: "交易记录", icon: ArrowLeftRight },
];
const pct = (n: number, signed = false) =>
  `${signed && n > 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
const money = (n: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(n);
const preciseMoney = (n: number) =>
  new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
const strategyName = (id: StrategyId) =>
  strategies.find((s) => s.id === id)!.name;
const defaultFor = (
  id: StrategyId,
): Pick<BacktestConfig, "shortWindow" | "longWindow"> =>
  id === "trend"
    ? { shortWindow: 10, longWindow: 40 }
    : id === "momentum"
      ? { shortWindow: 15, longWindow: 50 }
      : { shortWindow: 10, longWindow: 30 };

function readSaved(): SavedStrategy[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]",
    );
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is SavedStrategy =>
        item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        typeof item.savedAt === "string" &&
        item.config &&
        validateConfig(item.config).length === 0,
    );
  } catch {
    return [];
  }
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
  values,
  color,
  valueClass = "",
}: {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  values: number[];
  color: string;
  valueClass?: string;
}) {
  return (
    <div className="metric-card glass">
      <div className="metric-top">
        <span>{label}</span>
        <Icon size={16} />
      </div>
      <div className="metric-middle">
        <strong className={valueClass}>{value}</strong>
        <Sparkline values={values} color={color} />
      </div>
      <div className="metric-note">
        <span className="small-dot" style={{ background: color }} />
        {note}
      </div>
    </div>
  );
}

function TradeTable({
  result,
  limit,
}: {
  result: BacktestResult;
  limit?: number;
}) {
  const allTrades = [...result.trades].reverse();
  const trades = limit ? allTrades.slice(0, limit) : allTrades;
  return (
    <div className="table-scroll">
      <table className="trade-table">
        <thead>
          <tr>
            <th>交易日期</th>
            <th>方向 / 标的</th>
            <th>成交价格</th>
            <th>数量</th>
            <th>手续费</th>
            <th>触发原因</th>
            <th>已实现盈亏</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((trade, index) => (
            <tr key={`${trade.date}-${trade.side}-${index}`}>
              <td className="tabular">{trade.date}</td>
              <td>
                <span className={`trade-side ${trade.side}`}>
                  <span>
                    {trade.side === "buy" ? (
                      <ArrowDownLeft size={13} />
                    ) : (
                      <ArrowUpRight size={13} />
                    )}
                  </span>
                  {trade.side === "buy" ? "买入" : "卖出"}
                </span>
                <span className="asset-label">模拟资产</span>
              </td>
              <td className="tabular">¥{trade.price.toFixed(2)}</td>
              <td className="tabular">{money(trade.quantity)} 股</td>
              <td className="tabular">¥{trade.fee.toFixed(2)}</td>
              <td>
                <span className="reason-text" title={trade.reason}>
                  {trade.reason}
                </span>
              </td>
              <td
                className={`tabular ${trade.pnl !== null ? (trade.pnl >= 0 ? "positive" : "negative") : "muted"}`}
              >
                {trade.pnl === null
                  ? "—"
                  : `${trade.pnl > 0 ? "+" : ""}${preciseMoney(trade.pnl)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {trades.length === 0 && (
        <div className="empty-state">
          <Clock3 size={26} />
          <p>当前参数下没有发生交易</p>
          <span>试着调整信号窗口或初始资金。</span>
        </div>
      )}
    </div>
  );
}

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [config, setConfig] = useState<BacktestConfig>({
    ...DEFAULT_CONFIG,
    ...defaultFor("trend"),
  });
  const [result, setResult] = useState(() =>
    runBacktest({ ...DEFAULT_CONFIG, ...defaultFor("trend") }),
  );
  const [chartMode, setChartMode] = useState<"equity" | "drawdown">("equity");
  const [modal, setModal] = useState<Modal>(null);
  const modalOrigin = useRef<HTMLElement | null>(null);
  const openModal = (next: Modal) => {
    if (next !== null)
      modalOrigin.current = document.activeElement as HTMLElement | null;
    setModal(next);
  };
  const [draft, setDraft] = useState(config);
  const [saved, setSaved] = useState<SavedStrategy[]>(readSaved);
  const [toast, setToast] = useState("");
  const [running, setRunning] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [notifications, setNotifications] = useState(false);
  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState<"all" | "buy" | "sell">("all");
  const [tradePage, setTradePage] = useState(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const selected = strategies.find((s) => s.id === config.strategy)!;
  const templateResults = useMemo(
    () =>
      strategies.map((s) =>
        runBacktest({ ...config, strategy: s.id, ...defaultFor(s.id) }),
      ),
    [config],
  );
  const errors = modal === "parameters" ? validateConfig(draft) : [];
  const notify = (message: string) => {
    clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        openModal("search");
      }
      if (event.key === "Escape") {
        openModal(null);
        setNotifications(false);
        setMobileNav(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    setTradePage(0);
  }, [result, tradeFilter]);
  useEffect(() => {
    if (!modal) return;
    const previous = modalOrigin.current;
    const root = document.querySelector<HTMLElement>(".modal");
    const focusables = () =>
      Array.from(
        root?.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input, select, a[href]",
        ) || [],
      );
    (modal === "search"
      ? root?.querySelector<HTMLElement>("input")
      : focusables()[0]
    )?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables(),
        first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", trap);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [modal]);

  const go = (next: Page) => {
    setPage(next);
    setMobileNav(false);
    openModal(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const run = (next = config, message = "回测完成，结果已更新") => {
    setRunning(true);
    window.setTimeout(() => {
      try {
        const nextResult = runBacktest(next);
        setConfig(next);
        setResult(nextResult);
        notify(message);
      } catch (error) {
        notify(error instanceof Error ? error.message : "回测失败，请检查参数");
      } finally {
        setRunning(false);
      }
    }, 0);
  };
  const selectStrategy = (id: StrategyId) =>
    run(
      { ...config, strategy: id, ...defaultFor(id) },
      `已切换至${strategyName(id)}`,
    );
  const changePeriod = (period: Period) => run({ ...config, period });
  const openParameters = () => {
    setDraft({ ...config });
    openModal("parameters");
  };
  const saveStrategy = () => {
    const name = `${selected.name} · ${new Date().toLocaleDateString("zh-CN")}`;
    const next = [
      {
        id: crypto.randomUUID(),
        name,
        config: { ...config },
        savedAt: new Date().toISOString(),
      },
      ...saved,
    ];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(next);
      notify("策略已保存到本地，可在策略实验室查看");
    } catch {
      notify("浏览器存储不可用，请导出报告保存");
    }
  };
  const deleteSaved = (id: string) => {
    const next = saved.filter((s) => s.id !== id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setSaved(next);
      notify("已移除这份本地策略");
    } catch {
      notify("浏览器存储不可用，移除失败");
    }
  };
  const download = (type: "json" | "csv") => {
    const content =
      type === "json"
        ? JSON.stringify(
            {
              application: "Alpha Lab",
              dataSource: "确定性模拟行情，非真实市场数据",
              exportedAt: new Date().toISOString(),
              ...result,
            },
            null,
            2,
          )
        : "\uFEFF日期,方向,标的,价格,数量,手续费,触发原因,已实现盈亏\n" +
          result.trades
            .map((t) =>
              [
                t.date,
                t.side === "buy" ? "买入" : "卖出",
                "模拟资产",
                t.price.toFixed(2),
                t.quantity,
                t.fee.toFixed(2),
                `"${t.reason.replaceAll('"', '""')}"`,
                t.pnl?.toFixed(2) ?? "",
              ].join(","),
            )
            .join("\n");
    const blob = new Blob([content], {
      type: type === "json" ? "application/json" : "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `alpha-lab-${config.strategy}-${config.period}.${type}`;
    a.click();
    URL.revokeObjectURL(url);
    notify(type === "json" ? "完整回测报告已导出" : "交易记录已导出");
  };
  const filteredTrades = result.trades.filter(
    (t) => tradeFilter === "all" || t.side === tradeFilter,
  );
  const pagedTrades = filteredTrades
    .slice()
    .reverse()
    .slice(tradePage * 15, tradePage * 15 + 15)
    .reverse();
  const positionsRatio = result.positionValue / result.finalEquity;

  const StrategyCards = () => (
    <div className="strategy-grid">
      {strategies.map((s, index) => (
        <button
          key={s.id}
          className={`strategy-card ${s.id === config.strategy ? "selected" : ""}`}
          onClick={() => selectStrategy(s.id)}
          aria-pressed={s.id === config.strategy}
        >
          <div className="strategy-card-top">
            <span className={`strategy-icon ${s.color}`}>
              <s.icon size={22} strokeWidth={1.8} />
            </span>
            <span
              className={`radio-check ${s.id === config.strategy ? "checked" : ""}`}
            >
              {s.id === config.strategy && <Check size={11} />}
            </span>
          </div>
          <div className="strategy-name">
            <h3>{s.name}</h3>
            <span>{s.en}</span>
          </div>
          <p>{s.description}</p>
          <div className="strategy-card-bottom">
            <span className={`strategy-tag ${s.color}`}>{s.tag}</span>
            <span
              className={
                templateResults[index].totalReturn >= 0
                  ? "positive"
                  : "negative"
              }
            >
              {pct(templateResults[index].totalReturn, true)}{" "}
              <small>模拟收益</small>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
  const Metrics = () => (
    <div className="metrics-grid">
      <Metric
        label="累计收益率"
        value={pct(result.totalReturn, true)}
        note={`买入持有基准 ${pct(result.benchmarkReturn, true)}`}
        icon={TrendingUp}
        values={result.points.map((p) => p.equity)}
        color="#35a287"
        valueClass={result.totalReturn >= 0 ? "positive" : "negative"}
      />
      <Metric
        label="年化收益率"
        value={pct(result.annualReturn, true)}
        note="按 252 个交易日折算"
        icon={ArrowUpRight}
        values={result.points.map((p) => p.equity)}
        color="#7183ed"
      />
      <Metric
        label="最大回撤"
        value={pct(-Math.abs(result.maxDrawdown))}
        note="观察最差时刻的资金回落"
        icon={ShieldCheck}
        values={result.points.map((p) => p.drawdown)}
        color="#e7a57d"
      />
      <Metric
        label="夏普比率"
        value={result.sharpe.toFixed(2)}
        note={`年化波动 ${pct(result.annualVolatility)}`}
        icon={Layers3}
        values={result.points.map((p) => p.equity)}
        color="#a090cf"
      />
    </div>
  );
  const ChartPanel = () => (
    <section className="glass chart-panel">
      <div className="section-heading">
        <div>
          <div className="title-row">
            <h2>回测表现</h2>
            <span className="subtle-badge">扣除交易费用</span>
          </div>
          <p>
            {selected.name} <span>·</span> 初始资金 ¥
            {money(config.initialCapital)} <span>·</span>{" "}
            {result.points[0]?.date.replaceAll("-", ".")} —{" "}
            {result.points.at(-1)?.date.replaceAll("-", ".")}
          </p>
        </div>
        <div className="period-control" aria-label="回测周期">
          {(["1y", "3y", "5y"] as Period[]).map((p, i) => (
            <button
              key={p}
              className={config.period === p ? "active" : ""}
              onClick={() => changePeriod(p)}
              aria-pressed={config.period === p}
            >
              {[1, 3, 5][i]} 年
            </button>
          ))}
        </div>
      </div>
      <div className="chart-toolbar">
        <div className="chart-tabs">
          <button
            className={chartMode === "equity" ? "active" : ""}
            onClick={() => setChartMode("equity")}
          >
            收益曲线
          </button>
          <button
            className={chartMode === "drawdown" ? "active" : ""}
            onClick={() => setChartMode("drawdown")}
          >
            回撤分析
          </button>
        </div>
        <div className="chart-legend">
          <span>
            <i
              className={
                chartMode === "equity" ? "legend-purple" : "legend-orange"
              }
            />
            {selected.name}
          </span>
          {chartMode === "equity" && (
            <span>
              <i className="legend-gray" />
              买入持有
            </span>
          )}
        </div>
      </div>
      <EquityChart points={result.points} mode={chartMode} />
      <div className="chart-footer">
        <span>
          <Database size={13} /> 确定性模拟行情 · 日线 · 次日开盘成交
        </span>
        <button onClick={() => download("json")}>
          <ArrowDownToLine size={14} />
          导出报告
        </button>
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      {mobileNav && (
        <button
          className="sidebar-scrim"
          aria-label="关闭导航"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar glass ${mobileNav ? "is-open" : ""}`}>
        <button
          className="brand"
          onClick={() => go("overview")}
          aria-label="Alpha Lab 首页"
        >
          <span className="brand-mark">
            α<span />
          </span>
          <div>
            Alpha<span>Lab</span>
            <small>让策略有据可循</small>
          </div>
        </button>
        <div className="workspace-caption">
          工作空间 <span>PERSONAL</span>
        </div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => go(item.id)}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{item.label}</span>
              {page === item.id && <span className="nav-active-dot" />}
              {item.id === "strategies" && saved.length > 0 && (
                <span className="nav-count">{saved.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <button
          className={`nav-item ${page === "guide" ? "active" : ""}`}
          onClick={() => go("guide")}
        >
          <BookOpen size={19} strokeWidth={1.7} />
          <span>研究指南</span>
          <ArrowUpRight className="guide-arrow" size={14} />
        </button>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="note-icon">
              <Sparkles size={19} />
            </span>
            <h4>好策略，始于好问题。</h4>
            <p>
              从一个想法出发，
              <br />
              探索数据中的可能性。
            </p>
            <button onClick={() => go("guide")}>
              开始你的第一次研究 <ArrowRight size={13} />
            </button>
            <div className="note-orb" />
          </div>
          <button
            className="workspace-user"
            onClick={() => openModal("workspace")}
          >
            <span className="avatar">XG</span>
            <span>
              <strong>个人工作空间</strong>
              <small>本地研究版本</small>
            </span>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileNav(true)}
              aria-label="打开导航"
            >
              <Menu size={20} />
            </button>
            <span>工作空间</span>
            <ChevronRight size={13} />
            <strong>
              {nav.find((n) => n.id === page)?.label || "研究指南"}
            </strong>
          </div>
          <div className="topbar-actions">
            <button className="data-status" onClick={() => openModal("data")}>
              <span />
              模拟数据 <ChevronDown size={12} />
            </button>
            <span className="topbar-divider" />
            <button
              className="icon-button"
              aria-label="搜索策略"
              onClick={() => {
                setSearch("");
                openModal("search");
              }}
              title="搜索 · Ctrl / ⌘ K"
            >
              <Search size={18} />
            </button>
            <div className="notification-container">
              <button
                className="icon-button notification-button"
                aria-label="通知"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={18} />
                <i />
              </button>
              {notifications && (
                <div className="notification-popover glass">
                  <div>
                    <strong>研究动态</strong>
                    <button
                      className="icon-button"
                      aria-label="关闭通知"
                      onClick={() => setNotifications(false)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <p>
                    <CheckCheck size={18} />
                    <span>
                      <strong>本地工作台已就绪</strong>
                      <small>策略回测、参数调整和报告导出均可使用。</small>
                    </span>
                  </p>
                  <p>
                    <Database size={18} />
                    <span>
                      <strong>当前使用模拟行情</strong>
                      <small>数据截止 2026.09.30，未接入实时市场。</small>
                    </span>
                  </p>
                </div>
              )}
            </div>
            <button
              className="top-avatar"
              onClick={() => openModal("workspace")}
              aria-label="工作空间信息"
            >
              XG
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span />
                {page === "overview"
                  ? "STRATEGY RESEARCH"
                  : page === "strategies"
                    ? "YOUR NEXT IDEA"
                    : page === "portfolio"
                      ? "PORTFOLIO & RISK"
                      : page === "trades"
                        ? "EVERY TRADE, EXPLAINED"
                        : "RESEARCH PLAYBOOK"}
              </div>
              <h1>
                {page === "overview" ? (
                  <>
                    把想法，变成策略<span>。</span>
                  </>
                ) : page === "strategies" ? (
                  <>
                    下一次发现，从这里开始<span>。</span>
                  </>
                ) : page === "portfolio" ? (
                  <>
                    看见收益，也看见风险<span>。</span>
                  </>
                ) : page === "trades" ? (
                  <>
                    每一次交易，都有依据<span>。</span>
                  </>
                ) : (
                  <>
                    让研究，走得更远一点<span>。</span>
                  </>
                )}
              </h1>
              <p>
                {page === "overview"
                  ? "探索、验证、迭代。构建属于你的量化研究工作流。"
                  : page === "strategies"
                    ? "选择一个模板，或继续你保存的研究。让每一个灵感留下轨迹。"
                    : page === "portfolio"
                      ? "从资金、仓位和回撤三个维度，审视当前策略的风险。"
                      : page === "trades"
                        ? "追溯信号、成交与成本，理解策略是如何执行的。"
                        : "先提出问题，再用数据寻找答案。"}
              </p>
            </div>
            <div className="page-heading-actions">
              {page !== "guide" && (
                <>
                  <button
                    className="button button-secondary"
                    onClick={saveStrategy}
                  >
                    <Bookmark size={15} />
                    保存策略
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => run()}
                    disabled={running}
                  >
                    <CirclePlay size={16} />
                    {running ? "正在回测…" : "运行回测"}
                  </button>
                </>
              )}
            </div>
          </div>

          {(page === "overview" || page === "strategies") && (
            <section className="strategy-section">
              <div className="section-heading strategy-section-heading">
                <div className="title-row">
                  <h2>策略模板</h2>
                  <span className="muted tiny">从一个经过定义的想法开始</span>
                </div>
                <button className="text-button" onClick={openParameters}>
                  <SlidersHorizontal size={14} />
                  参数设置
                  <ChevronRight size={13} />
                </button>
              </div>
              <StrategyCards />
            </section>
          )}

          {page === "overview" && (
            <>
              <div className="context-bar">
                <div>
                  <span className="context-live-dot" />
                  <strong>{selected.name}</strong>
                  <span className="context-separator" />
                  <span>模拟单资产</span>
                  <span className="context-dot">·</span>
                  <span>日线</span>
                  <span className="context-dot">·</span>
                  <span>
                    {config.shortWindow} / {config.longWindow} 日窗口
                  </span>
                </div>
                <button onClick={openParameters}>
                  编辑参数
                  <SlidersHorizontal size={13} />
                </button>
              </div>
              <Metrics />
              <div className="analysis-grid">
                <ChartPanel />
                <section className="glass insight-panel">
                  <div className="section-heading">
                    <div className="title-row">
                      <h2>策略透视</h2>
                      <Sparkles size={15} />
                    </div>
                    <button
                      className="icon-button"
                      aria-label="策略规则说明"
                      onClick={() => go("guide")}
                    >
                      <MoreHorizontal size={19} />
                    </button>
                  </div>
                  <div className="insight-score">
                    <div className="score-orb">
                      <ShieldCheck size={24} />
                    </div>
                    <div>
                      <span>研究状态</span>
                      <strong>已完成历史回测</strong>
                      <small>继续用样本外数据验证</small>
                    </div>
                  </div>
                  <div className="insight-metrics">
                    <div>
                      <span>已完成交易</span>
                      <strong>
                        {result.completedTrades} <small>笔</small>
                      </strong>
                    </div>
                    <div>
                      <span>交易胜率</span>
                      <strong>
                        {result.completedTrades > 0 ? pct(result.winRate) : "—"}
                      </strong>
                    </div>
                    <div>
                      <span>总交易费用</span>
                      <strong>¥{preciseMoney(result.totalFees)}</strong>
                    </div>
                    <div>
                      <span>最大仓位上限</span>
                      <strong>{pct(config.maxPosition)}</strong>
                    </div>
                  </div>
                  <div className="insight-tip">
                    <span>
                      <CircleHelp size={14} />
                      研究提示
                    </span>
                    <p>
                      {Math.abs(result.maxDrawdown) > 0.15
                        ? "这组参数经历了较大回撤。尝试降低仓位，并比较不同时间区间的表现。"
                        : "历史收益只是研究的起点。比较不同周期、交易成本和参数，观察结果是否稳定。"}
                    </p>
                  </div>
                  <button
                    className="insight-link"
                    onClick={() => go("portfolio")}
                  >
                    查看组合与风控 <ArrowRight size={14} />
                  </button>
                </section>
              </div>
              <section className="glass transactions-panel">
                <div className="section-heading">
                  <div className="title-row">
                    <h2>最近交易</h2>
                    <span className="count-badge">{result.trades.length}</span>
                  </div>
                  <button className="text-button" onClick={() => go("trades")}>
                    查看全部
                    <ArrowRight size={14} />
                  </button>
                </div>
                <TradeTable result={result} limit={4} />
              </section>
            </>
          )}

          {page === "strategies" && (
            <>
              <section className="glass saved-panel">
                <div className="section-heading">
                  <div>
                    <h2>我的策略</h2>
                    <p>保存在当前浏览器，随时恢复参数并重新验证。</p>
                  </div>
                  <span className="count-badge">{saved.length} 个</span>
                </div>
                {saved.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-icon">
                      <Bookmark size={26} />
                    </span>
                    <h3>留住你的第一个策略</h3>
                    <p>调整参数并运行回测，再点击「保存策略」。</p>
                    <button
                      className="button button-secondary"
                      onClick={openParameters}
                    >
                      <Plus size={15} />
                      配置一份策略
                    </button>
                  </div>
                ) : (
                  <div className="saved-list">
                    {saved.map((s) => (
                      <div className="saved-item" key={s.id}>
                        <span className="saved-icon">
                          <FlaskConical size={19} />
                        </span>
                        <div>
                          <h3>{s.name}</h3>
                          <p>
                            {strategyName(s.config.strategy)} ·{" "}
                            {s.config.shortWindow}/{s.config.longWindow} 日 · ¥
                            {money(s.config.initialCapital)} ·{" "}
                            {s.config.period.replace("y", " 年")}
                          </p>
                        </div>
                        <button
                          className="button button-secondary"
                          onClick={() => {
                            run(s.config, "已恢复保存的策略");
                            go("overview");
                          }}
                        >
                          继续研究
                          <ArrowRight size={14} />
                        </button>
                        <button
                          className="icon-button"
                          onClick={() => deleteSaved(s.id)}
                          aria-label={`删除 ${s.name}`}
                        >
                          <X size={17} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className="glass methodology-card">
                <div className="methodology-icon">
                  <Layers3 size={27} />
                </div>
                <div>
                  <h2>给每次实验一个清晰的假设</h2>
                  <p>
                    三个模板共享同一组模拟行情。比较信号窗口、仓位和交易成本，才能理解差异来自哪里。
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => go("guide")}
                >
                  了解研究方法
                  <ArrowUpRight size={15} />
                </button>
              </section>
            </>
          )}

          {page === "portfolio" && (
            <>
              <Metrics />
              <div className="portfolio-grid">
                <section className="glass allocation-panel">
                  <div className="section-heading">
                    <h2>当前资金分布</h2>
                    <span className="subtle-badge">回测期末</span>
                  </div>
                  <div className="allocation-body">
                    <div
                      className="allocation-ring"
                      style={{
                        background: `conic-gradient(#7382ed 0deg ${positionsRatio * 360}deg, #e9edf7 ${positionsRatio * 360}deg 360deg)`,
                      }}
                    >
                      <div>
                        <span>总资产</span>
                        <strong>¥{money(result.finalEquity)}</strong>
                      </div>
                    </div>
                    <div className="allocation-details">
                      <div>
                        <span>
                          <i className="legend-purple" />
                          模拟资产持仓
                        </span>
                        <strong>¥{preciseMoney(result.positionValue)}</strong>
                        <small>
                          {pct(positionsRatio)} · {money(result.quantity)} 股
                        </small>
                      </div>
                      <div>
                        <span>
                          <i className="legend-gray" />
                          可用现金
                        </span>
                        <strong>¥{preciseMoney(result.cash)}</strong>
                        <small>{pct(result.cash / result.finalEquity)}</small>
                      </div>
                    </div>
                  </div>
                  <div className="panel-note">
                    当前为单策略、单资产研究。持仓来自实际回测成交，未模拟多资产组合。
                  </div>
                </section>
                <section className="glass risk-panel">
                  <div className="section-heading">
                    <h2>风控规则</h2>
                    <button className="text-button" onClick={openParameters}>
                      调整
                      <SlidersHorizontal size={14} />
                    </button>
                  </div>
                  <div className="risk-rule">
                    <span className="risk-rule-icon">
                      <PieChart size={19} />
                    </span>
                    <div>
                      <strong>最大持仓比例</strong>
                      <p>开仓限制，超额后次日减仓</p>
                    </div>
                    <b>{pct(config.maxPosition)}</b>
                  </div>
                  <div className="risk-rule">
                    <span className="risk-rule-icon orange">
                      <ShieldCheck size={19} />
                    </span>
                    <div>
                      <strong>持仓止损阈值</strong>
                      <p>收盘触发后，次日开盘卖出</p>
                    </div>
                    <b>{pct(config.stopLoss)}</b>
                  </div>
                  <div className="risk-rule">
                    <span className="risk-rule-icon blue">
                      <ArrowLeftRight size={19} />
                    </span>
                    <div>
                      <strong>单边交易费用</strong>
                      <p>每笔买卖均计入成本</p>
                    </div>
                    <b>{config.feeBps} bp</b>
                  </div>
                  <div className="risk-explanation">
                    <CircleHelp size={16} />
                    <p>
                      跳空可能使实际亏损超过止损阈值；价格上涨可能使持仓暂时超过目标仓位。当前模型未包含涨跌停、停牌及滑点。
                    </p>
                  </div>
                </section>
              </div>
              <ChartPanel />
              <section className="glass annual-panel">
                <div className="section-heading">
                  <h2>分年度表现</h2>
                  <span className="muted tiny">首尾年份可能不足完整一年</span>
                </div>
                <div className="annual-grid">
                  {result.annualReturns.map((year) => (
                    <div className="annual-card" key={year.year}>
                      <span>{year.year}</span>
                      <strong
                        className={year.strategy >= 0 ? "positive" : "negative"}
                      >
                        {pct(year.strategy, true)}
                      </strong>
                      <small>买入持有 {pct(year.benchmark, true)}</small>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {page === "trades" && (
            <>
              <div className="trade-summary-grid">
                <div className="glass trade-summary">
                  <ArrowLeftRight size={20} />
                  <span>总成交笔数</span>
                  <strong>{result.trades.length}</strong>
                </div>
                <div className="glass trade-summary">
                  <CheckCheck size={20} />
                  <span>已平仓胜率</span>
                  <strong>
                    {result.completedTrades > 0 ? pct(result.winRate) : "—"}
                  </strong>
                </div>
                <div className="glass trade-summary">
                  <ArrowDownToLine size={20} />
                  <span>累计手续费</span>
                  <strong>¥{preciseMoney(result.totalFees)}</strong>
                </div>
              </div>
              <section className="glass transactions-panel full-transactions">
                <div className="section-heading">
                  <div className="chart-tabs">
                    {(["all", "buy", "sell"] as const).map((f, i) => (
                      <button
                        key={f}
                        className={tradeFilter === f ? "active" : ""}
                        onClick={() => setTradeFilter(f)}
                      >
                        {["全部成交", "买入", "卖出"][i]}
                      </button>
                    ))}
                  </div>
                  <button
                    className="button button-secondary"
                    onClick={() => download("csv")}
                  >
                    <ArrowDownToLine size={15} />
                    导出 CSV
                  </button>
                </div>
                <TradeTable result={{ ...result, trades: pagedTrades }} />
                <div className="pagination">
                  <span>
                    共 {filteredTrades.length} 笔 · 第 {tradePage + 1} /{" "}
                    {Math.max(1, Math.ceil(filteredTrades.length / 15))} 页
                  </span>
                  <div>
                    <button
                      disabled={tradePage === 0}
                      onClick={() => setTradePage(tradePage - 1)}
                    >
                      上一页
                    </button>
                    <button
                      disabled={(tradePage + 1) * 15 >= filteredTrades.length}
                      onClick={() => setTradePage(tradePage + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </section>
              <div className="execution-note">
                <ShieldCheck size={17} />
                <p>
                  所有信号使用当日及之前的数据计算，于下一交易日开盘成交。买入按
                  100 股整手执行，买入后至少到下一交易日才能卖出。
                </p>
              </div>
            </>
          )}

          {page === "guide" && (
            <>
              <div className="guide-grid">
                {[
                  {
                    n: "01",
                    title: "定义一个可检验的想法",
                    text: "例如：当短期均线上穿长期均线时，后续趋势更可能延续。先明确入场、退出和仓位规则，再观察结果。",
                    icon: FlaskConical,
                  },
                  {
                    n: "02",
                    title: "让成本与执行进入模型",
                    text: "回测使用前一日信号、下一交易日开盘成交，并扣除单边费用。止损同样在次日执行，不能假设总能按理想价格成交。",
                    icon: ArrowLeftRight,
                  },
                  {
                    n: "03",
                    title: "收益与风险一起看",
                    text: "累计收益反映结果，最大回撤反映过程。夏普比率使用日收益、252 个交易日年化，无风险利率假设为零。胜率只统计已平仓交易。",
                    icon: ShieldCheck,
                  },
                  {
                    n: "04",
                    title: "验证稳定性，再迈向市场",
                    text: "切换 1/3/5 年区间、调整窗口和费用，看结论是否稳定。当前版本没有自动样本外验证，真实研究还需独立验证集与滚动回测。",
                    icon: Layers3,
                  },
                ].map((item) => (
                  <section className="glass guide-card" key={item.n}>
                    <div>
                      <span>{item.n}</span>
                      <item.icon size={23} />
                    </div>
                    <h2>{item.title}</h2>
                    <p>{item.text}</p>
                  </section>
                ))}
              </div>
              <section className="glass model-guide">
                <div className="section-heading">
                  <h2>三个模板，三种假设</h2>
                  <span className="subtle-badge">可调整信号窗口</span>
                </div>
                <div className="model-guide-grid">
                  {strategies.map((s) => (
                    <div key={s.id}>
                      <span className={`strategy-icon ${s.color}`}>
                        <s.icon size={21} />
                      </span>
                      <h3>{s.name}</h3>
                      <p>
                        {s.id === "trend"
                          ? "短期均线高于长期均线 0.3% 时买入，低于长期均线 0.3% 时退出。缓冲区减少频繁切换，震荡期仍可能反复交易。"
                          : s.id === "momentum"
                            ? "长期窗口涨幅超过 3.5%、短期涨幅超过 0.8% 时买入；长期涨幅转负或短期跌幅超过 2.5% 时退出。适合研究价格动量的延续。"
                            : "价格低于长期均线 1.25 倍标准差，且不低于短期均线的 97% 时买入；回升至长期均线上方 0.15 倍标准差时退出。"}
                      </p>
                      <button
                        className="text-button"
                        onClick={() => {
                          selectStrategy(s.id);
                          go("overview");
                        }}
                      >
                        研究这个策略
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
              <section className="glass data-guide">
                <Database size={24} />
                <div>
                  <h2>关于当前数据</h2>
                  <p>
                    固定随机种子的合成行情，截至 2026 年 9 月 30
                    日。不对应任何真实股票，也不代表真实市场绩效。当前版本适合体验研究流程；真实使用前需接入合规行情并补齐复权、停牌、涨跌停、滑点和历史股票池处理。
                  </p>
                </div>
                <button
                  className="button button-secondary"
                  onClick={() => openModal("data")}
                >
                  数据详情
                </button>
              </section>
            </>
          )}

          <footer className="page-footer">
            <span>
              <span className="footer-logo">α</span>Alpha Lab{" "}
              <span className="footer-dot">·</span> 少一点猜测，多一点验证。
            </span>
            <button onClick={() => openModal("data")}>
              <span className="small-dot" />
              模拟研究环境 · 数据截至 2026.09.30
            </button>
          </footer>
        </div>
      </main>

      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={14} />
          </span>
          {toast}
        </div>
      )}
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) openModal(null);
          }}
        >
          <section
            className={`modal glass ${modal === "search" ? "search-modal" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">
                  {modal === "parameters"
                    ? "MAKE IT YOURS"
                    : modal === "search"
                      ? "QUICK NAVIGATION"
                      : "ALPHA LAB"}
                </span>
                <h2 id="modal-title">
                  {modal === "parameters"
                    ? "调整你的策略"
                    : modal === "data"
                      ? "认识这组数据"
                      : modal === "search"
                        ? "找到下一步"
                        : "你的个人工作空间"}
                </h2>
              </div>
              <button
                className="icon-button"
                onClick={() => openModal(null)}
                aria-label="关闭弹窗"
              >
                <X size={20} />
              </button>
            </div>
            {modal === "parameters" && (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (errors.length) return;
                  openModal(null);
                  run(draft);
                }}
              >
                <p className="modal-description">
                  {strategyName(draft.strategy)} · 所有参数会应用到下一次回测。
                </p>
                <div className="form-grid">
                  <label>
                    初始资金 <span>人民币</span>
                    <div className="input-wrap">
                      <span>¥</span>
                      <input
                        name="initialCapital"
                        type="number"
                        min="0.01"
                        max="1000000000000"
                        step="any"
                        value={draft.initialCapital}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            initialCapital: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </label>
                  <label>
                    单边手续费 <span>基点 bp</span>
                    <div className="input-wrap">
                      <input
                        name="feeBps"
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={draft.feeBps}
                        onChange={(e) =>
                          setDraft({ ...draft, feeBps: Number(e.target.value) })
                        }
                      />
                      <span>bp</span>
                    </div>
                  </label>
                  <label>
                    短期窗口 <span>交易日</span>
                    <div className="input-wrap">
                      <input
                        name="shortWindow"
                        type="number"
                        min="2"
                        max="120"
                        value={draft.shortWindow}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            shortWindow: Number(e.target.value),
                          })
                        }
                      />
                      <span>日</span>
                    </div>
                  </label>
                  <label>
                    长期窗口 <span>交易日</span>
                    <div className="input-wrap">
                      <input
                        name="longWindow"
                        type="number"
                        min="3"
                        max="240"
                        value={draft.longWindow}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            longWindow: Number(e.target.value),
                          })
                        }
                      />
                      <span>日</span>
                    </div>
                  </label>
                  <label className="range-label">
                    最大仓位{" "}
                    <strong>{Math.round(draft.maxPosition * 100)}%</strong>
                    <input
                      name="maxPosition"
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={Math.round(draft.maxPosition * 100)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          maxPosition: Number(e.target.value) / 100,
                        })
                      }
                    />
                    <small>开仓仓位上限；超额后次日减仓</small>
                  </label>
                  <label className="range-label">
                    止损阈值{" "}
                    <strong>{Math.round(draft.stopLoss * 100)}%</strong>
                    <input
                      name="stopLoss"
                      type="range"
                      min="2"
                      max="30"
                      step="1"
                      value={Math.round(draft.stopLoss * 100)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          stopLoss: Number(e.target.value) / 100,
                        })
                      }
                    />
                    <small>收盘触发后，在下一交易日开盘退出</small>
                  </label>
                </div>
                {errors.length > 0 && (
                  <div className="form-errors" role="alert">
                    {errors.map((error) => (
                      <p key={error}>{error}</p>
                    ))}
                  </div>
                )}
                <div className="form-note">
                  <CircleHelp size={15} />
                  <span>1 bp = 0.01%。例如 5 bp 表示每笔成交额的 0.05%。</span>
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() =>
                      setDraft({
                        ...DEFAULT_CONFIG,
                        strategy: config.strategy,
                        period: config.period,
                        ...defaultFor(config.strategy),
                      })
                    }
                  >
                    恢复默认
                  </button>
                  <button
                    className="button button-primary"
                    type="submit"
                    disabled={errors.length > 0}
                  >
                    <CirclePlay size={16} />
                    应用并回测
                  </button>
                </div>
              </form>
            )}
            {modal === "data" && (
              <>
                <div className="data-modal-icon">
                  <Database size={30} />
                  <span>DEMO DATA</span>
                </div>
                <p className="modal-description">
                  这是一组固定种子的合成日线行情，用来体验策略研究工作流，不对应任何真实证券。
                </p>
                <dl className="data-facts">
                  <div>
                    <dt>数据范围</dt>
                    <dd>最近 1 / 3 / 5 年</dd>
                  </div>
                  <div>
                    <dt>截止日期</dt>
                    <dd>2026 年 9 月 30 日</dd>
                  </div>
                  <div>
                    <dt>交易模型</dt>
                    <dd>次日开盘 · 100 股整手 · 工作日</dd>
                  </div>
                  <div>
                    <dt>基准模型</dt>
                    <dd>首日买入并持有，不计费用</dd>
                  </div>
                  <div>
                    <dt>已包含</dt>
                    <dd>手续费、仓位限制、收盘止损</dd>
                  </div>
                  <div>
                    <dt>尚未包含</dt>
                    <dd>节假日、滑点、停牌、涨跌停、复权</dd>
                  </div>
                </dl>
                <div className="modal-footer">
                  <span className="muted tiny">相同参数始终得到相同结果</span>
                  <button
                    className="button button-primary"
                    onClick={() => openModal(null)}
                  >
                    开始研究
                    <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
            {modal === "search" && (
              <>
                <div className="search-input">
                  <Search size={19} />
                  <input
                    autoFocus
                    aria-label="搜索页面或策略"
                    placeholder="搜索页面、策略模板…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <kbd>ESC</kbd>
                </div>
                <div className="search-results">
                  {[
                    ...nav,
                    { id: "guide" as Page, label: "研究指南", icon: BookOpen },
                  ]
                    .filter((n) => n.label.includes(search))
                    .map((n) => (
                      <button key={n.id} onClick={() => go(n.id)}>
                        <n.icon size={18} />
                        <span>{n.label}</span>
                        <ArrowRight size={15} />
                      </button>
                    ))}
                  {strategies
                    .filter((s) =>
                      `${s.name}${s.en}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          selectStrategy(s.id);
                          go("overview");
                        }}
                      >
                        <s.icon size={18} />
                        <span>
                          {s.name}
                          <small>策略模板</small>
                        </span>
                        <ArrowRight size={15} />
                      </button>
                    ))}
                  {![
                    ...nav.map((n) => n.label),
                    "研究指南",
                    ...strategies.map((s) => `${s.name}${s.en}`),
                  ].some((s) =>
                    s.toLowerCase().includes(search.toLowerCase()),
                  ) && (
                    <div className="empty-state">
                      <Search size={24} />
                      <p>没有找到匹配内容</p>
                      <span>试试「策略」「风控」或「动量」。</span>
                    </div>
                  )}
                </div>
              </>
            )}
            {modal === "workspace" && (
              <>
                <div className="workspace-modal-profile">
                  <span className="avatar">XG</span>
                  <div>
                    <h3>个人工作空间</h3>
                    <p>你的灵感、实验和策略，都从这里开始。</p>
                  </div>
                </div>
                <dl className="data-facts">
                  <div>
                    <dt>运行方式</dt>
                    <dd>本地浏览器 · 无需账户</dd>
                  </div>
                  <div>
                    <dt>已保存策略</dt>
                    <dd>{saved.length} 个</dd>
                  </div>
                  <div>
                    <dt>数据保存</dt>
                    <dd>当前浏览器 localStorage</dd>
                  </div>
                </dl>
                <p className="modal-description">
                  清理浏览器数据会移除保存的策略。你可以导出完整报告，保留参数、净值和交易记录。
                </p>
                <div className="modal-footer">
                  <button
                    className="button button-secondary"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          window.location.href,
                        );
                        notify("当前工作台地址已复制");
                      } catch {
                        notify("浏览器不支持复制，请从地址栏复制");
                      }
                    }}
                  >
                    <Copy size={15} />
                    复制本地地址
                  </button>
                  <button
                    className="button button-primary"
                    onClick={() => download("json")}
                  >
                    <ArrowDownToLine size={15} />
                    导出当前报告
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
