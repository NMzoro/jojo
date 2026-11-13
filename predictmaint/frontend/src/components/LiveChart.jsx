import React from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fmtTime, pct, ratio } from "../lib/format";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-sm border border-line bg-white px-3 py-2.5 shadow-toast">
      <div className="num text-sm text-muted">{fmtTime(point.timestamp)}</div>
      <div className="mt-1.5 flex items-center gap-2 text-base">
        <span className="h-2.5 w-2.5 rounded-full bg-brand" />
        <span className="text-body">Max</span>
        <span className="num ml-auto font-semibold text-ink">{pct(point.max, 1)}</span>
      </div>
      <div className="flex items-center gap-2 text-base">
        <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />
        <span className="text-body">Moyenne</span>
        <span className="num ml-auto font-semibold text-ink">{pct(point.avg, 1)}</span>
      </div>
    </div>
  );
}

export function LiveChart({ series = [], warning, alarm, interval }) {
  if (!series.length) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-line bg-head/30">
        <span className="led h-3.5 w-3.5 animate-pulse bg-brand" />
        <p className="text-base font-semibold text-muted">En attente du flux temps réel…</p>
        <p className="text-sm text-muted">
          {interval
            ? `Les mesures arrivent toutes les ${interval} secondes.`
            : "Les mesures apparaîtront dès réception."}
        </p>
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 14, right: 56, left: 0, bottom: 6 }}>
          <defs>
            <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E41937" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#E41937" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#F3F4F6" vertical={false} />
          <XAxis
            dataKey="timestamp"
            tickFormatter={(value) => fmtTime(value).slice(0, 8)}
            tick={{ fontSize: 14, fill: "#4B5563", fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
            tickLine={false}
            axisLine={{ stroke: "#E5E7EB" }}
            minTickGap={48}
          />
          <YAxis
            domain={[0, 1]}
            ticks={[0, 0.25, 0.5, 0.75, 1]}
            tickFormatter={(value) => `${Math.round(value * 100)}%`}
            tick={{ fontSize: 14, fill: "#4B5563", fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}
            tickLine={false}
            axisLine={false}
            width={54}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#9CA3AF", strokeDasharray: "3 3" }} />
          {alarm != null && (
            <ReferenceLine
              y={alarm}
              stroke="#E41937"
              strokeDasharray="6 4"
              label={{
                value: `Seuil ${ratio(alarm, 2).replace(".", ",")}`,
                position: "insideTopRight",
                fill: "#E41937",
                fontSize: 14,
              }}
            />
          )}
          {warning != null && (
            <ReferenceLine
              y={warning}
              stroke="#F59E0B"
              strokeDasharray="4 4"
              label={{
                value: ratio(warning, 2).replace(".", ","),
                position: "insideRight",
                fill: "#B45309",
                fontSize: 14,
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="max"
            name="Probabilité max"
            stroke="#E41937"
            strokeWidth={2.5}
            fill="url(#riskFill)"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="avg"
            name="Moyenne"
            stroke="#9CA3AF"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
