"""Schémas Pydantic de l'API PredictMaint."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

MachineType = Literal["L", "M", "H"]
MachineStatus = Literal["NORMAL", "SURVEILLANCE", "PANNE_PREVUE"]
AlarmSeverity = Literal["INFO", "SURVEILLANCE", "PANNE_PREVUE"]


class SensorReading(BaseModel):
    """Mesures capteurs d'une machine (bornes réalistes du jeu AI4I 2020)."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "type": "L",
                "air_temperature": 298.1,
                "process_temperature": 308.6,
                "rotational_speed": 1551,
                "torque": 42.8,
                "tool_wear": 120,
            }
        }
    )

    type: MachineType = Field(description="Gamme de la machine : L, M ou H")
    air_temperature: float = Field(
        ge=250.0, le=350.0, description="Température de l'air (K)"
    )
    process_temperature: float = Field(
        ge=250.0, le=360.0, description="Température du procédé (K)"
    )
    rotational_speed: float = Field(
        ge=500.0, le=4000.0, description="Vitesse de rotation (tr/min)"
    )
    torque: float = Field(ge=0.0, le=150.0, description="Couple (Nm)")
    tool_wear: float = Field(
        ge=0.0, le=300.0, description="Usure de l'outil (min)"
    )

    @field_validator("type", mode="before")
    @classmethod
    def normalize_type(cls, value):
        if isinstance(value, str):
            return value.strip().upper()
        return value

    @model_validator(mode="after")
    def process_above_air(self):
        if self.process_temperature <= self.air_temperature:
            raise ValueError(
                "La température du procédé doit être supérieure à la température de l'air."
            )
        return self

    @property
    def delta_temperature(self) -> float:
        return round(self.process_temperature - self.air_temperature, 2)

    @property
    def power_proxy(self) -> float:
        import math

        return round(
            self.torque * self.rotational_speed * 2 * math.pi / 60, 2
        )


class PredictRequest(SensorReading):
    machine_id: str | None = Field(
        default=None,
        max_length=40,
        description="Identifiant facultatif pour rattacher la prédiction au flux live",
    )


class PredictResponse(BaseModel):
    probability: float
    prediction: int
    status: MachineStatus
    threshold: float
    latency_ms: float
    machine_id: str | None = None
    timestamp: str
    derived: dict[str, float] = Field(default_factory=dict)


class BatchPredictRequest(BaseModel):
    machines: list[PredictRequest] = Field(min_length=1, max_length=100)


class BatchPredictResponse(BaseModel):
    predictions: list[PredictResponse]
    count: int
    latency_ms: float


class SimulatorControl(BaseModel):
    paused: bool | None = None
    interval: Literal[1, 2, 5] | None = None


class SimulatorInjectResponse(BaseModel):
    machine_id: str
    message: str
    injected_until: str


class AlarmOut(BaseModel):
    id: int
    machine_id: str
    timestamp: str
    event: str
    severity: AlarmSeverity
    probability: float


class MachineLive(BaseModel):
    machine_id: str
    timestamp: str
    type: MachineType
    air_temperature: float
    process_temperature: float
    rotational_speed: float
    torque: float
    tool_wear: float
    delta_temperature: float
    power_proxy: float
    probability: float
    status: MachineStatus
    latency_ms: float


class HistoryPoint(BaseModel):
    timestamp: str
    probability: float
    status: MachineStatus
    torque: float
    rotational_speed: float
    tool_wear: float
    delta_temperature: float
