import React from "react";
import { cls, fmtTime, severityMeta } from "../lib/format";
import { Led } from "./Led";

export function AlarmJournal({ alarms = [], limit = 10, dense = false }) {
  if (!alarms.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Led tone="normal" />
        <p className="text-base font-semibold text-muted">Aucune alarme enregistrée</p>
        <p className="text-sm text-muted">
          Les événements de surveillance et de panne apparaîtront ici.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-line/80">
      {alarms.slice(0, limit).map((alarm, index) => {
        const meta = severityMeta(alarm.severity);
        const isAlarm = alarm.severity === "PANNE_PREVUE";
        return (
          <div
            key={alarm.id}
            className={cls(
              "flex min-h-12 items-center gap-3 px-4",
              dense ? "py-2.5" : "py-3",
              index === 0 && "animate-slide-in"
            )}
          >
            <span className="num w-[76px] shrink-0 text-sm text-muted">
              {fmtTime(alarm.timestamp)}
            </span>
            <Led
              tone={isAlarm ? "alarm" : alarm.severity === "SURVEILLANCE" ? "watch" : "normal"}
              pulse={isAlarm}
            />
            <span className="num w-[120px] shrink-0 truncate text-base font-semibold text-ink">
              {alarm.machine_id}
            </span>
            <span className="min-w-0 flex-1 truncate text-base text-body" title={alarm.event}>
              {alarm.event}
            </span>
            <span
              className={cls(
                "hidden shrink-0 rounded-sm border px-2 py-1 text-sm font-bold uppercase tracking-wide sm:inline-flex",
                meta.bg,
                meta.text,
                meta.border
              )}
            >
              {meta.label}
            </span>
            <span className="num w-14 shrink-0 text-right text-base font-semibold text-ink">
              {Math.round((alarm.probability || 0) * 100)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
