import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { downloadCSV } from "../lib/csv";
import { useLive } from "../context/LiveContext";
import { cls, fmtTime, pct, statusMeta } from "../lib/format";
import { IconActivity, IconDownload, IconRefresh, IconTrash, IconZap } from "../components/Icons";
import { ErrorPanel, Spinner } from "../components/Loading";
import { Panel } from "../components/Panel";
import { PredictionForm } from "../components/PredictionForm";
import { StatusBadge } from "../components/StatusBadge";

let rowSeq = 0;

function blankRow(type = "") {
  rowSeq += 1;
  return {
    key: `row-${rowSeq}`,
    type,
    air_temperature: "",
    process_temperature: "",
    rotational_speed: "",
    torque: "",
    tool_wear: "",
  };
}

export default function Prediction() {
  const live = useLive();
  const config = live.config;
  const fields = config?.fields || [];
  const types = config?.types || [];

  const [tab, setTab] = useState("single");
  const [rows, setRows] = useState(() => [blankRow()]);
  const [batchResults, setBatchResults] = useState(null);
  const [batchError, setBatchError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!types.length) return;
    setRows((current) =>
      current.map((row) => (row.type ? row : { ...row, type: types[0].value }))
    );
  }, [types]);

  const updateRow = (key, field, value) => {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
  };

  const addRow = () => setRows((current) => [...current, blankRow(types[0]?.value || "")]);
  const removeRow = (key) => setRows((current) => current.filter((row) => row.key !== key));

  const loadLiveMachines = () => {
    if (!live.machines.length) return;
    setRows(
      live.machines.map((machine) => ({
        ...blankRow(machine.type),
        air_temperature: String(machine.air_temperature),
        process_temperature: String(machine.process_temperature),
        rotational_speed: String(machine.rotational_speed),
        torque: String(machine.torque),
        tool_wear: String(machine.tool_wear),
      }))
    );
    setBatchError(null);
    setBatchResults(null);
  };

  const submitBatch = async () => {
    setBatchError(null);
    const machines = [];
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const complete = fields.every((field) => String(row[field.key]).trim() !== "");
      if (!complete) {
        setBatchError(`Ligne ${index + 1} : tous les champs capteurs doivent être renseignés.`);
        return;
      }
      const air = Number(row.air_temperature);
      const process = Number(row.process_temperature);
      if (process <= air) {
        setBatchError(
          `Ligne ${index + 1} : la température du procédé doit être supérieure à celle de l'air.`
        );
        return;
      }
      const payload = { type: row.type };
      fields.forEach((field) => {
        payload[field.key] = Number(row[field.key]);
      });
      machines.push(payload);
    }
    setLoading(true);
    try {
      const response = await api.predictBatch(machines);
      setBatchResults(response);
    } catch (exc) {
      setBatchError(exc.message);
      setBatchResults(null);
    } finally {
      setLoading(false);
    }
  };

  const exportBatch = () => {
    if (!batchResults) return;
    const rows = batchResults.predictions.map((prediction, index) => ({
      ...prediction,
      line: index + 1,
    }));
    downloadCSV("predictmaint_predictions_lot.csv", rows, [
      { key: "line", label: "Ligne" },
      { key: "timestamp", label: "Horodatage" },
      { key: "probability", label: "Probabilité" },
      { key: "prediction", label: "Prédiction" },
      { key: "status", label: "Statut" },
      { key: "threshold", label: "Seuil" },
      { key: "latency_ms", label: "Latence (ms)" },
      { value: (row) => row.derived?.delta_temperature, label: "Delta T (K)" },
      { value: (row) => row.derived?.power_proxy, label: "Puissance (W)" },
    ]);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">
            Prédiction unitaire & par lot
          </h1>
          <p className="mt-1.5 text-base text-muted">
            Les variables dérivées sont calculées côté backend avant le pipeline.
          </p>
        </div>
        <div className="flex items-center rounded-sm border border-line bg-white p-0.5">
          <button
            type="button"
            className={cls("tab-btn border-0", tab === "single" && "active")}
            onClick={() => setTab("single")}
          >
            Unitaire
          </button>
          <button
            type="button"
            className={cls("tab-btn border-0", tab === "batch" && "active")}
            onClick={() => setTab("batch")}
          >
            Par lot
          </button>
        </div>
      </div>

      {tab === "single" ? (
        <div className="grid grid-cols-12 gap-4">
          <Panel
            className="col-span-12 xl:col-span-8"
            title="Nouvelle prédiction"
            subtitle="Bornes et gammes fournies par la configuration backend."
          >
            <PredictionForm showMachineId />
          </Panel>

          <div className="col-span-12 xl:col-span-4">
            <Panel title="Flux des prédictions manuelles" subtitle="Résultats reçus en temps réel">
              {!live.manualPredictions.length ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center">
                  <IconActivity size={30} className="text-gray-300" />
                  <p className="text-base font-semibold text-muted">Aucune prédiction manuelle</p>
                  <p className="text-sm text-muted">Le résultat apparaîtra ici instantanément.</p>
                </div>
              ) : (
                <div className="max-h-[620px] space-y-3 overflow-y-auto pr-1">
                  {live.manualPredictions.map((entry, index) => {
                    const prediction = entry.prediction;
                    const meta = statusMeta(prediction.status);
                    return (
                      <div
                        key={`${prediction.timestamp}-${index}`}
                        className={cls(
                          "rounded-sm border bg-white px-3.5 py-3",
                          index === 0 ? "animate-slide-in" : "",
                          meta.border
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="num text-base font-bold text-ink">
                            {prediction.machine_id || "Sans identifiant"}
                          </span>
                          <StatusBadge status={prediction.status} />
                        </div>
                        <div className="mt-2 flex items-end justify-between gap-3">
                          <span className="num text-3xl font-semibold" style={{ color: meta.color }}>
                            {pct(prediction.probability, 1)}
                          </span>
                          <span className="num text-sm text-muted">
                            {fmtTime(prediction.timestamp)} · {prediction.latency_ms} ms
                          </span>
                        </div>
                        <div className="mt-1.5 text-sm text-muted">
                          Type {entry.input?.type} · ΔT {prediction.derived?.delta_temperature} K
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Panel
            title="Prédiction par lot"
            subtitle="Chaque ligne est envoyée au modèle avec validation des bornes capteurs."
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn" onClick={loadLiveMachines}>
                  <IconRefresh size={18} /> Charger les machines en ligne
                </button>
                <button type="button" className="btn" onClick={addRow} disabled={!config}>
                  + Ajouter une ligne
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={submitBatch}
                  disabled={loading || !config}
                >
                  {loading ? (
                    <Spinner size={18} className="border-white/30 border-t-white" />
                  ) : (
                    <IconZap size={18} />
                  )}
                  Prédire le lot
                </button>
              </div>
            }
            flush
          >
            <div className="overflow-x-auto">
              <table className="hmi-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Type</th>
                    {fields.map((field) => (
                      <th key={field.key}>
                        {field.label} ({field.unit})
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={row.key}>
                      <td className="num text-muted">{index + 1}</td>
                      <td>
                        <select
                          className="select w-[150px]"
                          value={row.type}
                          onChange={(event) => updateRow(row.key, "type", event.target.value)}
                        >
                          {types.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      {fields.map((field) => (
                        <td key={field.key}>
                          <input
                            type="number"
                            className="input w-[150px]"
                            value={row[field.key]}
                            min={field.min}
                            max={field.max}
                            step={field.step}
                            onChange={(event) => updateRow(row.key, field.key, event.target.value)}
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="btn btn-icon text-gray-500 hover:text-brand"
                          onClick={() => removeRow(row.key)}
                          disabled={rows.length === 1}
                          title="Supprimer"
                          aria-label={`Supprimer la ligne ${index + 1}`}
                        >
                          <IconTrash size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td colSpan={fields.length + 3} className="py-12 text-center text-base text-muted">
                        Aucune ligne. Ajoutez une ligne ou chargez les machines en ligne.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {batchError && <ErrorPanel error={new Error(batchError)} />}

          {batchResults && (
            <Panel
              title={`Résultats du lot (${batchResults.count})`}
              subtitle={`Latence totale de prédiction : ${batchResults.latency_ms} ms`}
              actions={
                <button type="button" className="btn" onClick={exportBatch}>
                  <IconDownload size={18} /> Exporter CSV
                </button>
              }
              flush
            >
              <div className="overflow-x-auto">
                <table className="hmi-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Statut</th>
                      <th>Probabilité</th>
                      <th>Décision</th>
                      <th>ΔT</th>
                      <th>Puissance</th>
                      <th>Latence</th>
                      <th>Horodatage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchResults.predictions.map((prediction, index) => (
                      <tr key={`${prediction.timestamp}-${index}`}>
                        <td className="num text-muted">{index + 1}</td>
                        <td>
                          <StatusBadge status={prediction.status} />
                        </td>
                        <td>
                          <div className="flex items-center gap-3 whitespace-nowrap">
                            <div className="h-3 w-[90px] shrink-0 overflow-hidden rounded-full bg-gray-200">
                              <div
                                className="probability-fill"
                                style={{
                                  width: `${prediction.probability * 100}%`,
                                  background: statusMeta(prediction.status).color,
                                }}
                              />
                            </div>
                            <span className="num font-semibold">{pct(prediction.probability, 1)}</span>
                          </div>
                        </td>
                        <td className="num">{prediction.prediction}</td>
                        <td className="num">{prediction.derived?.delta_temperature} K</td>
                        <td className="num">
                          {Number(prediction.derived?.power_proxy || 0).toLocaleString("fr-FR", {
                            maximumFractionDigits: 0,
                          })}{" "}
                          W
                        </td>
                        <td className="num text-muted">{prediction.latency_ms} ms</td>
                        <td className="num text-sm text-muted">{fmtTime(prediction.timestamp)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
