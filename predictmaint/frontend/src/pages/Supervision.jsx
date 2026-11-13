import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLive } from "../context/LiveContext";
import { cls, pct, fmtTime, ratio, statusMeta } from "../lib/format";
import { AlarmJournal } from "../components/AlarmJournal";
import { Gauge } from "../components/Gauge";
import {
  IconAlert,
  IconPause,
  IconPlay,
  IconRefresh,
  IconThermometer,
  IconWrench,
  IconZap,
} from "../components/Icons";
import { KpiCard } from "../components/KpiCard";
import { Led } from "../components/Led";
import { LiveChart } from "../components/LiveChart";
import { MachineCard } from "../components/MachineCard";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";

export default function Supervision() {
  const live = useLive();
  const [selectedId, setSelectedId] = useState(null);
  const [injectTarget, setInjectTarget] = useState("");

  useEffect(() => {
    if (!injectTarget && live.machines.length) {
      setInjectTarget(live.machines[0].machine_id);
    }
  }, [live.machines, injectTarget]);

  const fallbackMachine = useMemo(() => {
    return live.machines.reduce(
      (best, machine) => (!best || machine.probability > best.probability ? machine : best),
      null
    );
  }, [live.machines]);

  const selected =
    live.machines.find((machine) => machine.machine_id === selectedId) || fallbackMachine;

  const config = live.config;
  const paused = live.simulator?.paused;
  const interval = live.simulator?.interval;
  const connectionIssue = ["offline", "reconnecting", "connecting"].includes(live.connection);
  const threshold = config?.thresholds?.alarm;
  const warning = config?.thresholds?.warning;
  const display = config?.display || {};
  const model = config?.model?.name || live.apiHealth?.model;
  const kpis = live.kpis;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-extrabold tracking-tight text-ink">
              Supervision en temps réel
            </h1>
            {config?.line && (
              <span className="badge border-line bg-head text-muted">
                {config.line.name} · {config.line.workshop}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-base text-muted">
            {kpis.machine_count || "—"} machines instrumentées
            {model ? ` · modèle ${model}` : ""}
            {threshold != null ? ` · seuil de décision ${ratio(threshold, 2).replace(".", ",")}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-sm border border-line bg-white p-0.5">
            <button
              type="button"
              className={cls("tab-btn border-0", !paused && "active")}
              onClick={() => live.setPaused(false)}
              title="Reprendre le flux"
            >
              <span className="flex items-center gap-2">
                <IconPlay size={16} /> Reprendre
              </span>
            </button>
            <button
              type="button"
              className={cls("tab-btn border-0", paused && "active")}
              onClick={() => live.setPaused(true)}
              title="Mettre le flux en pause"
            >
              <span className="flex items-center gap-2">
                <IconPause size={16} /> Pause
              </span>
            </button>
          </div>

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

          <div className="flex items-center gap-2">
            <select
              className="select w-[150px]"
              value={injectTarget}
              onChange={(event) => setInjectTarget(event.target.value)}
              aria-label="Machine pour injection"
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
              <IconZap size={16} />
              Injecter une panne
            </button>
          </div>
        </div>
      </div>

      {connectionIssue && (
        <div className="flex flex-wrap items-center gap-3 rounded-sm border border-brand/25 bg-brand-50 px-4 py-3">
          <IconAlert size={18} className="text-brand" />
          <span className="text-base font-semibold text-brand">
            Connexion perdue — reconnexion automatique en cours.
          </span>
          <span className="text-sm text-body">
            Dernier message :{" "}
            {live.lastMessageAt ? fmtTime(new Date(live.lastMessageAt).toISOString()) : "aucun"}
          </span>
          <button type="button" className="btn ml-auto" onClick={live.reconnect}>
            <IconRefresh size={16} /> Reconnecter
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Machines en ligne"
          value={kpis.online ?? "—"}
          unit={`/ ${kpis.machine_count || "—"}`}
          sub="Flux temps réel"
          icon={IconThermometer}
          tone="normal"
        />
        <KpiCard
          label="Alarmes actives"
          value={kpis.alarm_count ?? "—"}
          unit="panne"
          sub={`${kpis.watch_count ?? "—"} machine(s) en surveillance`}
          icon={IconAlert}
          tone="brand"
        />
        <KpiCard
          label="Taux de défaillance"
          value={pct(kpis.failure_rate, 1)}
          sub="Part des machines en panne prévue"
          icon={IconWrench}
          tone="watch"
        />
        <KpiCard
          label="Rappel du modèle"
          value={pct(kpis.model_recall, 1)}
          sub={
            model && threshold != null
              ? `${model} · seuil ${ratio(threshold, 2).replace(".", ",")}`
              : "Métriques indisponibles"
          }
          icon={IconRefresh}
          tone="ink"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {live.machines.length
          ? live.machines.map((machine) => (
              <MachineCard
                key={machine.machine_id}
                machine={machine}
                selected={selected?.machine_id === machine.machine_id}
                onSelect={() => setSelectedId(machine.machine_id)}
              />
            ))
          : Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-[220px] animate-pulse rounded-sm border border-line bg-head/50"
              />
            ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <Panel
          className="col-span-12 xl:col-span-8"
          title="Probabilité de panne — temps réel"
          subtitle={
            interval
              ? `Fenêtre glissante · cadence ${interval} s${
                  threshold != null ? ` · seuil ${ratio(threshold, 2).replace(".", ",")}` : ""
                }`
              : "Fenêtre glissante"
          }
          actions={
            <div className="flex items-center gap-4 text-sm font-semibold text-muted">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-brand" /> max
              </span>
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-400" /> moyenne
              </span>
            </div>
          }
          bodyClassName="p-3 pt-4"
        >
          <LiveChart
            series={live.series}
            warning={warning}
            alarm={threshold}
            interval={interval}
          />
        </Panel>

        <Panel
          className="col-span-12 xl:col-span-4"
          title="Jauges machine"
          subtitle={
            selected
              ? `${selected.machine_id} · type ${selected.type}`
              : "Aucune machine sélectionnée"
          }
        >
          {selected && config?.display ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <StatusBadge status={selected.status} />
                <span className="num text-sm text-muted">
                  MAJ {fmtTime(selected.timestamp)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Gauge
                  label={display.torque?.label || "—"}
                  value={selected.torque}
                  max={display.torque?.max}
                  unit={display.torque?.unit || ""}
                  color="#E41937"
                  digits={1}
                />
                <Gauge
                  label={display.rotational_speed?.label || "—"}
                  value={selected.rotational_speed}
                  max={display.rotational_speed?.max}
                  unit={display.rotational_speed?.unit || ""}
                  color="#111827"
                  digits={0}
                />
              </div>
              <div className="mt-3 space-y-3 border-t border-line pt-4">
                <Bar
                  label={display.tool_wear?.label || "—"}
                  value={selected.tool_wear}
                  max={display.tool_wear?.max}
                  unit={display.tool_wear?.unit || ""}
                  color="#4B5563"
                />
                <Bar
                  label={display.delta_temperature?.label || "—"}
                  value={selected.delta_temperature}
                  max={display.delta_temperature?.max}
                  unit={display.delta_temperature?.unit || ""}
                  color="#4B5563"
                />
                <Bar
                  label={display.probability?.label || "—"}
                  value={selected.probability * 100}
                  max={display.probability?.max}
                  unit={display.probability?.unit || ""}
                  color={statusMeta(selected.status).color}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Led tone="offline" />
              <p className="text-base font-semibold text-muted">
                {selected ? "Configuration indisponible" : "Aucune donnée machine"}
              </p>
              <p className="text-sm text-muted">
                {selected
                  ? "Les jauges nécessitent les plages fournies par le backend."
                  : "Les jauges apparaîtront à la première mesure."}
              </p>
            </div>
          )}
        </Panel>

        <Panel
          className="col-span-12"
          title="Journal des alarmes"
          subtitle="Événements de surveillance, pannes prévues et retours à la normale"
          actions={
            <Link to="/alarmes" className="btn btn-ghost">
              Tout voir
            </Link>
          }
          flush
          bodyClassName="max-h-[320px] overflow-y-auto"
        >
          <AlarmJournal alarms={live.alarms} limit={12} dense />
        </Panel>
      </div>

      <p className="pb-2 text-sm text-muted">
        Seuil 0,5 ; choix du modèle descriptif sur le test (F1). Les alarmes sont journalisées en
        SQLite et le flux est diffusé en temps réel.
      </p>
    </div>
  );
}

function Bar({ label, value, max, unit, color }) {
  const width = Math.max(0, Math.min(100, (Number(value || 0) / max) * 100));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted">{label}</span>
        <span className="num text-base font-semibold text-ink">
          {Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} {unit}
        </span>
      </div>
      <div className="probability-track">
        <div className="probability-fill" style={{ width: `${width}%`, background: color }} />
      </div>
    </div>
  );
}
