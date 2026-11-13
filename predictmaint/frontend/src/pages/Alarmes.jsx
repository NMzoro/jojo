import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { downloadCSV } from "../lib/csv";
import { useLive } from "../context/LiveContext";
import { useApiData } from "../hooks/useApiData";
import { cls, fmtDateTime, fmtInt, pct, ratio, severityMeta } from "../lib/format";
import { IconBell, IconDownload, IconRefresh, IconSearch } from "../components/Icons";
import { Led } from "../components/Led";
import { ErrorPanel } from "../components/Loading";
import { Panel } from "../components/Panel";
import { SeverityBadge } from "../components/StatusBadge";

const PAGE_SIZE = 12;

export default function Alarmes() {
  const live = useLive();
  const { data, loading, error, reload } = useApiData(() => api.alarms({ limit: 500 }), []);
  const [severity, setSeverity] = useState("ALL");
  const [machineFilter, setMachineFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const config = live.config;
  const allAlarms = useMemo(() => {
    const merged = new Map();
    [...live.alarms, ...(data?.alarms || [])].forEach((alarm) => {
      if (!merged.has(alarm.id)) merged.set(alarm.id, alarm);
    });
    return [...merged.values()].sort((a, b) => b.id - a.id);
  }, [live.alarms, data]);

  const machineOptions = useMemo(() => {
    const ids = new Set(allAlarms.map((alarm) => alarm.machine_id));
    live.machines.forEach((machine) => ids.add(machine.machine_id));
    return [...ids].sort();
  }, [allAlarms, live.machines]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allAlarms.filter((alarm) => {
      if (severity !== "ALL" && alarm.severity !== severity) return false;
      if (machineFilter !== "ALL" && alarm.machine_id !== machineFilter) return false;
      if (
        term &&
        !alarm.event.toLowerCase().includes(term) &&
        !alarm.machine_id.toLowerCase().includes(term)
      ) {
        return false;
      }
      return true;
    });
  }, [allAlarms, severity, machineFilter, search]);

  const counts = useMemo(() => {
    const result = { total: allAlarms.length };
    (config?.severities || []).forEach((item) => {
      result[item.value] = allAlarms.filter((alarm) => alarm.severity === item.value).length;
    });
    return result;
  }, [allAlarms, config]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [severity, machineFilter, search]);

  const warning = config?.thresholds?.warning;
  const alarm = config?.thresholds?.alarm;

  const exportCsv = () => {
    downloadCSV("predictmaint_alarmes.csv", filtered, [
      { key: "id", label: "ID" },
      { key: "timestamp", label: "Horodatage" },
      { key: "machine_id", label: "Machine" },
      { key: "severity", label: "Sévérité" },
      { key: "event", label: "Événement" },
      { key: "probability", label: "Probabilité" },
    ]);
  };

  const summaryCards = [
    { key: "total", label: "Total journalisé", color: "#111827", icon: IconBell },
    ...(config?.severities || []).map((item) => ({
      key: item.value,
      label: item.label,
      color: severityMeta(item.value).color,
      icon: IconBell,
    })),
  ];

  const severityTabs = [{ value: "ALL", label: "Tout" }, ...(config?.severities || [])];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-ink">Journal des alarmes</h1>
          <p className="mt-1.5 text-base text-muted">
            Événements persistés en SQLite
            {warning != null && alarm != null
              ? ` · surveillance dès ${ratio(warning, 2).replace(".", ",")} · panne dès ${ratio(
                  alarm,
                  2
                ).replace(".", ",")}`
              : ""}
            .
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="btn" onClick={reload}>
            <IconRefresh size={18} /> Rafraîchir
          </button>
          <button type="button" className="btn btn-primary" onClick={exportCsv}>
            <IconDownload size={18} /> Exporter CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map(({ key, label, color, icon: Icon }) => (
          <div key={key} className="panel relative overflow-hidden p-4 pl-5">
            <span className="kpi-accent" style={{ background: color }} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-wide text-muted">{label}</p>
                <p className="num mt-2 text-4xl font-semibold leading-none text-ink">
                  {fmtInt(counts[key] ?? 0)}
                </p>
              </div>
              <span className="rounded-sm bg-head p-2.5 text-brand">
                <Icon size={20} />
              </span>
            </div>
          </div>
        ))}
      </div>

      <Panel
        title={`Événements (${filtered.length})`}
        subtitle="Nouvelle alarme insérée en tête du journal en temps réel."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center rounded-sm border border-line bg-white p-0.5">
              {severityTabs.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className={cls("tab-btn border-0", severity === item.value && "active")}
                  onClick={() => setSeverity(item.value)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <select
              className="select w-[180px]"
              value={machineFilter}
              onChange={(event) => setMachineFilter(event.target.value)}
            >
              <option value="ALL">Toutes machines</option>
              {machineOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <div className="relative">
              <IconSearch
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                className="input w-[240px] pl-9"
                placeholder="Rechercher un événement…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
        }
        flush
      >
        {error ? (
          <div className="p-4">
            <ErrorPanel error={error} onRetry={reload} />
          </div>
        ) : (
          <div className="max-h-[calc(100vh-390px)] overflow-auto">
            <table className="hmi-table">
              <thead>
                <tr>
                  <th>Horodatage</th>
                  <th>Machine</th>
                  <th>Sévérité</th>
                  <th>Événement</th>
                  <th>Probabilité</th>
                  <th>Voyant</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((item) => {
                  const meta = severityMeta(item.severity);
                  return (
                    <tr key={item.id}>
                      <td className="num text-sm text-muted">{fmtDateTime(item.timestamp)}</td>
                      <td className="num text-base font-semibold text-ink">{item.machine_id}</td>
                      <td>
                        <SeverityBadge severity={item.severity} />
                      </td>
                      <td className="text-base">{item.event}</td>
                      <td>
                        <div className="flex items-center gap-3 whitespace-nowrap">
                          <div className="h-3 w-20 shrink-0 overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="probability-fill"
                              style={{
                                width: `${Math.min(100, item.probability * 100)}%`,
                                background: meta.color,
                              }}
                            />
                          </div>
                          <span className="num text-base font-semibold text-ink">
                            {pct(item.probability, 0)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <Led
                          tone={
                            item.severity === "PANNE_PREVUE"
                              ? "alarm"
                              : item.severity === "SURVEILLANCE"
                                ? "watch"
                                : "normal"
                          }
                          pulse={item.severity === "PANNE_PREVUE"}
                        />
                      </td>
                    </tr>
                  );
                })}
                {!pageRows.length && (
                  <tr>
                    <td colSpan={6} className="py-14 text-center text-base text-muted">
                      {loading
                        ? "Chargement du journal…"
                        : allAlarms.length
                          ? "Aucune alarme ne correspond aux filtres."
                          : "Aucune alarme enregistrée pour le moment."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

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

      <p className="pb-2 text-sm text-muted">
        Seuil 0,5 ; choix du modèle descriptif sur le test (F1). Les alarmes sont créées sur
        transition d'état et conservées 30 jours.
      </p>
    </div>
  );
}
