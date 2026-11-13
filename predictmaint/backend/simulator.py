"""Simulateur de ligne de production et diffusion temps réel."""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from .db import Database
from .service import DATASET_PATH, ModelService, now_iso, status_for

logger = logging.getLogger("predictmaint.simulator")

MACHINES_FILE = Path(
    os.getenv("PREDICTMAINT_MACHINES_FILE", Path(__file__).with_name("machines.json"))
)

DEFAULT_MACHINES: list[dict[str, str]] = [
    {"machine_id": "M-L-14862", "type": "L"},
    {"machine_id": "M-L-14863", "type": "L"},
    {"machine_id": "M-M-14864", "type": "M"},
    {"machine_id": "M-M-14865", "type": "M"},
    {"machine_id": "M-H-14866", "type": "H"},
    {"machine_id": "M-L-14867", "type": "L"},
    {"machine_id": "M-M-14868", "type": "M"},
    {"machine_id": "M-H-14869", "type": "H"},
]

VALID_MACHINE_TYPES = {"L", "M", "H"}


def load_machine_catalog() -> list[dict[str, str]]:
    """Catalogue des machines côté backend (fichier JSON, sans toucher au front)."""
    path = Path(MACHINES_FILE)
    if not path.exists():
        return [dict(item) for item in DEFAULT_MACHINES]
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        items = payload.get("machines", []) if isinstance(payload, dict) else payload
        catalog = []
        seen: set[str] = set()
        for item in items:
            machine_id = str(item.get("machine_id", "")).strip()
            machine_type = str(item.get("type", "")).strip().upper()
            if not machine_id or machine_type not in VALID_MACHINE_TYPES:
                continue
            if machine_id in seen:
                continue
            seen.add(machine_id)
            catalog.append({"machine_id": machine_id, "type": machine_type})
        if catalog:
            logger.info("Catalogue machines chargé : %s (%d)", path, len(catalog))
            return catalog
        logger.warning("Catalogue machines vide ou invalide : %s", path)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Lecture du catalogue machines impossible (%s) : %s", path, exc)
    return [dict(item) for item in DEFAULT_MACHINES]

MODE_LABELS = {
    "TWF": "usure outil (TWF)",
    "HDF": "dissipation thermique (HDF)",
    "PWF": "puissance (PWF)",
    "OSF": "surcharge (OSF)",
    "RNF": "défaillance aléatoire (RNF)",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3 - 2 * value)


@dataclass
class MachineState:
    machine_id: str
    type: str
    wear: float = 0.0
    base_row: dict[str, Any] | None = None
    base_ticks: int = 0
    degradation: float = 0.0
    target: float = 1.0
    remaining: int = 0
    ramp_ticks: int = 20
    decaying: bool = False
    template: dict[str, Any] | None = None
    mode: str = "RNF"
    status: str = "NORMAL"
    candidate: str | None = None
    candidate_count: int = 0
    last_probability: float = 0.0
    last_payload: dict[str, Any] | None = None
    injected_until: datetime | None = None
    episode_started: datetime | None = None
    alarms: int = 0
    extra: dict[str, Any] = field(default_factory=dict)


class MaintenanceSimulator:
    """Génère des mesures, interroge le modèle et diffuse les résultats."""

    def __init__(self, db: Database, service: ModelService, interval: float = 2.0):
        self.db = db
        self.service = service
        self.interval = float(interval)
        self.paused = False
        self.running = False
        self.tick_count = 0
        self.last_tick: str | None = None
        self.last_latency_ms = 0.0
        self.subscribers: set[asyncio.Queue] = set()
        self._wake = asyncio.Event()
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None
        self.rng = np.random.default_rng(2026)
        self.model_recall: float | None = None
        try:
            recall = self.service.metrics().get("metrics", {}).get("recall")
            self.model_recall = float(recall) if recall is not None else None
        except Exception as exc:  # pragma: no cover - artefacts absents
            logger.warning("Rappel du modèle indisponible : %s", exc)
        self.machines: dict[str, MachineState] = {
            item["machine_id"]: MachineState(
                machine_id=item["machine_id"],
                type=item["type"],
                wear=float(self.rng.uniform(8, 130)),
            )
            for item in load_machine_catalog()
        }
        self.normal_by_type: dict[str, pd.DataFrame] = {}
        self.normal_all: pd.DataFrame | None = None
        self.risk_by_type: dict[str, pd.DataFrame] = {}
        self.risk_all: pd.DataFrame | None = None
        self._load_pools()
        self._prime_demo()

    # ------------------------------------------------------------------ data
    def _load_pools(self) -> None:
        path = Path(DATASET_PATH)
        if not path.exists():
            raise FileNotFoundError(f"Dataset du simulateur introuvable : {path}")
        df = pd.read_csv(path)
        df.columns = [str(c).strip() for c in df.columns]
        for column in [
            "Air temperature [K]",
            "Process temperature [K]",
            "Rotational speed [rpm]",
            "Torque [Nm]",
            "Tool wear [min]",
        ]:
            df[column] = pd.to_numeric(df[column], errors="coerce")
        df = df.dropna(subset=["Air temperature [K]", "Process temperature [K]"])
        normal = df[df["Machine failure"] == 0].copy()
        failure = df[df["Machine failure"] == 1].copy()
        self.normal_all = normal
        self.normal_by_type = {
            str(key): group for key, group in normal.groupby("Type")
        }
        logger.info("Pools : %d normales, %d défaillances", len(normal), len(failure))

        # Évalue les défaillances pour ne garder que des scénarios à haut risque :
        # l'injection de panne est ainsi réaliste (mesures réelles UCI) et fiable.
        readings = [
            {
                "type": str(row["Type"]),
                "air_temperature": float(row["Air temperature [K]"]),
                "process_temperature": float(row["Process temperature [K]"]),
                "rotational_speed": float(row["Rotational speed [rpm]"]),
                "torque": float(row["Torque [Nm]"]),
                "tool_wear": float(row["Tool wear [min]"]),
            }
            for _, row in failure.iterrows()
        ]
        risk_rows = failure.copy()
        if readings and self.service.model is not None:
            probabilities, _ = self.service.predict_readings(readings)
            risk_rows["_probability"] = probabilities
            high = risk_rows[risk_rows["_probability"] >= 0.75].copy()
            if len(high) >= 20:
                risk_rows = high
            logger.info(
                "Scénarios à haut risque : %d / %d (probabilité >= 0.75)",
                len(high),
                len(failure),
            )
        self.risk_all = risk_rows
        self.risk_by_type = {
            str(key): group for key, group in risk_rows.groupby("Type")
        }

    def _prime_demo(self) -> None:
        """Deux machines déjà en dégradation pour une démo immédiatement vivante."""
        ids = list(self.machines)
        if len(ids) >= 3:
            self._start_episode(self.machines[ids[2]], start=0.42, ramp=26)
        if len(ids) >= 6:
            self._start_episode(self.machines[ids[5]], start=0.66, ramp=18)

    def _start_episode(self, machine: MachineState, start: float = 0.05, ramp: int = 22) -> None:
        machine.degradation = max(machine.degradation, start)
        machine.target = 1.0
        machine.ramp_ticks = max(6, ramp)
        machine.remaining = ramp
        machine.decaying = False
        machine.episode_started = utc_now()
        machine.template = self._pick_template(machine.type)
        machine.mode = self._template_mode(machine.template)

    def _pick_template(self, machine_type: str) -> dict[str, Any] | None:
        pool = self.risk_by_type.get(machine_type)
        if pool is None or pool.empty:
            pool = self.risk_all
        if pool is None or pool.empty:
            return None
        # Pour l'injection : privilégie les scénarios les plus probables.
        top = pool.nlargest(min(8, len(pool)), "_probability") if "_probability" in pool else pool
        row = top.sample(1, random_state=int(self.rng.integers(0, 1_000_000))).iloc[0]
        return row.to_dict()

    @staticmethod
    def _template_mode(template: dict[str, Any] | None) -> str:
        if not template:
            return "RNF"
        for mode in ("TWF", "HDF", "PWF", "OSF", "RNF"):
            if int(template.get(mode, 0) or 0) == 1:
                return mode
        return "RNF"

    def _pick_base(self, machine: MachineState) -> dict[str, Any]:
        pool = self.normal_by_type.get(machine.type)
        if pool is None or pool.empty:
            pool = self.normal_all
        if pool is None or pool.empty:
            raise RuntimeError("Aucune donnée normale disponible pour le simulateur.")
        if machine.base_row is None or machine.base_ticks <= 0:
            stressed = pool[
                (pool["Tool wear [min]"] > 150) | (pool["Torque [Nm]"] > 55)
            ]
            source = stressed if len(stressed) > 20 and random.random() < 0.3 else pool
            machine.base_row = source.sample(
                1, random_state=int(self.rng.integers(0, 1_000_000))
            ).iloc[0].to_dict()
            machine.base_ticks = int(self.rng.integers(9, 22))
        machine.base_ticks -= 1
        return machine.base_row

    # -------------------------------------------------------------- generation
    def _generate(self, machine: MachineState) -> dict[str, Any]:
        base = self._pick_base(machine)
        machine.wear = min(300.0, machine.wear + float(self.rng.uniform(0.35, 1.15)))
        if machine.wear > 250:
            machine.wear = float(self.rng.uniform(2, 12))  # changement d'outil

        air = float(base["Air temperature [K]"]) + float(self.rng.normal(0, 0.35))
        process = float(base["Process temperature [K]"]) + float(self.rng.normal(0, 0.35))
        rpm = float(base["Rotational speed [rpm]"]) * (1 + float(self.rng.normal(0, 0.012)))
        torque = float(base["Torque [Nm]"]) * (1 + float(self.rng.normal(0, 0.03)))
        wear = machine.wear

        template = machine.template
        if template and machine.degradation > 0.001:
            k = smoothstep(machine.degradation)
            tpl_air = float(template["Air temperature [K]"])
            tpl_process = float(template["Process temperature [K]"])
            tpl_rpm = float(template["Rotational speed [rpm]"])
            tpl_torque = float(template["Torque [Nm]"])
            tpl_wear = float(template["Tool wear [min]"])
            air = air * (1 - k) + tpl_air * k + float(self.rng.normal(0, 0.45 * k))
            process = (
                process * (1 - k)
                + tpl_process * k
                + float(self.rng.normal(0, 0.55 * k))
            )
            rpm = rpm * (1 - k) + tpl_rpm * k
            rpm *= 1 + float(self.rng.normal(0, 0.008 * k))
            torque = torque * (1 - k) + tpl_torque * k
            torque *= 1 + float(self.rng.normal(0, 0.02 * k))
            wear = max(wear, wear * (1 - k) + tpl_wear * k)

        # Bornes physiques et cohérence procédé > air.
        air = float(np.clip(air, 250.0, 350.0))
        process = float(np.clip(process, 250.0, 360.0))
        if process <= air + 1:
            process = air + 6 + float(abs(self.rng.normal(0, 1.5)))
        rpm = float(np.clip(rpm, 500.0, 4000.0))
        torque = float(np.clip(torque, 0.0, 150.0))
        wear = float(np.clip(wear, 0.0, 300.0))

        return {
            "machine_id": machine.machine_id,
            "timestamp": now_iso(),
            "type": machine.type,
            "air_temperature": round(air, 2),
            "process_temperature": round(process, 2),
            "rotational_speed": round(rpm, 1),
            "torque": round(torque, 2),
            "tool_wear": round(wear, 1),
        }

    # ------------------------------------------------------------------- tick
    async def tick(self) -> None:
        self.tick_count += 1
        timestamp = now_iso()
        readings: list[dict[str, Any]] = []
        states = list(self.machines.values())
        for machine in states:
            self._advance_degradation(machine)
            readings.append(self._generate(machine))

        probabilities, latency_ms = self.service.predict_readings(readings)
        self.last_latency_ms = latency_ms
        self.last_tick = timestamp
        rows: list[dict[str, Any]] = []
        machine_events: list[dict[str, Any]] = []
        alarm_events: list[dict[str, Any]] = []

        for reading, probability in zip(readings, probabilities):
            machine = self.machines[reading["machine_id"]]
            probability = float(probability)
            status = status_for(probability)
            previous = machine.last_payload["status"] if machine.last_payload else "NORMAL"
            reading.update(
                {
                    "delta_temperature": round(
                        reading["process_temperature"] - reading["air_temperature"], 2
                    ),
                    "power_proxy": round(
                        reading["torque"]
                        * reading["rotational_speed"]
                        * 2
                        * math.pi
                        / 60,
                        2,
                    ),
                    "probability": round(probability, 4),
                    "status": status,
                    "latency_ms": round(latency_ms / max(1, len(readings)), 2),
                }
            )
            machine.last_probability = probability
            machine.last_payload = dict(reading)
            rows.append(reading)

            if status != previous:
                alarm = self._alarm_for_transition(
                    machine, previous, status, probability, timestamp
                )
                if alarm:
                    machine.alarms += 1
                    alarm_events.append({"type": "alarm", "alarm": alarm})

            machine_events.append({"type": "machine", "machine": dict(reading)})

        self.db.insert_readings(rows)
        for event in machine_events:
            self.publish(event)
        for event in alarm_events:
            self.publish(event)
        self.publish(
            {
                "type": "tick",
                "timestamp": timestamp,
                "latency_ms": latency_ms,
                "interval": self.interval,
                "paused": self.paused,
                "online": len(states),
                "machine_count": len(states),
                "alarm_count": sum(1 for m in states if m.status == "PANNE_PREVUE"),
                "watch_count": sum(1 for m in states if m.status == "SURVEILLANCE"),
                "failure_rate": round(
                    sum(1 for m in states if m.status == "PANNE_PREVUE")
                    / max(1, len(states)),
                    4,
                ),
                "model_recall": self.model_recall,
                "max_probability": round(float(np.max(probabilities)), 4),
                "avg_probability": round(float(np.mean(probabilities)), 4),
            }
        )

    def _advance_degradation(self, machine: MachineState) -> None:
        if machine.remaining > 0:
            step = (machine.target - machine.degradation) / max(1, machine.remaining)
            machine.degradation = min(machine.target, machine.degradation + max(step, 0.01))
            machine.remaining -= 1
            if machine.remaining <= 0:
                machine.decaying = True
        elif machine.decaying:
            machine.degradation = max(0.0, machine.degradation - 0.045)
            if machine.degradation <= 0.0:
                machine.decaying = False
                machine.template = None
                machine.injected_until = None
        elif machine.injected_until and utc_now() < machine.injected_until:
            self._start_episode(machine, start=max(0.35, machine.degradation), ramp=12)

        active = sum(1 for m in self.machines.values() if m.remaining > 0)
        if (
            active < 2
            and self.tick_count % 17 == 0
            and random.random() < 0.42
        ):
            candidates = [
                m
                for m in self.machines.values()
                if m.remaining <= 0 and not m.decaying and m.degradation < 0.02
            ]
            if candidates:
                chosen = random.choice(candidates)
                self._start_episode(chosen, start=0.03, ramp=int(self.rng.integers(20, 30)))

    # -------------------------------------------------------------- diffusion
    def _alarm_for_transition(
        self,
        machine: MachineState,
        previous: str,
        status: str,
        probability: float,
        timestamp: str,
    ) -> dict[str, Any] | None:
        rank = {"NORMAL": 0, "SURVEILLANCE": 1, "PANNE_PREVUE": 2}
        if rank[status] > rank[previous]:
            if status == "PANNE_PREVUE":
                event = f"Panne prévue — mode {machine.mode} ({probability:.0%})"
                severity = "PANNE_PREVUE"
            else:
                event = f"Surveillance — risque de panne ({probability:.0%})"
                severity = "SURVEILLANCE"
        elif status == "NORMAL" and rank[previous] > 0:
            event = "Retour à la normale"
            severity = "INFO"
        else:
            return None
        machine.status = status
        return self.db.insert_alarm(
            machine_id=machine.machine_id,
            timestamp=timestamp,
            event=event,
            severity=severity,
            probability=probability,
        )

    # -------------------------------------------------------------- diffusion
    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=300)
        self.subscribers.add(queue)
        logger.info("Client temps réel connecté (%d)", len(self.subscribers))
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        self.subscribers.discard(queue)
        logger.info("Client temps réel déconnecté (%d restants)", len(self.subscribers))

    def publish(self, message: dict[str, Any]) -> None:
        for queue in list(self.subscribers):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                pass

    def _machine_payload(self, machine: MachineState) -> dict[str, Any]:
        if machine.last_payload:
            return machine.last_payload
        timestamp = now_iso()
        base = machine.base_row or {}
        air = float(base.get("Air temperature [K]", 298.1))
        process = float(base.get("Process temperature [K]", 308.6))
        return {
            "machine_id": machine.machine_id,
            "timestamp": timestamp,
            "type": machine.type,
            "air_temperature": round(air, 2),
            "process_temperature": round(process, 2),
            "rotational_speed": round(float(base.get("Rotational speed [rpm]", 1500)), 1),
            "torque": round(float(base.get("Torque [Nm]", 40)), 2),
            "tool_wear": round(machine.wear, 1),
            "delta_temperature": round(process - air, 2),
            "power_proxy": round(
                float(base.get("Torque [Nm]", 40))
                * float(base.get("Rotational speed [rpm]", 1500))
                * 2
                * math.pi
                / 60,
                2,
            ),
            "probability": round(machine.last_probability, 4),
            "status": machine.status,
            "latency_ms": round(self.last_latency_ms / max(1, len(self.machines)), 2),
        }

    def snapshot(self) -> dict[str, Any]:
        states = list(self.machines.values())
        return {
            "type": "snapshot",
            "timestamp": now_iso(),
            "machines": [
                self._machine_payload(machine) for machine in states
            ],
            "alarms": self.db.alarms(limit=50),
            "simulator": self.status(),
        }

    def status(self) -> dict[str, Any]:
        return {
            "running": self.running,
            "paused": self.paused,
            "interval": self.interval,
            "tick_count": self.tick_count,
            "last_tick": self.last_tick,
            "last_latency_ms": round(self.last_latency_ms, 2),
            "machine_count": len(self.machines),
            "clients": len(self.subscribers),
            "model_recall": self.model_recall,
            "alarm_count": sum(
                1 for m in self.machines.values() if m.status == "PANNE_PREVUE"
            ),
            "watch_count": sum(
                1 for m in self.machines.values() if m.status == "SURVEILLANCE"
            ),
        }

    def machines_payload(self) -> dict[str, Any]:
        return {
            "machines": [
                self._machine_payload(machine) for machine in self.machines.values()
            ],
            "simulator": self.status(),
        }

    def publish_control(self) -> None:
        self.publish(
            {
                "type": "control",
                "paused": self.paused,
                "interval": self.interval,
                "simulator": self.status(),
                "timestamp": now_iso(),
            }
        )

    def set_paused(self, paused: bool) -> dict[str, Any]:
        self.paused = paused
        self.publish_control()
        self._wake.set()
        return self.status()

    def set_interval(self, interval: float) -> dict[str, Any]:
        self.interval = float(interval)
        self.publish_control()
        self._wake.set()
        return self.status()

    def inject(self, machine_id: str) -> dict[str, Any] | None:
        machine = self.machines.get(machine_id)
        if machine is None:
            return None
        now = utc_now()
        machine.injected_until = now + timedelta(seconds=45)
        self._start_episode(machine, start=max(0.3, machine.degradation), ramp=8)
        logger.info("Injection de panne sur %s", machine_id)
        self.publish(
            {
                "type": "injection",
                "machine_id": machine_id,
                "timestamp": now_iso(),
                "message": f"Scénario de panne injecté sur {machine_id}",
            }
        )
        self._wake.set()
        return {
            "machine_id": machine_id,
            "message": f"Scénario {machine.mode} injecté pendant 45 s",
            "injected_until": machine.injected_until.isoformat(timespec="seconds"),
        }

    # -------------------------------------------------------------------- run
    async def run(self) -> None:
        self.running = True
        self._stop.clear()
        logger.info("Simulateur démarré (intervalle %.0f s)", self.interval)
        try:
            await self.tick()
            while not self._stop.is_set():
                timeout = 0.25 if self.paused else self.interval
                try:
                    await asyncio.wait_for(self._wake.wait(), timeout=timeout)
                    self._wake.clear()
                except asyncio.TimeoutError:
                    pass
                if self._stop.is_set():
                    break
                if not self.paused:
                    try:
                        await self.tick()
                    except Exception:
                        logger.exception("Erreur pendant le tick du simulateur")
                        await asyncio.sleep(1)
        except asyncio.CancelledError:
            logger.info("Simulateur annulé")
            raise
        finally:
            self.running = False
            logger.info("Simulateur arrêté")

    def start(self, loop: asyncio.AbstractEventLoop | None = None) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self.run(), name="predictmaint-simulator")

    async def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
