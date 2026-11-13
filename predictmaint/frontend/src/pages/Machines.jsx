import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import { downloadCSV } from "../lib/csv";
import { useLive } from "../context/LiveContext";
import { useApiData } from "../hooks/useApiData";
import { cls, fmtTime, pct, ratio, statusMeta } from "../lib/format";
import { IconClose, IconDownload, IconHistory, IconSearch, IconZap } from "../components/Icons";
import { Led } from "../components/Led";
import { ErrorPanel, Spinner } from "../components/Loading";
import { Panel } from "../components/Panel";
import { StatusBadge } from "../components/StatusBadge";

const PAGE_SIZE = 8;

export default function Machines() {
  const live = useLive();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [sort, setSort] = useState("probability");
  const [detailId, setDetailId] = useState(null);
  const [page, setPage] = useState(1);

  const machines = live.machines;
  const config = live.config;

  const counts = useMemo(() => {
    const result = { ALL: machines.length };
    (config?.statuses || []).forEach((item) => {
      result[item.value] = machines.filter((machine) => machine.status === item.value).length;
    });
    return result;
  }, [machines, config]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = machines.filter((machine) => {
      if (status !== "ALL" && machine.status !== status) return false;
      if (type !== "ALL" && machine.type !== type) return false;
      if (term && !machine.machine_id.toLowerCase().includes(term)) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "probability") return b.probability - a.probability;
      if (sort === "probability_asc") return a.probability - b.probability;
      if (sort === "wear") return b.tool_wear - a.tool_wear;
      return a.machine_id.localeCompare(b.machine_id);
    });
  }, [machines, search, status, type, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, status, type, sort]);

  const detailMachine = machines.find((machine) => machine.machine_id === detailId) || null;

  const exportCsv = () => {
    downloadCSV("predictmaint_machines.csv", filtered, [
      { key: "machine_id", label: "Machine" },
      { key: "type", label: "Type" },
      { key: "status", label: "Statut" },
      { key: "probability", label: "Probabilité" },
      { key: "air_temperature", label: "Température air (K)" },
      { key: "process_temperature", label: "Température procédé (K)" },
      { key: "delta_temperature", label: "Delta T (K)" },
      { key: "rotational_speed", label: "Vitesse (tr/min)" },
      { key: "torque", label: "Couple (Nm)" },
      { key: "tool_wear", label: "Usure (min)" },
      { key: "timestamp", label: "Dernière mesure" },
    ]);
  };

  const statusCards = [
    { key: "ALL", label: "Parc total", color: "#111827" },
    ...(config?.statuses || []).map((item) => ({
      key: item.value,
      label: item.label,
      color: statusMeta(item.value).color,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Parc machines</h1>
          <p className="mt-1.5 text-base text-muted">
            État temps réel, historique des probabilités et injection de scénarios.
          </p>
        </div>
        <button type="button" className="btn" onClick={exportCsv}>
          <IconDownload size={18} /> Exporter CSV
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statusCards.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setStatus(item.key)}
            className={cls(
              "panel flex items-center justify-between px-4 py-3.5 text-left transition-colors",
              status === item.key ? "border-brand/40 bg-brand-50/40" : "hover:bg-head/50"
            )}
          >
            <span className="flex items-center gap-2.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: item.color }}
              />
              <span className="text-base font-semibold text-body">{item.label}</span>
            </span>
            <span className="num text-2xl font-semibold text-ink">{counts[item.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <Panel
        title={`Machines instrumentées (${filtered.length})`}
        subtitle="Cliquez sur une ligne pour ouvrir l'historique détaillé."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <IconSearch
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                className="input w-[220px] pl-9"
                placeholder="Rechercher une machine…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select className="select w-[130px]" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="ALL">Tous types</option>
              {(config?.types || []).map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select className="select w-[190px]" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="probability">Risque décroissant</option>
              <option value="probability_asc">Risque croissant</option>
              <option value="wear">Usure décroissante</option>
              <option value="id">Identifiant</option>
            </select>
          </div>
        }
        flush
      >
        <div className="max-h-[calc(100vh-380px)] overflow-auto">
          <table className="hmi-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th>Type</th>
                <th>Statut</th>
                <th>Probabilité</th>
                <th>Temp. air</th>
                <th>Temp. procédé</th>
                <th>ΔT</th>
                <th>Vitesse</th>
                <th>Couple</th>
                <th>Usure</th>
                <th>Dernière mesure</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((machine) => {
                const meta = statusMeta(machine.status);
                return (
                  <tr
                    key={machine.machine_id}
                    className="cursor-pointer"
                    onClick={() => setDetailId(machine.machine_id)}
                  >
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Led
                          tone={
                            machine.status === "PANNE_PREVUE"
                              ? "alarm"
                              : machine.status === "SURVEILLANCE"
                                ? "watch"
                                : "normal"
                          }
                          pulse={machine.status === "PANNE_PREVUE"}
                        />
                        <span className="num text-base font-bold text-ink">{machine.machine_id}</span>
                      </div>
                    </td>
                    <td>
                      <span className="badge border-line bg-head text-muted">{machine.type}</span>
                    </td>
                    <td>
                      <StatusBadge status={machine.status} />
                    </td>
                    <td className="min-w-[170px]">
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <div className="h-3 w-20 shrink-0 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className="probability-fill"
                            style={{ width: `${machine.probability * 100}%`, background: meta.color }}
                          />
                        </div>
                        <span className="num text-base font-semibold text-ink">
                          {pct(machine.probability, 1)}
                        </span>
                      </div>
                    </td>
                    <td className="num">{Number(machine.air_temperature).toFixed(1)} K</td>
                    <td className="num">{Number(machine.process_temperature).toFixed(1)} K</td>
                    <td className="num">{Number(machine.delta_temperature).toFixed(1)} K</td>
                    <td className="num">
                      {Number(machine.rotational_speed).toLocaleString("fr-FR")} tr/min
                    </td>
                    <td className="num">{Number(machine.torque).toFixed(1)} Nm</td>
                    <td className="num">{Number(machine.tool_wear).toFixed(0)} min</td>
                    <td className="num text-sm text-muted">{fmtTime(machine.timestamp)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          className="btn btn-icon"
                          title="Historique"
                          aria-label={`Historique ${machine.machine_id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetailId(machine.machine_id);
                          }}
                        >
                          <IconHistory size={18} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon btn-danger"
                          title="Injecter une panne"
                          aria-label={`Injecter une panne sur ${machine.machine_id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            live.injectFault(machine.machine_id);
                          }}
                        >
                          <IconZap size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!pageRows.length && (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-base text-muted">
                    {machines.length
                      ? "Aucune machine ne correspond aux filtres."
                      : "Aucune donnée machine reçue pour le moment."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <span className="text-sm text-muted">
            {filtered.length
              ? `${(safePage - 1) * PAGE_SIZE + 1}–${Math.min(
                  safePage * PAGE_SIZE,
                  filtered.length
                )} sur ${filtered.length}`
              : "Aucune ligne"}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              disabled={safePage <= 1}
            >
              Précédent
            </button>
            <span className="num text-base font-semibold text-ink">
              {safePage} / {pageCount}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              disabled={safePage >= pageCount}
            >
              Suivant
            </button>
          </div>
        </div>
      </Panel>

      {detailMachine && (
        <MachineDrawer
          machine={detailMachine}
          onClose={() => setDetailId(null)}
          onInject={() => live.injectFault(detailMachine.machine_id)}
        />
      )}
    </div>
  );
}

function MachineDrawer({ machine, onClose, onInject }) {
  const live = useLive();
  const config = live.config;
  const { data, loading, error, reload } = useApiData(
    () => api.history(machine.machine_id, 120),
    [machine.machine_id]
  );

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const points = data?.points || [];
  const meta = statusMeta(machine.status);
  const threshold = config?.thresholds?.alarm;
  const warning = config?.thresholds?.warning;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/35" onClick={onClose}>
      <aside
        className="h-full w-full max-w-[640px] overflow-y-auto border-l border-line bg-white shadow-toast animate-toast-in"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b-2 border-brand bg-head px-5 py-4">
          <div>
            <p className="num text-base font-bold text-ink">{machine.machine_id}</p>
            <p className="mt-1 text-sm uppercase tracking-wide text-muted">
              Type {machine.type} · historique des mesures
            </p>
          </div>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Fermer">
            <IconClose size={18} />
          </button>
        </header>

        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusBadge status={machine.status} />
            <span className="num text-sm text-muted">MAJ {fmtTime(machine.timestamp)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Probabilité", pct(machine.probability, 1)],
              [config?.display?.torque?.label || "Couple", `${Number(machine.torque).toFixed(1)} Nm`],
              [
                config?.display?.rotational_speed?.label || "Vitesse",
                `${Number(machine.rotational_speed).toLocaleString("fr-FR")} tr/min`,
              ],
              [
                config?.display?.tool_wear?.label || "Usure",
                `${Number(machine.tool_wear).toFixed(0)} min`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-sm border border-line bg-head/50 px-3 py-2.5">
                <div className="text-sm font-bold uppercase tracking-wide text-muted">{label}</div>
                <div className="num mt-1 text-base font-semibold text-ink">{value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-sm border border-line p-3">
            <div className="mb-2 flex items-center justify-between gap-3 px-1">
              <span className="text-sm font-bold uppercase tracking-wide text-muted">
                Probabilité de panne
              </span>
              <span className="num text-sm text-muted">
                seuil {threshold != null ? ratio(threshold, 2).replace(".", ",") : "—"}
              </span>
            </div>
            {loading ? (
              <div className="flex h-[300px] items-center justify-center">
                <Spinner size={24} />
              </div>
            ) : error ? (
              <ErrorPanel error={error} onRetry={reload} />
            ) : (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={points} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                    <CartesianGrid stroke="#F3F4F6" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(value) => fmtTime(value).slice(0, 5)}
                      tick={{
                        fontSize: 14,
                        fill: "#4B5563",
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      }}
                      tickLine={false}
                      axisLine={{ stroke: "#E5E7EB" }}
                      minTickGap={40}
                    />
                    <YAxis
                      domain={[0, 1]}
                      tick={{
                        fontSize: 14,
                        fill: "#4B5563",
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      }}
                      tickFormatter={(value) => `${Math.round(value * 100)}%`}
                      tickLine={false}
                      axisLine={false}
                      width={54}
                    />
                    <Tooltip
                      formatter={(value) => [pct(value, 1), "Probabilité"]}
                      labelFormatter={(value) => fmtTime(value)}
                      contentStyle={{
                        fontSize: 14,
                        borderColor: "#E5E7EB",
                        borderRadius: 2,
                        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
                      }}
                    />
                    {threshold != null && (
                      <ReferenceLine y={threshold} stroke="#E41937" strokeDasharray="5 4" />
                    )}
                    {warning != null && (
                      <ReferenceLine y={warning} stroke="#F59E0B" strokeDasharray="3 4" />
                    )}
                    <Line
                      type="monotone"
                      dataKey="probability"
                      stroke="#E41937"
                      strokeWidth={2.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-2 flex items-center justify-between gap-3 px-1 text-sm text-muted">
              <span className="num">{points.length} points d'historique</span>
              <button
                type="button"
                className="font-semibold text-brand hover:underline"
                onClick={reload}
              >
                Rafraîchir
              </button>
            </div>
          </div>

          <div className="rounded-sm border border-line p-4">
            <p className="text-sm font-bold uppercase tracking-wide text-muted">Mesures actuelles</p>
            <dl className="mt-3 grid grid-cols-1 gap-2 text-base sm:grid-cols-2">
              {[
                ["Température air", `${Number(machine.air_temperature).toFixed(1)} K`],
                ["Température procédé", `${Number(machine.process_temperature).toFixed(1)} K`],
                ["ΔT procédé", `${Number(machine.delta_temperature).toFixed(1)} K`],
                [
                  "Puissance estimée",
                  `${Number(machine.power_proxy).toLocaleString("fr-FR", {
                    maximumFractionDigits: 0,
                  })} W`,
                ],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-3 border-b border-line/70 pb-1.5"
                >
                  <dt className="text-muted">{label}</dt>
                  <dd className="num font-semibold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex gap-3">
            <button type="button" className="btn btn-danger flex-1" onClick={onInject}>
              <IconZap size={18} /> Injecter une panne
            </button>
            <button
              type="button"
              className="btn flex-1"
              onClick={() =>
                downloadCSV(`historique_${machine.machine_id}.csv`, points, [
                  { key: "timestamp", label: "Horodatage" },
                  { key: "probability", label: "Probabilité" },
                  { key: "status", label: "Statut" },
                  { key: "torque", label: "Couple (Nm)" },
                  { key: "rotational_speed", label: "Vitesse (tr/min)" },
                  { key: "tool_wear", label: "Usure (min)" },
                  { key: "delta_temperature", label: "Delta T (K)" },
                ])
              }
            >
              <IconDownload size={18} /> Exporter l'historique
            </button>
          </div>
          <p className="text-sm leading-relaxed text-muted">
            Seuil 0,5 ; choix du modèle descriptif sur le test (F1). L'historique est stocké en
            SQLite et limité aux 7 derniers jours.
          </p>
          <div className="h-2" />
        </div>
      </aside>
    </div>
  );
}
