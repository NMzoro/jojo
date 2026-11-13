import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useLive } from "../context/LiveContext";
import { useClock } from "../hooks/useClock";
import { cls, fmtTime, applyRuntimeConfig } from "../lib/format";
import {
  IconActivity,
  IconBell,
  IconChart,
  IconCpu,
  IconFile,
  IconGrid,
  IconSettings,
  IconUser,
  IconWifi,
  IconWifiOff,
  IconClose,
} from "./Icons";
import { Led } from "./Led";

const NAV_MAIN = [
  { to: "/", label: "Supervision", icon: IconGrid, end: true },
  { to: "/machines", label: "Machines", icon: IconCpu },
  { to: "/prediction", label: "Prédiction", icon: IconActivity },
  { to: "/modeles", label: "Modèles & métriques", icon: IconChart },
  { to: "/alarmes", label: "Alarmes", icon: IconBell, badge: true },
  { to: "/rapports", label: "Rapports", icon: IconFile },
];

const NAV_SYSTEM = [{ to: "/parametres", label: "Paramètres", icon: IconSettings }];

const TITLES = {
  "/": "Supervision en temps réel",
  "/machines": "Parc machines",
  "/prediction": "Prédiction unitaire & par lot",
  "/modeles": "Modèles & métriques",
  "/alarmes": "Journal des alarmes",
  "/rapports": "Rapports & exports",
  "/parametres": "Paramètres du système",
};

function SidebarLink({ item, onNavigate, count }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) => cls("nav-item", isActive && "active")}
    >
      <Icon size={22} className="shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && count > 0 && (
        <span className="num rounded-sm bg-brand px-2 py-0.5 text-sm font-bold text-white">
          {count}
        </span>
      )}
    </NavLink>
  );
}

function SidebarContent({ activeAlarms, model, threshold, version, onNavigate }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto px-3 py-5">
      <p className="px-3 pb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
        Supervision
      </p>
      <nav className="space-y-1">
        {NAV_MAIN.map((item) => (
          <SidebarLink key={item.to} item={item} onNavigate={onNavigate} count={activeAlarms} />
        ))}
      </nav>

      <p className="mt-6 px-3 pb-2 text-sm font-bold uppercase tracking-wide text-gray-500">
        Système
      </p>
      <nav className="space-y-1">
        {NAV_SYSTEM.map((item) => (
          <SidebarLink key={item.to} item={item} onNavigate={onNavigate} count={0} />
        ))}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <div className="rounded-sm border border-line bg-white p-4">
          <div className="flex items-center gap-2">
            <Led tone={model ? "normal" : "offline"} />
            <span className="text-sm font-bold uppercase tracking-wide text-muted">
              Modèle actif
            </span>
          </div>
          <p className="mt-2 text-base font-bold text-ink">{model || "Aucune donnée"}</p>
          <p className="num mt-1 text-sm text-muted">
            {threshold != null ? `Seuil ${String(threshold).replace(".", ",")}` : "Seuil —"}
          </p>
        </div>
        <p className="px-1 text-sm leading-relaxed text-muted">
          Seuil 0,5 ; choix du modèle descriptif sur le test (F1).
        </p>
        <p className="num px-1 pb-1 text-sm text-gray-500">
          NEXTEER · PredictMaint{version ? ` v${version}` : ""}
        </p>
      </div>
    </div>
  );
}

export function Layout() {
  const live = useLive();
  const now = useClock(1000);
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    applyRuntimeConfig(live.config);
  }, [live.config]);

  const pageTitle = TITLES[location.pathname] || "PredictMaint";
  const age = live.lastMessageAt ? now.getTime() - live.lastMessageAt : null;
  const receiving = age != null && age < 6000;
  const paused = live.simulator?.paused;

  const apiConnected = live.apiHealth?.status === "ok";
  const liveActive =
    (live.connection === "live" || live.connection === "sse") && receiving && !paused;
  const interval = live.simulator?.interval;

  const model = live.config?.model?.name || live.apiHealth?.model || "";
  const threshold = live.config?.model?.threshold ?? live.config?.thresholds?.alarm;
  const version = live.apiHealth?.version;

  return (
    <div className="min-h-screen bg-white">
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center gap-4 border-b border-line bg-white px-3 sm:px-5">
        <button
          type="button"
          className="btn btn-icon btn-ghost lg:hidden"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label="Menu"
        >
          <span className="space-y-1.5">
            <span className="block h-0.5 w-5 bg-ink" />
            <span className="block h-0.5 w-5 bg-ink" />
            <span className="block h-0.5 w-5 bg-ink" />
          </span>
        </button>

        <div className="flex min-w-0 items-center gap-3">
          <img src="/assets/nexteer-logo.png" alt="Nexteer" className="h-10 w-auto shrink-0" />
          <div className="hidden h-10 w-px bg-line sm:block" />
          <div className="hidden min-w-0 sm:block">
            <p className="text-base font-extrabold leading-none tracking-tight text-ink">
              PREDICTMAINT
            </p>
            <p className="mt-1 text-sm font-semibold uppercase tracking-wide text-muted">
              Maintenance prédictive
            </p>
          </div>
        </div>

        <div className="ml-2 hidden min-w-0 border-l border-line pl-4 xl:block">
          <p className="truncate text-base font-bold text-body">{pageTitle}</p>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span
            className={cls(
              "inline-flex h-9 items-center gap-2 rounded-sm border px-3 text-sm font-bold uppercase tracking-wide",
              apiConnected
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-brand-200 bg-brand-50 text-brand"
            )}
            title={
              live.lastMessageAt
                ? `Dernier message : ${fmtTime(new Date(live.lastMessageAt).toISOString())}`
                : "Aucune donnée reçue"
            }
          >
            {apiConnected ? <IconWifi size={16} /> : <IconWifiOff size={16} />}
            {apiConnected ? "Connecté" : "Hors ligne"}
          </span>

          <span
            className={cls(
              "inline-flex h-9 items-center gap-2 rounded-sm border px-3 text-sm font-bold uppercase tracking-wide",
              liveActive
                ? "border-brand-200 bg-brand-50 text-brand"
                : "border-amber-200 bg-amber-50 text-amber-700"
            )}
          >
            <span
              className={cls(
                "led h-2.5 w-2.5",
                liveActive ? "animate-blink bg-brand" : "bg-watch"
              )}
            />
            {paused ? "LIVE · PAUSE" : interval ? `LIVE · ${interval} s` : "LIVE"}
          </span>

          <div className="hidden border-l border-line pl-3 text-right sm:block">
            <div className="num text-base font-semibold leading-none text-ink">
              {now.toLocaleTimeString("fr-FR", { hour12: false })}
            </div>
            <div className="mt-1 text-sm uppercase tracking-wide text-muted">
              {now.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
            </div>
          </div>

          <div className="hidden items-center gap-2 border-l border-line pl-3 md:flex">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-white">
              <IconUser size={18} />
            </span>
            <div className="hidden leading-tight xl:block">
              <div className="text-sm font-bold text-ink">
                {live.config?.line?.operator || "—"}
              </div>
              <div className="text-sm text-muted">
                {live.config?.line?.name || "—"}
              </div>
            </div>
          </div>
        </div>
        <span className="topbar-accent" />
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-ink/30 lg:hidden" onClick={() => setMobileOpen(false)}>
          <aside
            className="absolute bottom-0 left-0 top-16 w-64 border-r border-line bg-shell shadow-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-3 top-3 text-gray-400 hover:text-ink"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
            >
              <IconClose size={20} />
            </button>
            <SidebarContent
              activeAlarms={live.activeAlarms}
              model={model}
              threshold={threshold}
              version={version}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <aside className="fixed bottom-0 left-0 top-16 z-30 hidden w-64 border-r border-line bg-shell lg:block">
        <SidebarContent
          activeAlarms={live.activeAlarms}
          model={model}
          threshold={threshold}
          version={version}
        />
      </aside>

      <main className="pt-16 lg:pl-64">
        <div className="mx-auto max-w-[1900px] p-4 sm:p-5 xl:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
