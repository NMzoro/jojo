import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

const MAX_SERIES = 60;
const MAX_ALARMS = 150;
const MAX_MANUAL = 20;

function readSoundPreference() {
  try {
    return localStorage.getItem("predictmaint.sound") !== "off";
  } catch {
    return true;
  }
}

function websocketUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/live`;
}

export function useLiveStream() {
  const [machines, setMachines] = useState([]);
  const [series, setSeries] = useState([]);
  const [alarms, setAlarms] = useState([]);
  const [simulator, setSimulator] = useState({
    paused: null,
    interval: null,
    running: null,
    clients: null,
  });
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const [lastMessageAt, setLastMessageAt] = useState(null);
  const [latency, setLatency] = useState(null);
  const [apiHealth, setApiHealth] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [manualPredictions, setManualPredictions] = useState([]);
  const [soundOn, setSoundOn] = useState(readSoundPreference);

  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;
  const simulatorRef = useRef(simulator);
  simulatorRef.current = simulator;
  const toastSeq = useRef(0);
  const handleRef = useRef(null);
  const connectRef = useRef(null);
  const retryRef = useRef(0);
  const stoppedRef = useRef(false);
  const wsRef = useRef(null);
  const sseRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast) => {
      const id = ++toastSeq.current;
      setToasts((current) => [...current.slice(-3), { id, ...toast }]);
      window.setTimeout(() => dismissToast(id), 6500);
    },
    [dismissToast]
  );

  const playBeep = useCallback(() => {
    if (!soundRef.current) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);
      oscillator.frequency.setValueAtTime(660, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.45);
      window.setTimeout(() => ctx.close(), 700);
    } catch {
      /* audio non disponible */
    }
  }, []);

  const toggleSound = useCallback(() => {
    setSoundOn((current) => {
      const next = !current;
      try {
        localStorage.setItem("predictmaint.sound", next ? "on" : "off");
      } catch {
        /* stockage indisponible */
      }
      if (next) {
        soundRef.current = true;
        playBeep();
      }
      return next;
    });
  }, [playBeep]);

  const handleMessage = useCallback(
    (message) => {
      if (!message || typeof message !== "object") return;
      setLastMessageAt(Date.now());
      switch (message.type) {
        case "snapshot": {
          setMachines(message.machines || []);
          setSimulator((current) => ({
            ...current,
            ...(message.simulator || {}),
            last_latency_ms: message.simulator?.last_latency_ms,
          }));
          setLatency(message.simulator?.last_latency_ms ?? null);
          setAlarms((current) => {
            const merged = new Map();
            [...(message.alarms || []), ...current].forEach((alarm) => {
              if (!merged.has(alarm.id)) merged.set(alarm.id, alarm);
            });
            return [...merged.values()]
              .sort((a, b) => b.id - a.id)
              .slice(0, MAX_ALARMS);
          });
          break;
        }
        case "machine": {
          const incoming = message.machine;
          if (!incoming) break;
          setMachines((current) => {
            const index = current.findIndex(
              (machine) => machine.machine_id === incoming.machine_id
            );
            if (index === -1) return [...current, incoming];
            const next = current.slice();
            next[index] = { ...next[index], ...incoming };
            return next;
          });
          break;
        }
        case "tick": {
          setLatency(message.latency_ms ?? null);
          setSimulator((current) => ({
            ...current,
            paused: Boolean(message.paused),
            interval: message.interval ?? current.interval,
            last_tick: message.timestamp,
            online: message.online ?? current.online,
            machine_count: message.machine_count ?? current.machine_count,
            alarm_count: message.alarm_count ?? current.alarm_count,
            watch_count: message.watch_count ?? current.watch_count,
            failure_rate: message.failure_rate ?? current.failure_rate,
            model_recall: message.model_recall ?? current.model_recall,
            max_probability: message.max_probability ?? current.max_probability,
            avg_probability: message.avg_probability ?? current.avg_probability,
            last_latency_ms: message.latency_ms,
          }));
          setSeries((current) =>
            [
              ...current,
              {
                t: Date.now(),
                timestamp: message.timestamp,
                max: message.max_probability,
                avg: message.avg_probability,
              },
            ].slice(-MAX_SERIES)
          );
          break;
        }
        case "alarm": {
          const alarm = message.alarm;
          if (!alarm) break;
          setAlarms((current) =>
            current.some((item) => item.id === alarm.id)
              ? current
              : [alarm, ...current].slice(0, MAX_ALARMS)
          );
          const isAlarm = alarm.severity === "PANNE_PREVUE";
          pushToast({
            tone: isAlarm
              ? "alarm"
              : alarm.severity === "SURVEILLANCE"
                ? "watch"
                : "info",
            title: isAlarm
              ? "Panne prévue"
              : alarm.severity === "SURVEILLANCE"
                ? "Surveillance"
                : "Retour à la normale",
            message: `${alarm.machine_id} — ${alarm.event}`,
            meta: `${Math.round((alarm.probability || 0) * 100)} %`,
          });
          if (isAlarm) playBeep();
          break;
        }
        case "manual_prediction": {
          setManualPredictions((current) => [message, ...current].slice(0, MAX_MANUAL));
          break;
        }
        case "control": {
          setSimulator((current) => ({
            ...current,
            ...(message.simulator || {}),
            paused: message.paused,
            interval: message.interval,
          }));
          break;
        }
        case "injection": {
          pushToast({
            tone: "info",
            title: "Scénario injecté",
            message: message.message,
          });
          break;
        }
        default:
          break;
      }
    },
    [playBeep, pushToast]
  );

  handleRef.current = handleMessage;

  useEffect(() => {
    stoppedRef.current = false;

    const cleanupWs = () => {
      const socket = wsRef.current;
      wsRef.current = null;
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      }
    };

    const cleanupSse = () => {
      const source = sseRef.current;
      sseRef.current = null;
      if (source) {
        source.onopen = null;
        source.onmessage = null;
        source.onerror = null;
        try {
          source.close();
        } catch {
          /* ignore */
        }
      }
    };

    const startSse = () => {
      cleanupWs();
      cleanupSse();
      setConnection("offline");
      try {
        const source = new EventSource("/api/stream");
        sseRef.current = source;
        source.onopen = () => {
          if (stoppedRef.current) return;
          retryRef.current = 0;
          setConnection("sse");
        };
        source.onmessage = (event) => {
          try {
            handleRef.current?.(JSON.parse(event.data));
          } catch {
            /* message invalide */
          }
        };
        source.onerror = () => {
          cleanupSse();
          if (stoppedRef.current) return;
          setConnection("offline");
          window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = window.setTimeout(() => {
            retryRef.current = 0;
            connectRef.current?.();
          }, 10000);
        };
      } catch {
        setConnection("offline");
      }
    };

    const scheduleReconnect = () => {
      if (stoppedRef.current) return;
      retryRef.current += 1;
      if (retryRef.current > 4) {
        startSse();
        return;
      }
      setConnection("reconnecting");
      const delay = Math.min(15000, 700 * 2 ** retryRef.current);
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(() => {
        connectRef.current?.();
      }, delay);
    };

    const connect = () => {
      if (stoppedRef.current) return;
      cleanupWs();
      cleanupSse();
      setConnection((current) =>
        current === "live" || current === "connecting" ? current : "reconnecting"
      );
      let socket;
      try {
        socket = new WebSocket(websocketUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = socket;
      socket.onopen = () => {
        if (stoppedRef.current) return;
        retryRef.current = 0;
        setConnection("live");
      };
      socket.onmessage = (event) => {
        try {
          handleRef.current?.(JSON.parse(event.data));
        } catch {
          /* message invalide */
        }
      };
      socket.onerror = () => {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      };
      socket.onclose = () => {
        if (wsRef.current === socket) wsRef.current = null;
        scheduleReconnect();
      };
    };

    connectRef.current = connect;
    connect();

    let bootstrapStopped = false;
    const bootstrap = async () => {
      try {
        const [configPayload, machinesPayload] = await Promise.all([
          api.config(),
          api.machines(),
        ]);
        if (bootstrapStopped) return;
        setConfig(configPayload);
        setConfigError(null);
        if (Array.isArray(machinesPayload?.machines) && machinesPayload.machines.length) {
          setMachines(machinesPayload.machines);
        }
        if (machinesPayload?.simulator) {
          setSimulator((current) => ({ ...current, ...machinesPayload.simulator }));
        }
      } catch (exc) {
        if (!bootstrapStopped) {
          setConfigError(exc instanceof Error ? exc : new Error(String(exc)));
        }
      }
    };
    bootstrap();

    let healthStopped = false;
    const pollHealth = async () => {
      try {
        const payload = await api.health();
        if (healthStopped) return;
        setApiHealth(payload);
        if (payload.simulator) {
          setSimulator((current) => ({
            ...current,
            ...payload.simulator,
            last_latency_ms: payload.simulator.last_latency_ms,
          }));
        }
      } catch {
        if (!healthStopped) setApiHealth({ status: "down" });
      }
    };
    pollHealth();
    const healthTimer = window.setInterval(pollHealth, 5000);

    return () => {
      healthStopped = true;
      bootstrapStopped = true;
      stoppedRef.current = true;
      cleanupWs();
      cleanupSse();
      window.clearTimeout(reconnectTimerRef.current);
      window.clearInterval(healthTimer);
    };
  }, []);

  const reconnect = useCallback(() => {
    retryRef.current = 0;
    connectRef.current?.();
  }, []);

  const setPaused = useCallback(
    async (paused) => {
      try {
        const status = await api.control({ paused });
        setSimulator((current) => ({ ...current, ...status }));
        pushToast({
          tone: "info",
          title: paused ? "Flux en pause" : "Flux repris",
          message: paused
            ? "Le simulateur est suspendu."
            : `Les mesures reprennent toutes les ${status.interval ?? ""} s.`,
        });
      } catch (exc) {
        pushToast({ tone: "alarm", title: "Action impossible", message: exc.message });
      }
    },
    [pushToast]
  );

  const setIntervalSeconds = useCallback(
    async (interval) => {
      try {
        const status = await api.control({ interval });
        setSimulator((current) => ({ ...current, ...status }));
        pushToast({
          tone: "info",
          title: "Cadence modifiée",
          message: `Nouvelle période : ${interval} s.`,
        });
      } catch (exc) {
        pushToast({ tone: "alarm", title: "Action impossible", message: exc.message });
      }
    },
    [pushToast]
  );

  const injectFault = useCallback(
    async (machineId) => {
      try {
        const payload = await api.inject(machineId);
        pushToast({
          tone: "alarm",
          title: "Injection de panne",
          message: `${payload.machine_id} — ${payload.message}`,
        });
        return payload;
      } catch (exc) {
        pushToast({ tone: "alarm", title: "Injection impossible", message: exc.message });
        return null;
      }
    },
    [pushToast]
  );

  const activeAlarms =
    simulator.alarm_count ??
    (machines.length ? machines.filter((m) => m.status === "PANNE_PREVUE").length : null);
  const watchCount =
    simulator.watch_count ??
    (machines.length ? machines.filter((m) => m.status === "SURVEILLANCE").length : null);
  const machineCount = simulator.machine_count ?? (machines.length || null);
  const failureRate =
    simulator.failure_rate ??
    (machineCount && activeAlarms != null ? activeAlarms / machineCount : null);
  const kpis = {
    online: simulator.online ?? machineCount,
    machine_count: machineCount,
    alarm_count: activeAlarms,
    watch_count: watchCount,
    failure_rate: failureRate,
    model_recall: simulator.model_recall ?? null,
    max_probability: simulator.max_probability ?? null,
    avg_probability: simulator.avg_probability ?? null,
    last_latency_ms: simulator.last_latency_ms ?? null,
  };

  return {
    machines,
    series,
    alarms,
    simulator,
    config,
    configError,
    kpis,
    connection,
    lastMessageAt,
    latency,
    apiHealth,
    toasts,
    dismissToast,
    manualPredictions,
    soundOn,
    toggleSound,
    setPaused,
    setIntervalSeconds,
    injectFault,
    activeAlarms,
    watchCount,
    failureRate,
    reconnect,
  };
}
