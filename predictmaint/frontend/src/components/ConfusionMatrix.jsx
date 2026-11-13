import React from "react";
import { cls, fmtInt, pct, ratio } from "../lib/format";

export function ConfusionMatrix({ data, className = "" }) {
  if (!data?.matrix) return null;
  const [[tn, fp], [fn, tp]] = data.matrix;
  const max = Math.max(tn, fp, fn, tp, 1);
  const total = tn + fp + fn + tp;
  const cell = (value, good, label) => {
    const alpha = 0.08 + 0.42 * (value / max);
    return (
      <div
        className="flex flex-col items-center justify-center rounded-sm border border-white/60 p-3 transition-colors duration-300"
        style={{ backgroundColor: good ? `rgba(34,197,94,${alpha})` : `rgba(228,25,55,${alpha})` }}
        title={`${label} : ${value}`}
      >
        <span className="num text-2xl font-semibold text-ink">{fmtInt(value)}</span>
        <span className="text-sm font-bold uppercase tracking-wide text-body">{label}</span>
      </div>
    );
  };

  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;

  return (
    <div className={className}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-base font-bold uppercase tracking-wide text-muted">{data.model}</span>
        {data.selected && (
          <span className="badge border-brand-200 bg-brand-50 text-brand-700">Modèle retenu</span>
        )}
      </div>
      <div className="grid grid-cols-[110px_1fr_1fr] gap-1.5">
        <div />
        <div className="pb-1 text-center text-sm font-bold uppercase tracking-wide text-muted">
          Prédit normal
        </div>
        <div className="pb-1 text-center text-sm font-bold uppercase tracking-wide text-muted">
          Prédit panne
        </div>
        <div className="flex items-center text-sm font-bold uppercase tracking-wide text-muted">
          Réel normal
        </div>
        {cell(tn, true, "TN")}
        {cell(fp, false, "FP")}
        <div className="flex items-center text-sm font-bold uppercase tracking-wide text-muted">
          Réel panne
        </div>
        {cell(fn, false, "FN")}
        {cell(tp, true, "TP")}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
        <div>
          <div className="text-sm uppercase tracking-wide text-muted">Rappel</div>
          <div className="num text-base font-semibold text-ink">{pct(recall, 1)}</div>
        </div>
        <div>
          <div className="text-sm uppercase tracking-wide text-muted">Précision</div>
          <div className="num text-base font-semibold text-ink">{pct(precision, 1)}</div>
        </div>
        <div>
          <div className="text-sm uppercase tracking-wide text-muted">Spécificité</div>
          <div className="num text-base font-semibold text-ink">{pct(specificity, 1)}</div>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted">
        Matrice issue du jeu de test ({fmtInt(total)} observations, seuil{" "}
        {data.threshold != null ? ratio(data.threshold, 2).replace(".", ",") : "—"}).
      </p>
    </div>
  );
}
