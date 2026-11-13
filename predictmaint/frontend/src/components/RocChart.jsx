import React from "react";
import { ratio } from "../lib/format";

const COLORS = ["#E41937", "#111827", "#F59E0B", "#2563EB", "#6B7280", "#9CA3AF"];

const WIDTH = 600;
const HEIGHT = 340;
const PAD = 52;

export function RocChart({ curves = [] }) {
  if (!curves.length) {
    return (
      <div className="flex h-[300px] items-center justify-center text-base text-muted">
        Courbes ROC indisponibles.
      </div>
    );
  }
  const innerW = WIDTH - PAD - 20;
  const innerH = HEIGHT - PAD - 24;
  const x = (value) => PAD + value * innerW;
  const y = (value) => HEIGHT - PAD + 4 - value * innerH;

  const grid = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full" role="img" aria-label="Courbes ROC">
        {grid.map((value) => (
          <g key={value}>
            <line
              x1={x(value)}
              y1={y(0)}
              x2={x(value)}
              y2={y(1)}
              stroke="#F3F4F6"
              strokeWidth="1"
            />
            <line
              x1={x(0)}
              y1={y(value)}
              x2={x(1)}
              y2={y(value)}
              stroke="#F3F4F6"
              strokeWidth="1"
            />
            <text
              x={x(value)}
              y={HEIGHT - PAD + 22}
              textAnchor="middle"
              fontSize="14"
              fill="#4B5563"
              fontFamily='"JetBrains Mono", ui-monospace, monospace'
            >
              {Math.round(value * 100)}%
            </text>
            <text
              x={PAD - 10}
              y={y(value) + 5}
              textAnchor="end"
              fontSize="14"
              fill="#4B5563"
              fontFamily='"JetBrains Mono", ui-monospace, monospace'
            >
              {Math.round(value * 100)}
            </text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#9CA3AF" strokeDasharray="5 5" />
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(0)} stroke="#4B5563" strokeWidth="1.5" />
        <line x1={x(0)} y1={y(0)} x2={x(0)} y2={y(1)} stroke="#4B5563" strokeWidth="1.5" />
        <text
          x={WIDTH / 2 + 10}
          y={HEIGHT - 8}
          textAnchor="middle"
          fontSize="14"
          fill="#4B5563"
        >
          Taux de faux positifs
        </text>
        <text
          x={14}
          y={HEIGHT / 2}
          textAnchor="middle"
          fontSize="14"
          fill="#4B5563"
          transform={`rotate(-90 14 ${HEIGHT / 2})`}
        >
          Taux de vrais positifs
        </text>
        {curves.map((curve, index) => (
          <polyline
            key={curve.model}
            fill="none"
            stroke={curve.selected ? "#E41937" : COLORS[index % COLORS.length]}
            strokeWidth={curve.selected ? 3 : 1.8}
            points={curve.points
              .map((point) => `${x(point.FPR)},${y(point.TPR)}`)
              .join(" ")}
            opacity={curve.selected ? 1 : 0.75}
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
        {curves.map((curve, index) => (
          <div key={curve.model} className="flex items-center gap-2">
            <span
              className="h-1 w-6 rounded-full"
              style={{ background: curve.selected ? "#E41937" : COLORS[index % COLORS.length] }}
            />
            <span className="text-sm font-semibold text-body">{curve.model}</span>
            <span className="num text-sm text-muted">
              AUC {curve.auc != null ? ratio(curve.auc, 3) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
