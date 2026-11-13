"""Chargement du modèle et logique métier de prédiction."""
from __future__ import annotations

import logging
import math
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd

from .schemas import PredictRequest

logger = logging.getLogger("predictmaint.service")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("PREDICTMAINT_DATA_DIR", BASE_DIR / "data"))
ARTIFACTS_DIR = Path(
    os.getenv("PREDICTMAINT_ARTIFACTS_DIR", BASE_DIR / "resultats_projet")
)
DATASET_PATH = Path(os.getenv("PREDICTMAINT_DATASET", DATA_DIR / "ai4i2020.csv"))
MODEL_PATH = Path(os.getenv("PREDICTMAINT_MODEL", ARTIFACTS_DIR / "modele_retenu.joblib"))

THRESHOLD = 0.5
WARNING_THRESHOLD = 0.30
SEED = 42

FEATURES = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
    "Delta temperature [K]",
    "Power proxy [W]",
    "Type",
]

MODEL_SLUGS = {
    "logistic_regression": "Logistic Regression",
    "svm_rbf": "SVM RBF",
    "random_forest": "Random Forest",
    "xgboost": "XGBoost",
    "mlp": "MLP",
}


def slugify(name: str) -> str:
    return name.lower().replace(" ", "_").replace("-", "_")


def status_for(probability: float) -> str:
    if probability < WARNING_THRESHOLD:
        return "NORMAL"
    if probability < THRESHOLD:
        return "SURVEILLANCE"
    return "PANNE_PREVUE"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _json_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    clean = df.replace({np.nan: None})
    records = clean.to_dict(orient="records")
    for record in records:
        for key, value in record.items():
            if isinstance(value, (np.integer,)):
                record[key] = int(value)
            elif isinstance(value, (np.floating,)):
                record[key] = float(value)
    return records


class ModelService:
    """Charge le pipeline une seule fois et centralise les prédictions."""

    def __init__(self) -> None:
        self.model: Any | None = None
        self.metadata: dict[str, Any] = {}
        self.loaded_at: str | None = None
        self._lock = threading.RLock()
        self._importance: dict[str, Any] | None = None

    # ------------------------------------------------------------------ load
    def load(self) -> None:
        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"Modèle introuvable : {MODEL_PATH}. Lancez `python train_export.py`."
            )
        logger.info("Chargement du modèle : %s", MODEL_PATH)
        self.model = joblib.load(MODEL_PATH)
        # Le pipeline a été entraîné avec n_jobs=-1 ; en prédiction (8 lignes),
        # le parallélisme joblib génère un flot d'avertissements scikit-learn
        # pour un gain nul. On repasse l'estimateur en séquentiel.
        estimator = getattr(self.model, "named_steps", {}).get("model")
        if estimator is not None and hasattr(estimator, "n_jobs"):
            estimator.n_jobs = 1
        self.loaded_at = now_iso()
        meta_path = ARTIFACTS_DIR / "model_metadata.json"
        if meta_path.exists():
            import json

            try:
                self.metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            except Exception as exc:  # pragma: no cover - défense
                logger.warning("Métadonnées illisibles : %s", exc)
        if not self.metadata.get("selected_model"):
            comparison = self.comparison()
            self.metadata["selected_model"] = comparison.get("selected")
        else:
            # Même si les métadonnées existent, le modèle affiché reste celui
            # qui est déduit des exports : meilleur F1 sur le jeu de test.
            comparison = self.comparison()
            if comparison.get("selected"):
                self.metadata["selected_model"] = comparison["selected"]
        self.metadata.setdefault("threshold", THRESHOLD)
        logger.info("Modèle chargé : %s", self.metadata.get("selected_model"))

    @property
    def model_name(self) -> str:
        return str(self.metadata.get("selected_model") or "")

    @property
    def threshold(self) -> float:
        return float(self.metadata.get("threshold", THRESHOLD))

    # -------------------------------------------------------------- features
    @staticmethod
    def reading_to_row(reading: dict[str, Any]) -> dict[str, Any]:
        air = float(reading["air_temperature"])
        process = float(reading["process_temperature"])
        rpm = float(reading["rotational_speed"])
        torque = float(reading["torque"])
        return {
            "Air temperature [K]": air,
            "Process temperature [K]": process,
            "Rotational speed [rpm]": rpm,
            "Torque [Nm]": torque,
            "Tool wear [min]": float(reading["tool_wear"]),
            "Delta temperature [K]": round(process - air, 2),
            "Power proxy [W]": round(torque * rpm * 2 * math.pi / 60, 2),
            "Type": str(reading["type"]).upper(),
        }

    def request_to_row(self, request: PredictRequest) -> dict[str, Any]:
        return self.reading_to_row(request.model_dump())

    def _predict_proba(self, frame: pd.DataFrame) -> np.ndarray:
        if self.model is None:
            raise RuntimeError("Modèle non chargé")
        with self._lock:
            probabilities = self.model.predict_proba(frame[FEATURES])[:, 1]
        return np.asarray(probabilities, dtype=float)

    # ------------------------------------------------------------- predict
    def predict(self, request: PredictRequest) -> dict[str, Any]:
        row = self.request_to_row(request)
        frame = pd.DataFrame([row], columns=FEATURES)
        started = time.perf_counter()
        probability = float(self._predict_proba(frame)[0])
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return {
            "probability": round(probability, 4),
            "prediction": int(probability >= self.threshold),
            "status": status_for(probability),
            "threshold": self.threshold,
            "latency_ms": latency_ms,
            "machine_id": request.machine_id,
            "timestamp": now_iso(),
            "derived": {
                "delta_temperature": row["Delta temperature [K]"],
                "power_proxy": row["Power proxy [W]"],
            },
        }

    def predict_many(self, requests: list[PredictRequest]) -> tuple[list[dict[str, Any]], float]:
        rows = [self.request_to_row(request) for request in requests]
        frame = pd.DataFrame(rows, columns=FEATURES)
        started = time.perf_counter()
        probabilities = self._predict_proba(frame)
        total_ms = round((time.perf_counter() - started) * 1000, 2)
        per_row_ms = round(total_ms / max(1, len(rows)), 2)
        timestamp = now_iso()
        results = []
        for request, row, probability in zip(requests, rows, probabilities):
            probability = float(probability)
            results.append(
                {
                    "probability": round(probability, 4),
                    "prediction": int(probability >= self.threshold),
                    "status": status_for(probability),
                    "threshold": self.threshold,
                    "latency_ms": per_row_ms,
                    "machine_id": request.machine_id,
                    "timestamp": timestamp,
                    "derived": {
                        "delta_temperature": row["Delta temperature [K]"],
                        "power_proxy": row["Power proxy [W]"],
                    },
                }
            )
        return results, total_ms

    def predict_readings(self, readings: list[dict[str, Any]]) -> tuple[np.ndarray, float]:
        rows = [self.reading_to_row(reading) for reading in readings]
        frame = pd.DataFrame(rows, columns=FEATURES)
        started = time.perf_counter()
        probabilities = self._predict_proba(frame)
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return probabilities, latency_ms

    # ------------------------------------------------------------ artefacts
    def comparison(self) -> dict[str, Any]:
        path = ARTIFACTS_DIR / "comparaison_5_modeles_test.csv"
        if not path.exists():
            return {"models": [], "selected": None, "threshold": self.threshold}
        df = pd.read_csv(path)
        df.columns = [str(c).strip() for c in df.columns]
        df["F1-score"] = pd.to_numeric(df["F1-score"], errors="coerce")
        df = df.dropna(subset=["F1-score"])
        if df.empty:
            return {"models": [], "selected": None, "threshold": self.threshold}
        # Le modèle retenu est déduit des données exportées : meilleur F1 test.
        best_index = df["F1-score"].idxmax()
        selected_name = str(df.loc[best_index, "Modèle"])
        df["slug"] = df["Modèle"].map(slugify)
        df["selected"] = df["Modèle"].eq(selected_name)
        return {
            "models": _json_records(df),
            "selected": selected_name,
            "threshold": self.threshold,
            "note": "Seuil 0,5 ; choix du modèle descriptif sur le test (F1).",
        }


    def confusion(self, model: str) -> dict[str, Any] | None:
        key = model.strip().lower().replace("-", "_").replace(" ", "_")
        name = MODEL_SLUGS.get(key)
        if name is None:
            return None
        path = ARTIFACTS_DIR / f"matrice_{key}.csv"
        if not path.exists():
            return None
        df = pd.read_csv(path, index_col=0)
        matrix = [[int(value) for value in row] for row in df.to_numpy().tolist()]
        return {
            "model": name,
            "slug": key,
            "labels": ["Normal", "Panne"],
            "matrix": matrix,
            "selected": name == self.model_name,
            "threshold": self.threshold,
        }

    def metrics(self) -> dict[str, Any]:
        # Le modèle retenu et ses métriques sont lus dans l'export comparatif :
        # sélection par F1 test, sans valeur métier écrite dans le frontend.
        comparison = self.comparison()
        selected = comparison.get("selected")
        labels = {
            "Accuracy": "accuracy",
            "Precision": "precision",
            "Recall": "recall",
            "F1-score": "f1",
            "ROC-AUC": "roc_auc",
            "Average Precision": "average_precision",
        }
        row = next(
            (model for model in comparison.get("models", []) if model.get("selected")),
            None,
        )
        if row is not None:
            raw = {
                label: float(row[label])
                for label in labels
                if row.get(label) is not None
            }
            metrics = {labels[label]: float(row[label]) for label in labels if row.get(label) is not None}
        else:
            raw, metrics = {}, {}
        path = ARTIFACTS_DIR / "metriques_test.csv"
        if not metrics and path.exists():
            df = pd.read_csv(path)
            raw = {
                str(item.iloc[0]).strip(): float(item.iloc[1])
                for _, item in df.iterrows()
                if pd.notna(item.iloc[1])
            }
            metrics = {labels.get(key, key): value for key, value in raw.items()}
        return {
            "model": selected or self.model_name,
            "threshold": self.threshold,
            "metrics": metrics,
            "raw": raw,
            "note": "Seuil 0,5 ; choix du modèle descriptif sur le test (F1).",
        }


    def _curves(self, filename: str, x_key: str, y_key: str) -> dict[str, Any]:
        path = ARTIFACTS_DIR / filename
        if not path.exists():
            return {"curves": [], "note": "Courbes non exportées."}
        df = pd.read_csv(path)
        comparison = pd.read_csv(ARTIFACTS_DIR / "comparaison_5_modeles_test.csv")
        selected_name = None
        if "F1-score" in comparison.columns:
            comparison["F1-score"] = pd.to_numeric(comparison["F1-score"], errors="coerce")
            selected_name = str(comparison.loc[comparison["F1-score"].idxmax(), "Modèle"])
        aucs = {
            str(row["Modèle"]): float(row["ROC-AUC"])
            for _, row in comparison.iterrows()
        } if "ROC-AUC" in comparison.columns else {}
        curves = []
        for name, group in df.groupby("Modèle", sort=False):
            curves.append(
                {
                    "model": str(name),
                    "auc": aucs.get(str(name)),
                    "selected": str(name) == selected_name,
                    "points": [
                        {x_key: round(float(row[x_key]), 5), y_key: round(float(row[y_key]), 5)}
                        for _, row in group.iterrows()
                    ],
                }
            )
        return {"curves": curves}

    def roc(self) -> dict[str, Any]:
        return self._curves("roc_curves.csv", "FPR", "TPR")

    def pr(self) -> dict[str, Any]:
        return self._curves("pr_curves.csv", "Recall", "Precision")

    def importance(self) -> dict[str, Any]:
        path = ARTIFACTS_DIR / "importance_variables.csv"
        if path.exists():
            df = pd.read_csv(path)
            return {
                "model": self.model_name,
                "scoring": "average_precision",
                "variables": _json_records(df),
            }
        if self._importance is None:
            self._importance = self._compute_importance()
        return self._importance

    def _compute_importance(self) -> dict[str, Any]:
        logger.info("Calcul de l'importance par permutation (premier appel)...")
        from sklearn.inspection import permutation_importance
        from sklearn.model_selection import train_test_split

        df = pd.read_csv(DATASET_PATH)
        df.columns = [str(c).strip() for c in df.columns]
        data = df.copy()
        data["Delta temperature [K]"] = (
            data["Process temperature [K]"] - data["Air temperature [K]"]
        )
        data["Power proxy [W]"] = (
            data["Torque [Nm]"] * data["Rotational speed [rpm]"] * 2 * math.pi / 60
        )
        X = data[FEATURES]
        y = data["Machine failure"].astype(int)
        _, X_test, _, y_test = train_test_split(
            X, y, test_size=0.20, stratify=y, random_state=SEED
        )
        sample = X_test.sample(n=min(500, len(X_test)), random_state=SEED)
        target = y_test.loc[sample.index]
        result = permutation_importance(
            self.model,
            sample,
            target,
            n_repeats=3,
            scoring="average_precision",
            random_state=SEED,
            n_jobs=1,
        )
        records = [
            {
                "Variable": column,
                "Importance moyenne": float(mean),
                "Écart-type": float(std),
            }
            for column, mean, std in zip(
                sample.columns, result.importances_mean, result.importances_std
            )
        ]
        records.sort(key=lambda item: item["Importance moyenne"], reverse=True)
        payload = {
            "model": self.model_name,
            "scoring": "average_precision",
            "variables": records,
        }
        try:
            pd.DataFrame(records).to_csv(
                ARTIFACTS_DIR / "importance_variables.csv", index=False
            )
        except Exception as exc:  # pragma: no cover
            logger.warning("Impossible d'écrire l'importance : %s", exc)
        return payload

    def bilan(self) -> dict[str, Any]:
        path = ARTIFACTS_DIR / "bilan_metier.csv"
        if not path.exists():
            return {"rows": []}
        return {"rows": _json_records(pd.read_csv(path))}

    def equilibrage(self) -> dict[str, Any]:
        path = ARTIFACTS_DIR / "equilibrage_avant_apres_svmsmote.csv"
        if not path.exists():
            return {"rows": []}
        return {"rows": _json_records(pd.read_csv(path))}
