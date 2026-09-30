import { useEffect, useId, useRef, useState } from "react";
import type { EquityPoint } from "../lib/backtest";

export function EquityChart({
  points,
  mode = "equity",
}: {
  points: EquityPoint[];
  mode?: "equity" | "drawdown";
}) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(920);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0)
        setWidth(Math.floor(entry.contentRect.width));
    });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  const height = width < 500 ? 215 : 272,
    left = 8,
    right = 54,
    top = 12,
    bottom = 32;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const values = points.flatMap((p) =>
    mode === "equity" ? [p.equity - 1, p.benchmark - 1] : [p.drawdown],
  );
  const min = Math.min(0, ...values),
    max = Math.max(0.015, ...values);
  const padding = Math.max((max - min) * 0.12, 0.02);
  const lo = mode === "drawdown" ? min - padding * 0.2 : min - padding;
  const hi = mode === "drawdown" ? 0.003 : max + padding;
  const x = (i: number) =>
    left + (i / Math.max(1, points.length - 1)) * plotWidth;
  const y = (v: number) => top + ((hi - v) / (hi - lo)) * plotHeight;
  const value = (p: EquityPoint) =>
    mode === "equity" ? p.equity - 1 : p.drawdown;
  const line = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(value(p)).toFixed(2)}`,
    )
    .join(" ");
  const base = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.benchmark - 1).toFixed(2)}`,
    )
    .join(" ");
  const area = `${line} L${x(points.length - 1)},${y(mode === "drawdown" ? 0 : lo)} L${left},${y(mode === "drawdown" ? 0 : lo)} Z`;
  const percent = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
  const active = hover === null ? null : points[hover];
  return (
    <div
      ref={container}
      className="equity-chart"
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          mode === "equity"
            ? "策略与买入持有基准的累计收益曲线"
            : "策略历史回撤曲线"
        }
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const vx = ((event.clientX - rect.left) / rect.width) * width;
          setHover(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(((vx - left) / plotWidth) * (points.length - 1)),
              ),
            ),
          );
        }}
      >
        <defs>
          <linearGradient id={`area-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor={mode === "equity" ? "#6576ed" : "#ed906c"}
              stopOpacity=".21"
            />
            <stop
              offset="100%"
              stopColor={mode === "equity" ? "#6576ed" : "#ed906c"}
              stopOpacity=".015"
            />
          </linearGradient>
        </defs>
        {Array.from({ length: 5 }, (_, i) => {
          const v = lo + ((hi - lo) * i) / 4;
          return (
            <g key={i}>
              <line
                x1={left}
                y1={y(v)}
                x2={width - right + 4}
                y2={y(v)}
                stroke="#e8eaf2"
                strokeDasharray="3 5"
              />
              <text
                x={width - right + 13}
                y={y(v) + 4}
                fill="#9b9eaf"
                fontSize="11"
                fontFamily="inherit"
              >
                {(v * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}
        <path d={area} fill={`url(#area-${id})`} />
        {mode === "equity" && (
          <path
            d={base}
            fill="none"
            stroke="#bec4d3"
            strokeWidth="1.8"
            strokeDasharray="5 5"
            strokeLinejoin="round"
          />
        )}
        <path
          d={line}
          fill="none"
          stroke={mode === "equity" ? "#6675ed" : "#e3926e"}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {Array.from({ length: 5 }, (_, i) => {
          const index = Math.round((i / 4) * (points.length - 1));
          return (
            <text
              key={i}
              x={x(index)}
              y={height - 6}
              textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"}
              fill="#9b9eaf"
              fontSize="11"
              fontFamily="inherit"
            >
              {points[index]?.date.slice(0, 7).replace("-", ".")}
            </text>
          );
        })}
        {active && hover !== null && (
          <g>
            <line
              x1={x(hover)}
              y1={top}
              x2={x(hover)}
              y2={height - bottom}
              stroke="#a9afcf"
              strokeDasharray="4 4"
            />
            <circle
              cx={x(hover)}
              cy={y(value(active))}
              r="5"
              fill="#6576ed"
              stroke="white"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
      {active && hover !== null && (
        <div
          className="chart-tooltip"
          style={{
            left: `${Math.max(8, Math.min(73, (x(hover) / width) * 100))}%`,
          }}
        >
          <span>{active.date}</span>
          <strong>
            {mode === "equity" ? "策略收益" : "当前回撤"}{" "}
            <b>{percent(value(active))}</b>
          </strong>
          {mode === "equity" && (
            <strong>
              买入持有 <b>{percent(active.benchmark - 1)}</b>
            </strong>
          )}
        </div>
      )}
    </div>
  );
}

export function Sparkline({
  values,
  color = "#6477ea",
}: {
  values: number[];
  color?: string;
}) {
  const min = Math.min(...values),
    range = Math.max(...values) - min || 1;
  const step = Math.max(1, Math.floor(values.length / 36));
  const sampled = values.filter((_, i) => i % step === 0);
  const path = sampled
    .map(
      (n, i) =>
        `${i === 0 ? "M" : "L"}${(i / Math.max(1, sampled.length - 1)) * 80},${26 - ((n - min) / range) * 23}`,
    )
    .join(" ");
  return (
    <svg viewBox="0 0 80 30" className="sparkline" aria-hidden="true">
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
