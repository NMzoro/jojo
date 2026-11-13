"""Accès SQLite : historique des mesures et journal des alarmes."""
from __future__ import annotations

import logging
import sqlite3
import threading
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable

logger = logging.getLogger("predictmaint.db")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Database:
    """Petite couche SQLite thread-safe (une connexion + verrou)."""

    def __init__(self, path: Path | str):
        self.path = str(path)
        self._lock = threading.Lock()
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA synchronous=NORMAL")
        self.initialize()

    def initialize(self) -> None:
        with self._lock, self._conn:
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS readings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    machine_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    type TEXT NOT NULL,
                    air_temperature REAL NOT NULL,
                    process_temperature REAL NOT NULL,
                    rotational_speed REAL NOT NULL,
                    torque REAL NOT NULL,
                    tool_wear REAL NOT NULL,
                    delta_temperature REAL NOT NULL,
                    power_proxy REAL NOT NULL,
                    probability REAL NOT NULL,
                    status TEXT NOT NULL,
                    latency_ms REAL NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_readings_machine_ts
                    ON readings(machine_id, timestamp);
                CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(timestamp);

                CREATE TABLE IF NOT EXISTS alarms (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    machine_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    event TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    probability REAL NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_alarms_ts ON alarms(timestamp);
                CREATE INDEX IF NOT EXISTS idx_alarms_machine ON alarms(machine_id);
                """
            )
        logger.info("Base SQLite prête : %s", self.path)
        self.prune()

    def prune(self, reading_days: int = 7, alarm_days: int = 30) -> None:
        now = datetime.now(timezone.utc)
        cutoff_readings = (now - timedelta(days=reading_days)).isoformat(timespec="seconds")
        cutoff_alarms = (now - timedelta(days=alarm_days)).isoformat(timespec="seconds")
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM readings WHERE timestamp < ?", (cutoff_readings,))
            self._conn.execute("DELETE FROM alarms WHERE timestamp < ?", (cutoff_alarms,))

    def insert_readings(self, rows: Iterable[dict[str, Any]]) -> None:
        rows = list(rows)
        if not rows:
            return
        with self._lock, self._conn:
            self._conn.executemany(
                """
                INSERT INTO readings (
                    machine_id, timestamp, type, air_temperature, process_temperature,
                    rotational_speed, torque, tool_wear, delta_temperature, power_proxy,
                    probability, status, latency_ms
                ) VALUES (
                    :machine_id, :timestamp, :type, :air_temperature, :process_temperature,
                    :rotational_speed, :torque, :tool_wear, :delta_temperature, :power_proxy,
                    :probability, :status, :latency_ms
                )
                """,
                rows,
            )

    def insert_alarm(
        self,
        machine_id: str,
        timestamp: str,
        event: str,
        severity: str,
        probability: float,
    ) -> dict[str, Any]:
        with self._lock, self._conn:
            cursor = self._conn.execute(
                """
                INSERT INTO alarms (machine_id, timestamp, event, severity, probability)
                VALUES (?, ?, ?, ?, ?)
                """,
                (machine_id, timestamp, event, severity, probability),
            )
        return {
            "id": int(cursor.lastrowid),
            "machine_id": machine_id,
            "timestamp": timestamp,
            "event": event,
            "severity": severity,
            "probability": round(float(probability), 4),
        }

    def history(self, machine_id: str, limit: int = 120) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT timestamp, probability, status, torque, rotational_speed,
                       tool_wear, delta_temperature
                FROM readings
                WHERE machine_id = ?
                ORDER BY id DESC
                LIMIT ?
                """,
                (machine_id, max(1, min(limit, 1000))),
            ).fetchall()
        return [dict(row) for row in reversed(rows)]

    def alarms(
        self,
        limit: int = 100,
        severity: str | None = None,
        machine_id: str | None = None,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM alarms WHERE 1=1"
        params: list[Any] = []
        if severity:
            query += " AND severity = ?"
            params.append(severity)
        if machine_id:
            query += " AND machine_id = ?"
            params.append(machine_id)
        query += " ORDER BY id DESC LIMIT ?"
        params.append(max(1, min(limit, 1000)))
        with self._lock:
            rows = self._conn.execute(query, params).fetchall()
        return [
            {
                **dict(row),
                "probability": round(float(row["probability"]), 4),
            }
            for row in rows
        ]

    def alarm_counts(self) -> dict[str, int]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT severity, COUNT(*) AS n FROM alarms GROUP BY severity"
            ).fetchall()
        return {row["severity"]: int(row["n"]) for row in rows}

    def close(self) -> None:
        with self._lock:
            self._conn.close()
