import React, { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import { useApiData } from "../hooks/useApiData";
import { cls, fmtInt, pct, ratio, shortModel } from "../lib/format";
import { ConfusionMatrix } from "../components/ConfusionMatrix";
import { ErrorPanel, LoadingPanel, Spinner } from "../components/Loading";
import { Panel } from "../components/Panel";
import { PredictionForm } from "../components/PredictionForm";
import { RocChart } from "../components/RocChart";

export default function Modeles() {
  const [activeTab, setActiveTab] = useState(null);
  const {
    data: comparison,
    loading: loadingComparison,
    error: comparisonError,
    reload: reloadComparison,
  } = useApiData(() => api.comparison(), []);
  const { data: metricsData } = useApiData(() => api.metrics(), []);
  const { data: info } = useApiData(() => api.systemInfo(), []);
  const { data: importanceData, loading: loadingImportance } = useApiData(
    () => api.importance(),
    []
  );
  const { data: rocData } = useApiData(() => api.roc(), []);
  const { data: bilanData } = useApiData(() => api.bilan(), []);

  const models = comparison?.models || [];
  const selected = models.find((model) => model.selected) || models[0];
  const activeModel = activeTab || selected?.slug || "";

  const {
    data: confusionData,
    loading: loadingConfusion,
    error: confusionError,
    reload: reloadConfusion,
  } = useApiData(
    () => (activeModel ? api.confusion(activeModel) : Promise.resolve(null)),
    [activeModel]
  );

  const metrics = metricsData?.metrics || {
    accuracy: selected?.Accuracy,
    precision: selected?.Precision,
    recall: selected?.Recall,
    f1: selected?.["F1-score"],
    roc_auc: selected?.["ROC-AUC"],
    average_precision: selected?.["Average Precision"],
  };

  const kpis = [
    ["Accuracy", metrics.accuracy],
    ["Précision", metrics.precision],
    ["Rappel", metrics.recall],
    ["F1-score", metrics.f1],
    ["ROC-AUC", metrics.roc_auc],
  ];

  const importance = [...(importanceData?.variables || [])].sort(
    (a, b) => b["Importance moyenne"] - a["Importance moyenne"]
  );
  const maxImportance = Math.max(
    ...importance.map((item) => Math.abs(item["Importance moyenne"])),
    0.0001
  );

  const bilanRows = bilanData?.bilan?.rows || [];
  const equilibrageRows = bilanData?.equilibrage?.rows || [];
  const byLabel = Object.fromEntries(
    bilanRows.map((row) => [String(row.Indicateur), Number(row.Valeur)])
  );
  const tp = byLabel["Pannes détectées (TP)"] ?? byLabel["Pannes detectees (TP)"];
  const fn = byLabel["Pannes manquées (FN)"] ?? byLabel["Pannes manquees (FN)"];
  const fp = byLabel["Fausses alertes (FP)"];
  const prevalence =
    byLabel["Prévalence des pannes (%)"] ?? byLabel["Prevalence des pannes (%)"];
  const testSize = info?.metadata?.test_size ?? confusionData?.matrix?.flat().reduce((a, b) => a + b, 0);
  const threshold = comparison?.threshold ?? info?.threshold;

  const modelName = selected?.Modèle || "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Modèles & métriques</h1>
          <p className="mt-1.5 text-base text-muted">
            {testSize ? `Jeu de test · ${fmtInt(testSize)} observations` : "Jeu de test"}
            {prevalence != null ? ` · prévalence ${ratio(prevalence, 1).replace(".", ",")} %` : ""}
            {threshold != null ? ` · seuil ${ratio(threshold, 2).replace(".", ",")}` : ""}
          </p>
        </div>
        {modelName && (
          <span className="badge border-brand-200 bg-brand-50 text-brand-700">
            {modelName} retenu
          </span>
        )}
      </div>

      {comparisonError && <ErrorPanel error={comparisonError} onRetry={reloadComparison} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map(([label, value], index) => (
          <div key={label} className="panel relative overflow-hidden p-4 pl-5">
            <span
              className="kpi-accent"
              style={{ background: index === 3 ? "#E41937" : "#D1D5DB" }}
            />
            <p className="text-sm font-bold uppercase tracking-wide text-muted">{label}</p>
            <p className="num mt-2 text-4xl font-semibold leading-none text-ink">
              {value != null ? pct(value, 2) : "—"}
            </p>
            <p className="mt-2 truncate text-sm text-muted">
              {modelName ? `${modelName} · test` : "Modèle indisponible"}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel
          className="col-span-12 xl:col-span-7"
          title="Comparaison des cinq modèles"
          subtitle="Modèle retenu surligné — sélection descriptive sur le F1 test"
          actions={
            <span className="badge border-line bg-white text-muted">
              Average Precision incluse
            </span>
          }
          flush
        >
          {loadingComparison ? (
            <div className="p-4">
              <LoadingPanel height={260} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="hmi-table">
                <thead>
                  <tr>
                    <th>Modèle</th>
                    <th>Accuracy</th>
                    <th>Précision</th>
                    <th>Rappel</th>
                    <th>F1</th>
                    <th>ROC-AUC</th>
                    <th>AP</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.Modèle} className={cls(model.selected && "selected")}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          {model.selected && <span className="h-2.5 w-2.5 rounded-full bg-brand" />}
                          <span
                            className={cls(
                              "text-base font-bold",
                              model.selected ? "text-brand" : "text-ink"
                            )}
                          >
                            {model.Modèle}
                          </span>
                          {model.selected && (
                            <span className="badge border-brand-200 bg-white text-brand">
                              retenu
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="num">{ratio(model.Accuracy, 4)}</td>
                      <td className="num">{ratio(model.Precision, 4)}</td>
                      <td className="num">{ratio(model.Recall, 4)}</td>
                      <td className="num font-semibold text-ink">
                        {ratio(model["F1-score"], 4)}
                      </td>
                      <td className="num">{ratio(model["ROC-AUC"], 4)}</td>
                      <td className="num">{ratio(model["Average Precision"], 4)}</td>
                    </tr>
                  ))}
                  {!models.length && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-base text-muted">
                        Aucune comparaison de modèles disponible.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          className="col-span-12 xl:col-span-5"
          title="F1-score par modèle"
          subtitle="Le F1 arbitre précision et rappel sur les pannes"
        >
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={models}
                layout="vertical"
                margin={{ top: 8, right: 40, left: 8, bottom: 4 }}
              >
                <CartesianGrid stroke="#F3F4F6" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 1]}
                  tickFormatter={(value) => `${Math.round(value * 100)}%`}
                  tick={{
                    fontSize: 14,
                    fill: "#4B5563",
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                  }}
                  tickLine={false}
                  axisLine={{ stroke: "#E5E7EB" }}
                />
                <YAxis
                  type="category"
                  dataKey="Modèle"
                  width={130}
                  tickFormatter={(value) => shortModel(value)}
                  tick={{ fontSize: 14, fill: "#111827" }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(value) => [ratio(value, 4), "F1-score"]}
                  contentStyle={{ fontSize: 14, borderColor: "#E5E7EB", borderRadius: 2 }}
                />
                <Bar dataKey="F1-score" radius={[0, 2, 2, 0]} barSize={22}>
                  {models.map((model) => (
                    <Cell key={model.Modèle} fill={model.selected ? "#E41937" : "#D1D5DB"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel
          className="col-span-12 xl:col-span-5"
          title="Matrice de confusion"
          subtitle="Sélectionnez un modèle pour comparer les erreurs"
        >
          <div className="mb-4 flex flex-wrap gap-2 border-b border-line pb-4">
            {models.map((model) => (
              <button
                key={model.slug}
                type="button"
                className={cls("tab-btn", activeModel === model.slug && "active")}
                onClick={() => setActiveTab(model.slug)}
              >
                {shortModel(model.Modèle)}
              </button>
            ))}
          </div>
          {loadingConfusion ? (
            <div className="flex h-[280px] items-center justify-center">
              <Spinner size={24} />
            </div>
          ) : confusionError ? (
            <ErrorPanel error={confusionError} onRetry={reloadConfusion} />
          ) : (
            <ConfusionMatrix data={confusionData} />
          )}

          {tp != null && fn != null && (
            <p className="mt-4 rounded-sm border border-line bg-head/50 px-3 py-2.5 text-sm leading-relaxed text-body">
              <span className="num font-semibold text-ink">{fmtInt(tp)}</span> pannes détectées sur{" "}
              <span className="num font-semibold text-ink">{fmtInt(tp + fn)}</span> ·{" "}
              <span className="num font-semibold text-ink">{fmtInt(fn)}</span> pannes manquées
              {fp != null ? ` · ${fmtInt(fp)} fausses alertes` : ""}.
            </p>
          )}

          {bilanRows.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
              {bilanRows.slice(0, 4).map((row) => (
                <div key={row.Indicateur} className="rounded-sm bg-head/60 px-3 py-2">
                  <div className="text-sm font-bold uppercase tracking-wide text-muted">
                    {row.Indicateur}
                  </div>
                  <div className="num mt-1 text-base font-semibold text-ink">
                    {Number(row.Valeur).toLocaleString("fr-FR")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          className="col-span-12 xl:col-span-7"
          title="Courbes ROC comparées"
          subtitle="Taux de vrais positifs en fonction des faux positifs"
        >
          <RocChart curves={rocData?.curves || []} />
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel
          className="col-span-12 xl:col-span-5"
          title="Importance des variables"
          subtitle="Permutation — baisse moyenne de l'AP (test)"
        >
          {loadingImportance ? (
            <LoadingPanel height={320} label="Calcul / lecture de l'importance…" />
          ) : (
            <div className="space-y-4">
              {importance.map((item) => {
                const value = Number(item["Importance moyenne"]);
                const width = (Math.abs(value) / maxImportance) * 100;
                return (
                  <div key={item.Variable}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-2">
                      <span className="text-base font-medium text-body">{item.Variable}</span>
                      <span className="num text-base font-semibold text-ink">
                        {value.toFixed(4)}
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-sm bg-head">
                      <div
                        className="h-3 rounded-sm transition-all duration-300"
                        style={{
                          width: `${Math.max(1, width)}%`,
                          background: value >= 0 ? "#E41937" : "#9CA3AF",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <p className="pt-1 text-sm leading-relaxed text-muted">
                {importanceData?.model
                  ? `Modèle ${importanceData.model} · scoring ${importanceData.scoring}.`
                  : "Importance indisponible pour le moment."}
              </p>
            </div>
          )}
        </Panel>

        <Panel
          className="col-span-12 xl:col-span-7"
          title="Nouvelle prédiction"
          subtitle="Résultat instantané, ajouté au flux live du dashboard"
        >
          <PredictionForm compact />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Équilibrage SVMSMOTE"
          subtitle="Rééchantillonnage appliqué au train uniquement"
        >
          <div className="overflow-x-auto">
            <table className="hmi-table">
              <thead>
                <tr>
                  <th>Classe</th>
                  <th>Avant</th>
                  <th>Après</th>
                  <th>Part après</th>
                </tr>
              </thead>
              <tbody>
                {equilibrageRows.map((row) => (
                  <tr key={row.Classe}>
                    <td className="font-semibold text-ink">{row.Classe}</td>
                    <td className="num">
                      {Number(row["Avant SVMSMOTE"]).toLocaleString("fr-FR")}
                    </td>
                    <td className="num">
                      {Number(row["Après SVMSMOTE"]).toLocaleString("fr-FR")}
                    </td>
                    <td className="num">{ratio(row["Après (%)"] / 100, 3)}</td>
                  </tr>
                ))}
                {!equilibrageRows.length && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-base text-muted">
                      Aucun export d'équilibrage disponible.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Lecture & limites" subtitle="Transparence méthodologique">
          <ul className="space-y-3 text-base leading-relaxed text-body">
            <li className="flex gap-3">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />
              {threshold != null
                ? `Le seuil de décision est fixé à ${ratio(threshold, 2).replace(
                    ".",
                    ","
                  )} ; le choix du modèle est descriptif sur le test (F1).`
                : "Le seuil de décision et le choix du modèle proviennent des exports du notebook."}
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />
              SVMSMOTE est appliqué dans le pipeline d'entraînement ; il est ignoré en prédiction.
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />
              {testSize
                ? `Les matrices affichées correspondent au test de ${fmtInt(
                    testSize
                  )} observations. Le coût métier des faux négatifs et faux positifs dépend de la politique de maintenance.`
                : "Les matrices et métriques sont lues dans les exports du notebook."}
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />
              Toutes les métriques et courbes proviennent des exports calculés à partir des données
              UCI AI4I 2020.
            </li>
          </ul>
        </Panel>
      </div>

      <p className="pb-2 text-sm text-muted">
        Seuil 0,5 ; choix du modèle descriptif sur le test (F1).
      </p>
    </div>
  );
}
