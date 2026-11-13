import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useLive } from "../context/LiveContext";
import { useApiData } from "../hooks/useApiData";
import { cls, fmtDateTime, fmtInt, fmtTime, ratio, statusMeta } from "../lib/format";
import { IconActivity, IconDatabase, IconFile, IconSettings, IconShield, IconZap } from "../components/Icons";
import { Led } from "../components/Led";
import { Panel } from "../components/Panel";

export default function Parametres() {
  const live = useLive();
  const { data: info } = useApiData(() => api.systemInfo(), []);
  const [injectTarget, setInjectTarget] = useState("");

  useEffect(() => {
    if (!injectTarget && live.machines.length) setInjectTarget(live.machines[0].machine_id);
  }, [live.machines, injectTarget]);

  const resetInterface = () => {
    try {
      localStorage.removeItem("predictmaint.sound");
    } catch {
      /* ignore */
    }
    window.location.reload();
  };

  const config = live.config;
  const paused = live.simulator?.paused;
  const interval = live.simulator?.interval;
  const connected = live.apiHealth?.status === "ok";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Paramètres du système</h1>
        <p className="mt-1.5 text-base text-muted">
          Contrôle du simulateur, seuils du modèle et informations d'exploitation.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel
          className="col-span-12 xl:col-span-7"
          title="Simulateur temps réel"
          subtitle={
            config?.line
              ? `${config.line.name} · ${config.line.workshop} · ${live.kpis.machine_count ?? "—"} machines`
              : "Flux temps réel et historique SQLite"
          }
          actions={
            <span className="badge border-line bg-head text-muted">
              intervalle {interval != null ? `${interval} s` : "—"}
            </span>
          }
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Machines", live.kpis.machine_count, "#111827"],
              ["Clients", live.simulator?.clients, "#E41937"],
              ["Ticks", live.simulator?.tick_count, "#F59E0B"],
              ["Pannes actives", live.kpis.alarm_count, "#E41937"],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-sm border border-line bg-head/50 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  <span className="text-sm font-bold uppercase tracking-wide text-muted">{label}</span>
                </div>
                <div className="num mt-1.5 text-xl font-semibold text-ink">
                  {value != null ? fmtInt(value) : "—"}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <button
              type="button"
              className={paused ? "btn btn-primary" : "btn"}
              onClick={() => live.setPaused(!paused)}
            >
              {paused ? "Reprendre le flux" : "Mettre en pause"}
            </button>
            <div className="flex items-center rounded-sm border border-line bg-white p-0.5">
              {(config?.intervals || []).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={cls("tab-btn border-0", interval === value && "active")}
                  onClick={() => live.setIntervalSeconds(value)}
                >
                  {value} s
                </button>
              ))}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                className="select w-[150px]"
                value={injectTarget}
                onChange={(event) => setInjectTarget(event.target.value)}
              >
                {live.machines.map((machine) => (
                  <option key={machine.machine_id} value={machine.machine_id}>
                    {machine.machine_id}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => live.injectFault(injectTarget)}
                disabled={!injectTarget}
              >
                <IconZap size={18} /> Injecter
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line bg-head/40 px-3 py-2.5 text-sm text-muted">
            <span>
              Dernier tick :{" "}
              <span className="num text-ink">
                {live.simulator?.last_tick ? fmtTime(live.simulator.last_tick) : "—"}
              </span>
            </span>
            <span>
              Latence batch :{" "}
              <span className="num text-ink">
                {live.latency != null ? `${Math.round(live.latency)} ms` : "—"}
              </span>
            </span>
            <span>
              Connexion :{" "}
              <span className="font-semibold text-ink">
                {connected ? "Connecté" : "Hors ligne"}
              </span>
            </span>
          </div>
        </Panel>

        <Panel
          className="col-span-12 xl:col-span-5"
          title="Seuils & alertes"
          subtitle="Règles métier appliquées à la probabilité du modèle"
        >
          <div className="space-y-3">
            {(config?.statuses || []).map((item) => (
              <ThresholdRow
                key={item.value}
                color={statusMeta(item.value).color}
                label={item.label}
                range={
                  item.min === 0
                    ? `p < ${ratio(item.max, 2).replace(".", ",")}`
                    : item.max >= 1
                      ? `p ≥ ${ratio(item.min, 2).replace(".", ",")}`
                      : `${ratio(item.min, 2).replace(".", ",")} ≤ p < ${ratio(item.max, 2).replace(
                          ".",
                          ","
                        )}`
                }
                description={item.action}
              />
            ))}
            {!config && (
              <p className="rounded-sm border border-dashed border-line bg-head/30 px-3 py-6 text-center text-base text-muted">
                Seuils indisponibles.
              </p>
            )}
          </div>

          <div className="mt-4 border-t border-line pt-4">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-base font-semibold text-ink">Bip sonore</span>
                <span className="block text-sm text-muted">
                  Signal audio à chaque nouvelle panne prévue.
                </span>
              </span>
              <button
                type="button"
                onClick={live.toggleSound}
                className={cls(
                  "relative h-7 w-12 rounded-full transition-colors",
                  live.soundOn ? "bg-brand" : "bg-gray-300"
                )}
                aria-pressed={live.soundOn}
                aria-label="Activer ou désactiver le bip"
              >
                <span
                  className={cls(
                    "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",
                    live.soundOn ? "left-6" : "left-1"
                  )}
                />
              </button>
            </label>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
            <div className="flex items-center gap-2">
              <Led tone={connected ? "normal" : "alarm"} />
              <span className="text-base text-muted">
                État :{" "}
                <span className="font-semibold text-ink">
                  {connected ? "Connecté" : "Hors ligne"}
                </span>
              </span>
            </div>
            <button type="button" className="btn" onClick={resetInterface}>
              <IconSettings size={18} /> Préférences locales
            </button>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel
          className="col-span-12 xl:col-span-7"
          title="Configuration du modèle"
          subtitle="Valeurs chargées depuis le backend"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { label: "Modèle", value: info?.model || config?.model?.name },
              { label: "Seuil", value: info?.threshold ?? config?.thresholds?.alarm, decimal: true },
              { label: "Version", value: info?.version ?? live.apiHealth?.version },
              {
                label: "Dataset",
                value: info?.dataset_rows,
                format: (value) => `${fmtInt(value)} lignes`,
              },
              { label: "Seed", value: info?.metadata?.seed },
              {
                label: "Test",
                value: info?.metadata?.test_size,
                format: (value) => `${fmtInt(value)} obs.`,
              },
            ].map((item) => (
              <div key={item.label} className="rounded-sm border border-line bg-head/40 px-3 py-2.5">
                <div className="text-sm font-bold uppercase tracking-wide text-muted">
                  {item.label}
                </div>
                <div className="num mt-1 truncate text-base font-semibold text-ink">
                  {item.value == null || item.value === ""
                    ? "—"
                    : item.format
                      ? item.format(item.value)
                      : item.decimal
                        ? String(item.value).replace(".", ",")
                        : String(item.value)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted">Artefacts</span>
              <span className="num break-all text-right font-medium text-ink">
                {info?.artifacts_dir || "—"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted">Base SQLite</span>
              <span className="num break-all text-right font-medium text-ink">
                {info?.database || "—"}
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted">Variables dérivées</span>
              <span className="text-right font-medium text-ink">
                {(config?.derived_features || []).join(" · ") || "—"}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-sm border border-brand/20 bg-brand-50/60 px-3 py-2.5">
            <IconShield size={18} className="mt-0.5 shrink-0 text-brand" />
            <p className="text-sm leading-relaxed text-body">
              Seuil 0,5 ; choix du modèle descriptif sur le test (F1). Aucune clé externe :
              l'ensemble de la chaîne fonctionne hors-ligne.
            </p>
          </div>
        </Panel>

        <Panel
          className="col-span-12 xl:col-span-5"
          title="Gammes & bornes capteurs"
          subtitle="Champs de saisie et plages fournis par le backend"
          flush
        >
          <div className="border-b border-line px-4 py-3">
            <p className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Gammes machine</p>
            <div className="flex flex-wrap gap-2">
              {(config?.types || []).map((item) => (
                <span key={item.value} className="badge border-line bg-head text-ink">
                  {item.label}
                </span>
              ))}
              {!config?.types?.length && <span className="text-base text-muted">—</span>}
            </div>
          </div>
          <div className="max-h-[360px] overflow-auto">
            <table className="hmi-table">
              <thead>
                <tr>
                  <th>Capteur</th>
                  <th>Unité</th>
                  <th>Minimum</th>
                  <th>Maximum</th>
                </tr>
              </thead>
              <tbody>
                {(config?.fields || []).map((field) => (
                  <tr key={field.key}>
                    <td className="font-semibold text-ink">{field.label}</td>
                    <td className="num">{field.unit}</td>
                    <td className="num">{field.min ?? "—"}</td>
                    <td className="num">{field.max ?? "—"}</td>
                  </tr>
                ))}
                {!config?.fields?.length && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-base text-muted">
                      Configuration indisponible.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Exploitation" subtitle="Environnement local du dashboard">
          <ul className="space-y-3 text-base leading-relaxed text-body">
            <li className="flex items-start gap-3">
              <IconActivity size={18} className="mt-0.5 shrink-0 text-brand" />
              Connexion temps réel : {connected ? "Connecté" : "Hors ligne"} ·{" "}
              {live.simulator?.clients != null ? `${live.simulator.clients} client(s)` : "—"}
            </li>
            <li className="flex items-start gap-3">
              <IconDatabase size={18} className="mt-0.5 shrink-0 text-brand" />
              <span className="break-all">
                Historique SQLite : {info?.database || "—"}
              </span>
            </li>
            <li className="flex items-start gap-3">
              <IconFile size={18} className="mt-0.5 shrink-0 text-brand" />
              <span className="break-all">Artefacts : {info?.artifacts_dir || "—"}</span>
            </li>
          </ul>
        </Panel>

        <Panel title="Identité de la ligne" subtitle="Informations opérateur">
          <dl className="grid grid-cols-2 gap-3">
            {[
              ["Ligne", config?.line?.name],
              ["Atelier", config?.line?.workshop],
              ["Opérateur", config?.line?.operator],
              ["Version", info?.version ?? live.apiHealth?.version],
            ].map(([label, value]) => (
              <div key={label} className="rounded-sm border border-line bg-head/40 px-3 py-2.5">
                <dt className="text-sm font-bold uppercase tracking-wide text-muted">{label}</dt>
                <dd className="mt-1 text-base font-semibold text-ink">{value || "—"}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-muted">
            Seuil 0,5 ; choix du modèle descriptif sur le test (F1).
          </p>
        </Panel>
      </div>

      <p className="pb-2 text-sm text-muted">
        Dernière lecture :{" "}
        {live.lastMessageAt
          ? fmtDateTime(new Date(live.lastMessageAt).toISOString())
          : "—"}{" "}
        · PredictMaint {info?.version ?? ""}.
      </p>
    </div>
  );
}

function ThresholdRow({ color, label, range, description }) {
  return (
    <div className="flex items-center gap-3 rounded-sm border border-line bg-white px-3 py-2.5">
      <span className="h-8 w-1.5 rounded-sm" style={{ background: color }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base font-bold text-ink">{label}</span>
          <span className="num text-sm text-muted">{range}</span>
        </div>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
    </div>
  );
}
