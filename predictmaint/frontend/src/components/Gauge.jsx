import React from "react";
import { cls } from "../lib/format";

export function Gauge({
  label,
  value,
  max = null,
  unit = "",
  color = "#E41937",
  digits = 0,
  sub,
  className = "",
}) {
  const maxValue = Number(max);
  const hasMax = Number.isFinite(maxValue) && maxValue > 0;
  const ratio = hasMax ? Math.max(0, Math.min(1, Number(value || 0) / maxValue)) : 0;
  const angle = -180 + ratio * 180;
  const cx = 100;
  const cy = 92;
  const radius = 66;
  const radians = (angle * Math.PI) / 180;
  const needleX = cx + radius * Math.cos(radians);
  const needleY = cy + radius * Math.sin(radians);

  return (
    <div className={cls("flex flex-col items-center", className)}>
      <svg viewBox="0 0 200 126" className="w-full max-w-[210px]" role="img" aria-label={label}>
        <defs>
          <linearGradient id={`gauge-${label}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#F3F4F6" />
            <stop offset="100%" stopColor="#E5E7EB" />
          </linearGradient>
        </defs>
        <path
          d="M 28 92 A 72 72 0 0 1 172 92"
          fill="none"
          stroke={`url(#gauge-${label})`}
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 28 92 A 72 72 0 0 1 172 92"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={`${ratio * 100} 100`}
          style={{ transition: "stroke-dasharray 300ms ease, stroke 300ms ease" }}
        />
        <line
          x1={cx}
          y1={cy}
          x2={needleX}
          y2={needleY}
          stroke="#111827"
          strokeWidth="3"
          strokeLinecap="round"
          style={{ transition: "all 300ms ease" }}
        />
        <circle cx={cx} cy={cy} r="5" fill="#111827" />
        <circle cx={cx} cy={cy} r="2" fill="#FFFFFF" />
        <text x="28" y="118" textAnchor="middle" className="fill-gray-500" fontSize="14">
          0
        </text>
        <text x="172" y="118" textAnchor="middle" className="fill-gray-500" fontSize="14">
          {hasMax ? maxValue.toLocaleString("fr-FR") : "—"}
        </text>
      </svg>
      <div className="-mt-1 text-center">
        <div className="flex items-baseline justify-center gap-1.5">
          <span className="num text-2xl font-semibold text-ink">
            {Number(value || 0).toLocaleString("fr-FR", {
              minimumFractionDigits: digits,
              maximumFractionDigits: digits,
            })}
          </span>
          {unit && <span className="text-sm font-semibold text-muted">{unit}</span>}
        </div>
        <div className="gauge-label mt-1">{label}</div>
        {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
      </div>
    </div>
  );
}
