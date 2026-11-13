import React from "react";

export function Spinner({ size = 22, className = "" }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-brand/20 border-t-brand ${className}`}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Chargement"
    />
  );
}

export function LoadingPanel({ label = "Chargement des données…", height = 180 }) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-sm border border-dashed border-line bg-head/30"
      style={{ minHeight: height }}
    >
      <Spinner size={26} />
      <p className="text-base font-semibold text-muted">{label}</p>
    </div>
  );
}

export function ErrorPanel({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-sm border border-brand/20 bg-brand-50/40 px-5 py-8 text-center">
      <p className="text-base font-bold text-brand">Impossible de charger les données</p>
      <p className="max-w-lg text-sm text-body">{error?.message || String(error)}</p>
      {onRetry && (
        <button type="button" className="btn mt-1" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </div>
  );
}
