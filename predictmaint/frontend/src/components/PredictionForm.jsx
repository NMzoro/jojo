import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useLive } from "../context/LiveContext";
import { cls, pct, ratio, statusMeta } from "../lib/format";
import { IconActivity, IconRefresh, IconZap } from "./Icons";
import { Spinner } from "./Loading";
import { StatusBadge } from "./StatusBadge";

function blankForm(type = "") {
  return {
    machine_id: "",
    type,
    air_temperature: "",
    process_temperature: "",
    rotational_speed: "",
    torque: "",
    tool_wear: "",
  };
}

export function PredictionForm({
  compact = false,
  showMachineId = false,
  onPredicted,
  className = "",
}) {
  const live = useLive();
  const config = live.config;
  const fields = config?.fields || [];
  const types = config?.types || [];
  const threshold = config?.thresholds?.alarm;

  const [form, setForm] = useState(() => blankForm());
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [liveMachineId, setLiveMachineId] = useState("");

  useEffect(() => {
    if (!form.type && types.length) {
      setForm((current) => ({ ...current, type: types[0].value }));
    }
  }, [types, form.type]);

  useEffect(() => {
    if (!liveMachineId && live.machines.length) {
      setLiveMachineId(live.machines[0].machine_id);
    }
  }, [live.machines, liveMachineId]);

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const loadLiveMeasure = () => {
    const machine = live.machines.find((item) => item.machine_id === liveMachineId);
    if (!machine) return;
    setForm({
      machine_id: machine.machine_id,
      type: machine.type,
      air_temperature: String(machine.air_temperature),
      process_temperature: String(machine.process_temperature),
      rotational_speed: String(machine.rotational_speed),
      torque: String(machine.torque),
      tool_wear: String(machine.tool_wear),
    });
    setError(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    const air = Number(form.air_temperature);
    const process = Number(form.process_temperature);
    if (!Number.isFinite(air) || !Number.isFinite(process) || process <= air) {
      setError("La température du procédé doit être supérieure à celle de l'air.");
      return;
    }
    setLoading(true);
    try {
      const payload = { type: form.type };
      fields.forEach((field) => {
        payload[field.key] = Number(form[field.key]);
      });
      if (form.machine_id.trim()) payload.machine_id = form.machine_id.trim();
      const response = await api.predict(payload);
      setResult(response);
      onPredicted?.(response);
    } catch (exc) {
      setError(exc.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const meta = result ? statusMeta(result.status) : null;

  return (
    <div className={cls("grid gap-5", compact ? "" : "lg:grid-cols-[1.1fr_.9fr]", className)}>
      <div>
        {!config ? (
          <div className="rounded-sm border border-dashed border-line bg-head/30 px-4 py-10 text-center">
            <p className="text-base font-semibold text-muted">
              {live.configError ? "Configuration indisponible" : "Chargement de la configuration…"}
            </p>
            <p className="mt-1 text-sm text-muted">
              Les champs sont définis par le backend et apparaîtront dès sa réponse.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="flex flex-wrap items-end gap-3 rounded-sm border border-line bg-head/50 p-3">
              <div className="min-w-[190px] flex-1">
                <label className="label" htmlFor="live-machine">
                  Charger une mesure live
                </label>
                <select
                  id="live-machine"
                  className="select"
                  value={liveMachineId}
                  onChange={(event) => setLiveMachineId(event.target.value)}
                >
                  {live.machines.length ? (
                    live.machines.map((machine) => (
                      <option key={machine.machine_id} value={machine.machine_id}>
                        {machine.machine_id}
                      </option>
                    ))
                  ) : (
                    <option value="">Aucune machine disponible</option>
                  )}
                </select>
              </div>
              <button
                type="button"
                className="btn"
                onClick={loadLiveMeasure}
                disabled={!liveMachineId}
              >
                <IconRefresh size={16} /> Charger
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="type">
                  Gamme machine
                </label>
                <select
                  id="type"
                  className="select"
                  value={form.type}
                  onChange={(event) => update("type", event.target.value)}
                >
                  {types.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="machine_id">
                  ID machine {showMachineId ? "" : "(facultatif)"}
                </label>
                <input
                  id="machine_id"
                  className="input"
                  placeholder="Identifiant machine"
                  value={form.machine_id}
                  onChange={(event) => update("machine_id", event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {fields.map((field) => (
                <div key={field.key}>
                  <label className="label" htmlFor={field.key}>
                    {field.label}{" "}
                    <span className="normal-case tracking-normal text-gray-500">({field.unit})</span>
                  </label>
                  <input
                    id={field.key}
                    type="number"
                    className="input"
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={form[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                    required
                  />
                </div>
              ))}
            </div>

            <p className="rounded-sm border border-line bg-head/60 px-3 py-2.5 text-sm leading-relaxed text-muted">
              Variables dérivées calculées par le backend. Seuil de décision :{" "}
              {threshold != null ? ratio(threshold, 2).replace(".", ",") : "—"}.
            </p>

            {error && (
              <p className="rounded-sm border border-brand/30 bg-brand-50 px-3 py-2.5 text-base font-semibold text-brand">
                {error}
              </p>
            )}

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? (
                <Spinner size={18} className="border-white/30 border-t-white" />
              ) : (
                <IconActivity size={18} />
              )}
              Lancer la prédiction
            </button>
          </form>
        )}
      </div>

      <div className="flex flex-col">
        {!result ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-sm border border-dashed border-line bg-head/30 px-5 py-12 text-center">
            <IconActivity size={32} className="text-gray-300" />
            <p className="text-base font-bold text-muted">Aucune prédiction</p>
            <p className="max-w-[260px] text-sm leading-relaxed text-muted">
              Renseignez les capteurs ou chargez une mesure live puis lancez l'analyse. Le résultat
              s'ajoute au flux temps réel.
            </p>
          </div>
        ) : (
          <div className={cls("animate-fade-up rounded-sm border bg-white p-5", meta.border)}>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold uppercase tracking-wide text-muted">
                Résultat du modèle
              </span>
              <StatusBadge status={result.status} />
            </div>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-wide text-muted">
                  Probabilité de panne
                </div>
                <div className="num mt-1 text-5xl font-semibold leading-none text-ink">
                  {pct(result.probability, 1)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm uppercase tracking-wide text-muted">Latence</div>
                <div className="num text-base font-semibold text-ink">{result.latency_ms} ms</div>
              </div>
            </div>
            <div className="probability-track mt-4">
              <div
                className="probability-fill"
                style={{
                  width: `${result.probability * 100}%`,
                  backgroundColor: meta.color,
                }}
              />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div>
                <dt className="text-sm uppercase tracking-wide text-muted">ΔT procédé</dt>
                <dd className="num text-base font-semibold text-ink">
                  {result.derived?.delta_temperature} K
                </dd>
              </div>
              <div>
                <dt className="text-sm uppercase tracking-wide text-muted">Puissance</dt>
                <dd className="num text-base font-semibold text-ink">
                  {Number(result.derived?.power_proxy || 0).toLocaleString("fr-FR", {
                    maximumFractionDigits: 0,
                  })}{" "}
                  W
                </dd>
              </div>
              <div>
                <dt className="text-sm uppercase tracking-wide text-muted">Décision</dt>
                <dd className="num text-base font-semibold text-ink">
                  {result.prediction === 1 ? "1 — panne" : "0 — normal"}
                </dd>
              </div>
              <div>
                <dt className="text-sm uppercase tracking-wide text-muted">Seuil</dt>
                <dd className="num text-base font-semibold text-ink">{result.threshold}</dd>
              </div>
            </dl>
            {result.machine_id && (
              <p className="mt-3 text-sm text-muted">
                Machine : <span className="num font-semibold text-ink">{result.machine_id}</span>
              </p>
            )}
          </div>
        )}
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Seuil 0,5 ; choix du modèle descriptif sur le test (F1).
        </p>
      </div>
    </div>
  );
}
