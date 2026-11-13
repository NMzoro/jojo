"""Tests de l'API PredictMaint (pytest)."""
from __future__ import annotations

import os
from pathlib import Path

os.environ["PREDICTMAINT_SIMULATOR"] = "0"
os.environ["PREDICTMAINT_DB"] = str(Path(__file__).parent / "test_predictmaint.db")

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


VALID = {
    "type": "L",
    "air_temperature": 298.1,
    "process_temperature": 308.6,
    "rotational_speed": 1300,
    "torque": 70.0,
    "tool_wear": 240,
}


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["model"] == "Random Forest"
    assert payload["threshold"] == 0.5


def test_predict_valid(client):
    response = client.post("/api/predict", json=VALID)
    assert response.status_code == 200
    payload = response.json()
    assert 0.0 <= payload["probability"] <= 1.0
    assert payload["prediction"] in (0, 1)
    assert payload["status"] in ("NORMAL", "SURVEILLANCE", "PANNE_PREVUE")
    assert payload["threshold"] == 0.5
    assert payload["latency_ms"] >= 0
    assert payload["prediction"] == int(payload["probability"] >= 0.5)
    assert payload["derived"]["delta_temperature"] == pytest.approx(10.5, abs=0.01)
    assert payload["derived"]["power_proxy"] == pytest.approx(
        70.0 * 1300 * 2 * 3.141592653589793 / 60, abs=0.1
    )


def test_predict_high_risk_template(client):
    """Une mesure issue d'une panne réelle doit être détectée comme risque."""
    response = client.post(
        "/api/predict",
        json={
            "type": "L",
            "air_temperature": 298.1,
            "process_temperature": 308.6,
            "rotational_speed": 1240,
            "torque": 69.0,
            "tool_wear": 215,
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] in ("SURVEILLANCE", "PANNE_PREVUE")


def test_predict_validation(client):
    inverted = {**VALID, "process_temperature": 290.0}
    assert client.post("/api/predict", json=inverted).status_code == 422

    bad_type = {**VALID, "type": "Z"}
    assert client.post("/api/predict", json=bad_type).status_code == 422

    negative_torque = {**VALID, "torque": -5}
    assert client.post("/api/predict", json=negative_torque).status_code == 422

    missing = {key: value for key, value in VALID.items() if key != "torque"}
    assert client.post("/api/predict", json=missing).status_code == 422

    too_hot = {**VALID, "air_temperature": 900}
    assert client.post("/api/predict", json=too_hot).status_code == 422


def test_predict_batch(client):
    response = client.post(
        "/api/predict/batch",
        json={"machines": [VALID, {**VALID, "type": "H", "machine_id": "M-H-TEST"}]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert len(payload["predictions"]) == 2
    assert payload["predictions"][1]["machine_id"] == "M-H-TEST"


def test_models_endpoints(client):
    comparison = client.get("/api/models/comparison")
    assert comparison.status_code == 200
    data = comparison.json()
    assert len(data["models"]) == 5
    assert data["selected"] == "Random Forest"
    assert any(model["selected"] for model in data["models"])

    confusion = client.get("/api/models/confusion/random_forest")
    assert confusion.status_code == 200
    matrix = confusion.json()["matrix"]
    assert matrix == [[1920, 12], [12, 56]]

    missing = client.get("/api/models/confusion/inconnu")
    assert missing.status_code == 404

    importance = client.get("/api/models/importance")
    assert importance.status_code == 200
    assert len(importance.json()["variables"]) == 8

    roc = client.get("/api/models/roc")
    assert roc.status_code == 200
    assert len(roc.json()["curves"]) == 5


def test_machines_and_alarms(client):
    machines = client.get("/api/machines")
    assert machines.status_code == 200
    payload = machines.json()
    assert len(payload["machines"]) == 8
    machine_id = payload["machines"][0]["machine_id"]

    history = client.get(f"/api/machines/{machine_id}/history")
    assert history.status_code == 200
    assert history.json()["machine_id"] == machine_id

    assert client.get("/api/machines/UNKNOWN/history").status_code == 404
    alarms = client.get("/api/alarms")
    assert alarms.status_code == 200
    assert "alarms" in alarms.json()


def test_config_exposes_business_metadata(client):
    response = client.get("/api/config")
    assert response.status_code == 200
    payload = response.json()
    assert payload["fields"]
    assert {field["key"] for field in payload["fields"]} >= {
        "air_temperature",
        "process_temperature",
        "rotational_speed",
        "torque",
        "tool_wear",
    }
    for field in payload["fields"]:
        assert field["min"] is not None and field["max"] is not None
        assert field["min"] < field["max"]
    assert [item["value"] for item in payload["statuses"]] == [
        "NORMAL",
        "SURVEILLANCE",
        "PANNE_PREVUE",
    ]
    assert payload["thresholds"]["alarm"] == 0.5
    assert payload["thresholds"]["warning"] < payload["thresholds"]["alarm"]
    assert payload["display"]["torque"]["max"] > 0
    assert payload["model"]["name"] == "Random Forest"


def test_reports_are_listed_from_artifacts(client):
    response = client.get("/api/reports")
    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] >= 1
    names = {item["filename"] for item in payload["files"]}
    assert "comparaison_5_modeles_test.csv" in names
    for item in payload["files"]:
        assert item["kind"]
        assert item["size_bytes"] >= 0
        assert item["modified"]


def test_selected_model_is_best_f1(client):
    payload = client.get("/api/models/comparison").json()
    best = max(payload["models"], key=lambda model: model["F1-score"])
    assert payload["selected"] == best["Modèle"]
    metrics = client.get("/api/models/metrics").json()
    assert metrics["model"] == best["Modèle"]
    assert metrics["metrics"]["f1"] == pytest.approx(best["F1-score"])
