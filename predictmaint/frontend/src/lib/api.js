const API_ROOT = "";

async function request(path, { method = "GET", body, signal } = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!response.ok) {
    let detail = `Erreur HTTP ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.detail) {
        detail = Array.isArray(payload.detail)
          ? payload.detail
              .map((item) => item.msg || JSON.stringify(item))
              .join(" · ")
          : String(payload.detail);
      }
    } catch {
      /* réponse non JSON */
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  health: () => request("/api/health"),
  systemInfo: () => request("/api/system/info"),
  config: () => request("/api/config"),
  reports: () => request("/api/reports"),
  predict: (payload) => request("/api/predict", { method: "POST", body: payload }),
  predictBatch: (machines) =>
    request("/api/predict/batch", { method: "POST", body: { machines } }),
  comparison: () => request("/api/models/comparison"),
  metrics: () => request("/api/models/metrics"),
  confusion: (model) => request(`/api/models/confusion/${model}`),
  importance: () => request("/api/models/importance"),
  roc: () => request("/api/models/roc"),
  pr: () => request("/api/models/pr"),
  bilan: () => request("/api/models/bilan"),
  machines: () => request("/api/machines"),
  history: (machineId, limit = 120) =>
    request(`/api/machines/${encodeURIComponent(machineId)}/history?limit=${limit}`),
  alarms: (params = {}) => {
    const query = new URLSearchParams();
    if (params.limit) query.set("limit", params.limit);
    if (params.severity) query.set("severity", params.severity);
    if (params.machine_id) query.set("machine_id", params.machine_id);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return request(`/api/alarms${suffix}`);
  },
  simulatorStatus: () => request("/api/simulator/status"),
  control: (payload) =>
    request("/api/simulator/control", { method: "POST", body: payload }),
  inject: (machineId) =>
    request(`/api/simulator/inject/${encodeURIComponent(machineId)}`, { method: "POST" }),
};

export function wsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/live`;
}

export const FILES_BASE = "/files";
export const REPORTS_ZIP = "/api/reports/zip";
