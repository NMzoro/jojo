import React from "react";
import { cls, pct, fmtTime, statusMeta } from "../lib/format";
import { Led } from "./Led";

export function MachineCard({ machine, selected = false, onSelect }) {
  const meta = statusMeta(machine.status);
  const alarm = machine.status === "PANNE_PREVUE";
  const probability = Number(machine.probability || 0);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cls(
        "panel group relative overflow-hidden border-l-[4px] p-0 text-left transition-all duration-300",
        "hover:shadow-panel focus:outline-none focus:ring-2 focus:ring-brand/25",
        selected && "ring-2 ring-brand/30",
        alarm && "animate-alarm-pulse"
      )}
      style={{ borderLeftColor: meta.color }}
      aria-pressed={selected}
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Led
            tone={alarm ? "alarm" : machine.status === "SURVEILLANCE" ? "watch" : "normal"}
            pulse={alarm}
          />
          <div className="min-w-0">
            <div className="num truncate text-base font-bold text-ink">{machine.machine_id}</div>
            <div className="mt-0.5 text-sm font-semibold uppercase tracking-wide text-muted">
              Type {machine.type}
            </div>
          </div>
        </div>
        <span className={cls("badge shrink-0", meta.bg, meta.text, meta.border)}>
          {meta.label}
        </span>
      </div>

      <div className="px-4 pb-3 pt-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide text-muted">
              Probabilité panne
            </div>
            <div className="num mt-1 text-3xl font-semibold leading-none text-ink">
              {pct(probability, 1)}
            </div>
          </div>
          <div className="text-right text-sm leading-relaxed text-muted">
            <div className="num">{fmtTime(machine.timestamp)}</div>
            <div>dernier cycle</div>
          </div>
        </div>
        <div className="probability-track mt-3">
          <div
            className={cls("probability-fill", meta.bar)}
            style={{ width: `${Math.max(0, Math.min(100, probability * 100))}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line/80 bg-head/40 px-4 py-3">
        <Metric label="Couple" value={machine.torque} unit="Nm" digits={1} />
        <Metric label="Vitesse" value={machine.rotational_speed} unit="tr/min" digits={0} />
        <Metric label="Usure" value={machine.tool_wear} unit="min" digits={0} />
        <Metric label="ΔT procédé" value={machine.delta_temperature} unit="K" digits={1} />
      </div>
    </button>
  );
}

function Metric({ label, value, unit, digits }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className="num text-base font-semibold text-ink">
        {Number(value || 0).toLocaleString("fr-FR", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        })}
        <span className="ml-1 text-sm font-normal text-muted">{unit}</span>
      </span>
    </div>
  );
}
