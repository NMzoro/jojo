import React from "react";
import { cls } from "../lib/format";

export function KpiCard({ label, value, unit, sub, icon: Icon, tone = "brand", className = "" }) {
  const tones = {
    brand: "bg-brand",
    normal: "bg-normal",
    watch: "bg-watch",
    ink: "bg-ink",
    muted: "bg-gray-300",
  };
  return (
    <div className={cls("panel relative overflow-hidden p-5 pl-6", className)}>
      <span className={cls("kpi-accent", tones[tone] || tones.brand)} />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-bold uppercase tracking-wide text-muted">{label}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="stat-value">{value}</span>
            {unit && <span className="num text-sm font-semibold text-muted">{unit}</span>}
          </div>
          {sub && <p className="mt-2 text-sm text-muted">{sub}</p>}
        </div>
        {Icon && (
          <span className="rounded-sm bg-head p-3 text-brand">
            <Icon size={24} />
          </span>
        )}
      </div>
    </div>
  );
}
