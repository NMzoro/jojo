import React from "react";
import { cls, statusMeta, severityMeta } from "../lib/format";
import { Led } from "./Led";

export function StatusBadge({ status, dot = true, className = "" }) {
  const meta = statusMeta(status);
  return (
    <span className={cls("badge", meta.bg, meta.text, meta.border, className)}>
      {dot && <Led tone={status === "NORMAL" ? "normal" : status === "SURVEILLANCE" ? "watch" : "alarm"} size="sm" />}
      {meta.label}
    </span>
  );
}

export function SeverityBadge({ severity, className = "" }) {
  const meta = severityMeta(severity);
  return (
    <span className={cls("badge", meta.bg, meta.text, meta.border, className)}>
      <span className="led h-1.5 w-1.5" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}
