import React, { useMemo, useState } from "react";
import { api, FILES_BASE, REPORTS_ZIP } from "../lib/api";
import { useApiData } from "../hooks/useApiData";
import { fmtDateTime, fmtInt, pct } from "../lib/format";
import {
  IconDatabase,
  IconDownload,
  IconFile,
  IconSearch,
  IconShield,
} from "../components/Icons";
import { ErrorPanel, LoadingPanel } from "../components/Loading";
import { Panel } from "../components/Panel";

function fmtBytes(value) {
  if (value == null) return "—";
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function Rapports() {
  const { data: info } = useApiData(() => api.systemInfo(), []);
  const { data: metricsData } = useApiData(() => api.metrics(), []);
  const {
    data: reports,
    loading,
    error,
    reload,
  } = useApiData(() => api.reports(), []);
  const [search, setSearch] = useState("");

  const metrics = metricsData?.metrics || {};
  const files = reports?.files || [];

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return files;
    return files.filter((file) => file.filename.toLowerCase().includes(term));
  }, [files, search]);

  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((file) => {
      if (!map.has(file.kind)) map.set(file.kind, []);
      map.get(file.kind).push(file);
    });
    return [...map.entries()];
  }, [filtered]);

  const figure = files.find((file) => file.kind === "PNG");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Rapports & exports</h1>
          <p className="mt-1.5 text-base text-muted">
            Artefacts disponibles dans le dossier de résultats du backend.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="btn" onClick={() => window.print()}>
            <IconFile size={18} /> Imprimer / PDF
          </button>
          <a className="btn btn-primary" href={REPORTS_ZIP} download>
            <IconDownload size={18} /> Télécharger l'archive ZIP
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Modèle retenu", metricsData?.model || info?.model || "—", "Pipeline sérialisé"],
          [
            "Observations dataset",
            info?.dataset_rows != null ? fmtInt(info.dataset_rows) : "—",
            "Source d'entraînement",
          ],
          [
            "Taille du test",
            info?.metadata?.test_size != null ? fmtInt(info.metadata.test_size) : "—",
            "Métadonnées du modèle",
          ],
          [
            "Seuil de décision",
            info?.threshold != null ? String(info.threshold).replace(".", ",") : "—",
            "Configuration backend",
          ],
        ].map(([label, value, sub]) => (
          <div key={label} className="panel relative overflow-hidden p-4 pl-5">
            <span className="kpi-accent bg-brand" />
            <p className="text-sm font-bold uppercase tracking-wide text-muted">{label}</p>
            <p className="num mt-2 truncate text-2xl font-semibold leading-none text-ink">{value}</p>
            <p className="mt-2 text-sm text-muted">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel
          className="col-span-12 xl:col-span-8"
          title={`Artefacts disponibles (${filtered.length})`}
          subtitle={
            reports?.total_bytes != null
              ? `${fmtBytes(reports.total_bytes)} au total · liste générée depuis le backend`
              : "Liste générée depuis le backend"
          }
          flush
        >
          <div className="flex items-center gap-3 border-b border-line px-4 py-3">
            <div className="relative w-full max-w-[360px]">
              <IconSearch
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                className="input pl-9"
                placeholder="Rechercher un fichier…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <button type="button" className="btn ml-auto" onClick={reload}>
              Rafraîchir
            </button>
          </div>

          {error ? (
            <div className="p-4">
              <ErrorPanel error={error} onRetry={reload} />
            </div>
          ) : loading ? (
            <div className="p-4">
              <LoadingPanel height={300} label="Lecture des artefacts…" />
            </div>
          ) : (
            <div className="divide-y divide-line">
              {groups.map(([kind, kindFiles]) => (
                <div key={kind} className="p-4">
                  <p className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
                    {kind} · {kindFiles.length}
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {kindFiles.map((file) => (
                      <a
                        key={file.filename}
                        href={`${FILES_BASE}/${file.filename}`}
                        download
                        className="group flex items-center gap-3 rounded-sm border border-line bg-white px-3 py-2.5 transition-colors hover:border-brand/40 hover:bg-brand-50/40"
                      >
                        <span className="rounded-sm bg-head p-2 text-brand">
                          <IconFile size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="num block truncate text-base font-semibold text-ink">
                            {file.filename}
                          </span>
                          <span className="mt-0.5 block text-sm text-muted">
                            {fmtBytes(file.size_bytes)} · {fmtDateTime(file.modified)}
                          </span>
                        </span>
                        <span className="badge border-line bg-head text-muted">{file.kind}</span>
                        <IconDownload size={18} className="text-gray-400 group-hover:text-brand" />
                      </a>
                    ))}
                  </div>
                </div>
              ))}
              {!filtered.length && (
                <div className="px-4 py-14 text-center text-base text-muted">
                  {files.length
                    ? "Aucun fichier ne correspond à la recherche."
                    : "Aucun artefact disponible."}
                </div>
              )}
            </div>
          )}
        </Panel>

        <div className="col-span-12 space-y-4 xl:col-span-4">
          <Panel
            title="Synthèse du modèle"
            subtitle={metricsData?.model || info?.model || "Modèle indisponible"}
          >
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Accuracy", metrics.accuracy],
                ["Précision", metrics.precision],
                ["Rappel", metrics.recall],
                ["F1-score", metrics.f1],
                ["ROC-AUC", metrics.roc_auc],
                ["Average Precision", metrics.average_precision],
              ].map(([label, value]) => (
                <div key={label} className="rounded-sm border border-line bg-head/50 px-3 py-2.5">
                  <div className="text-sm font-bold uppercase tracking-wide text-muted">{label}</div>
                  <div className="num mt-1 text-xl font-semibold text-ink">
                    {value != null ? pct(value, 2) : "—"}
                  </div>
                </div>
              ))}
            </div>
            {info?.metadata?.trained_at && (
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Entraîné le {fmtDateTime(info.metadata.trained_at)} · seed {info.metadata.seed} ·{" "}
                {fmtInt(info.metadata.test_size)} observations de test.
              </p>
            )}
          </Panel>

          {figure && (
            <Panel title="Figure exportée" subtitle={figure.filename}>
              <img
                src={`${FILES_BASE}/${figure.filename}`}
                alt={figure.filename}
                className="w-full rounded-sm border border-line"
                loading="lazy"
              />
            </Panel>
          )}

          <Panel title="Reproductibilité" subtitle="Environnement d'exécution">
            <div className="rounded-sm bg-ink p-3">
              <code className="num text-sm leading-relaxed text-green-300">
                python train_export.py
              </code>
            </div>
            <div className="mt-3 flex items-start gap-2 text-sm text-muted">
              <IconShield size={18} className="mt-0.5 shrink-0 text-brand" />
              Aucune clé externe · fonctionne hors-ligne
            </div>
            <div className="mt-2 flex items-start gap-2 text-sm text-muted">
              <IconDatabase size={18} className="mt-0.5 shrink-0 text-brand" />
              <span className="break-all">
                Historique SQLite : {info?.database || "—"}
              </span>
            </div>
            <div className="mt-2 flex items-start gap-2 text-sm text-muted">
              <IconFile size={18} className="mt-0.5 shrink-0 text-brand" />
              <span className="break-all">Artefacts : {info?.artifacts_dir || "—"}</span>
            </div>
          </Panel>
        </div>
      </div>

      <p className="pb-2 text-sm text-muted">
        Seuil 0,5 ; choix du modèle descriptif sur le test (F1). Les valeurs affichées proviennent
        des exports du notebook et des métadonnées du modèle.
      </p>
    </div>
  );
}
