export function cls(...values) {
  return values.filter(Boolean).join(" ");
}

export function pct(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return `${(Number(value) * 100).toFixed(digits)} %`;
}

export function ratio(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

export function fmtNum(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtInt(value) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("fr-FR");
}

export function fmtTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("fr-FR", { hour12: false });
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function timeAgo(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 5) return "à l'instant";
  if (seconds < 60) return `il y a ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  return fmtTime(iso);
}

export const STATUS_META = {
  NORMAL: {
    label: "Normal",
    color: "#22C55E",
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
    bar: "bg-normal",
  },
  SURVEILLANCE: {
    label: "Surveillance",
    color: "#F59E0B",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    bar: "bg-watch",
  },
  PANNE_PREVUE: {
    label: "Panne prévue",
    color: "#E41937",
    bg: "bg-brand-50",
    text: "text-brand-700",
    border: "border-brand-200",
    bar: "bg-brand",
  },
};

export const SEVERITY_META = {
  INFO: {
    label: "Info",
    color: "#6B7280",
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-200",
  },
  SURVEILLANCE: {
    label: "Surveillance",
    color: "#F59E0B",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
  },
  PANNE_PREVUE: {
    label: "Panne prévue",
    color: "#E41937",
    bg: "bg-brand-50",
    text: "text-brand-700",
    border: "border-brand-200",
  },
};

// Libellés et seuils métier fournis par /api/config : le front ne les invente pas.
const runtime = {
  statusLabels: {},
  severityLabels: {},
  warning: null,
  alarm: null,
};

export function applyRuntimeConfig(config) {
  if (!config) return;
  runtime.statusLabels = Object.fromEntries(
    (config.statuses || []).map((item) => [item.value, item.label])
  );
  runtime.severityLabels = Object.fromEntries(
    (config.severities || []).map((item) => [item.value, item.label])
  );
  runtime.warning = config.thresholds?.warning ?? null;
  runtime.alarm = config.thresholds?.alarm ?? null;
}

function humanize(value = "") {
  return String(value).replaceAll("_", " ");
}

export function statusMeta(status) {
  const meta = STATUS_META[status] || STATUS_META.NORMAL;
  return { ...meta, label: runtime.statusLabels[status] || humanize(status) || meta.label };
}

export function severityMeta(severity) {
  const meta = SEVERITY_META[severity] || SEVERITY_META.INFO;
  return { ...meta, label: runtime.severityLabels[severity] || humanize(severity) || meta.label };
}

export function shortModel(name = "") {
  return name;
}

export function modelSlug(name = "") {
  return name.toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

export function probabilityTone(probability) {
  const value = Number(probability || 0);
  if (runtime.alarm != null && value >= runtime.alarm) return statusMeta("PANNE_PREVUE");
  if (runtime.warning != null && value >= runtime.warning) return statusMeta("SURVEILLANCE");
  return statusMeta("NORMAL");
}
