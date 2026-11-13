"""API FastAPI PredictMaint — maintenance prédictive temps réel."""
from __future__ import annotations

import asyncio
import io
import json
import logging
import os
import time
import zipfile
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .db import Database
from .schemas import (
    BatchPredictRequest,
    BatchPredictResponse,
    PredictRequest,
    PredictResponse,
    SimulatorControl,
    SimulatorInjectResponse,
)
from .service import (
    ARTIFACTS_DIR,
    BASE_DIR,
    DATASET_PATH,
    THRESHOLD,
    WARNING_THRESHOLD,
    ModelService,
    now_iso,
)
from .simulator import MaintenanceSimulator

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger("predictmaint.api")

VERSION = "1.0.0"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"
DB_PATH = Path(os.getenv("PREDICTMAINT_DB", BASE_DIR / "data" / "predictmaint.db"))
SIMULATOR_ENABLED = os.getenv("PREDICTMAINT_SIMULATOR", "1") != "0"
DEFAULT_INTERVAL = float(os.getenv("PREDICTMAINT_INTERVAL", "2"))

REQUEST_LOGS: deque[dict[str, Any]] = deque(maxlen=300)
STARTED_AT = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Démarrage de PredictMaint API %s", VERSION)
    db = Database(DB_PATH)
    service = ModelService()
    model_error: str | None = None
    try:
        service.load()
    except Exception as exc:
        model_error = str(exc)
        logger.exception("Modèle indisponible : %s", exc)

    simulator = MaintenanceSimulator(db, service, interval=DEFAULT_INTERVAL)
    app.state.db = db
    app.state.service = service
    app.state.simulator = simulator
    app.state.model_error = model_error
    if model_error is None and SIMULATOR_ENABLED:
        simulator.start()
    elif not SIMULATOR_ENABLED:
        logger.info("Simulateur désactivé par PREDICTMAINT_SIMULATOR=0")
    try:
        yield
    finally:
        await simulator.stop()
        db.close()
        logger.info("Arrêt de PredictMaint API")


app = FastAPI(
    title="PredictMaint API",
    description=(
        "API de maintenance prédictive (UCI AI4I 2020). "
        "Pipeline préprocesseur → SVMSMOTE → Random Forest. "
        "Seuil 0,5 ; choix du modèle descriptif sur le test (F1)."
    ),
    version=VERSION,
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration = round((time.perf_counter() - started) * 1000, 1)
    if request.url.path.startswith("/api"):
        REQUEST_LOGS.appendleft(
            {
                "timestamp": now_iso(),
                "method": request.method,
                "path": request.url.path,
                "query": str(request.url.query or ""),
                "status": response.status_code,
                "duration_ms": duration,
            }
        )
    return response


def get_service(request: Request) -> ModelService:
    service: ModelService = request.app.state.service
    if service.model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Modèle indisponible. Lancez `python train_export.py` puis redémarrez l'API. "
                f"Détail : {request.app.state.model_error}"
            ),
        )
    return service


def get_simulator(request: Request) -> MaintenanceSimulator:
    return request.app.state.simulator


# --------------------------------------------------------------------- système
@app.get("/api/health", tags=["Système"])
async def health(request: Request) -> dict[str, Any]:
    service: ModelService = request.app.state.service
    simulator: MaintenanceSimulator = request.app.state.simulator
    return {
        "status": "ok" if service.model is not None else "degraded",
        "model": service.model_name if service.model is not None else None,
        "threshold": service.threshold,
        "version": VERSION,
        "uptime_s": round(time.time() - STARTED_AT, 1),
        "simulator": simulator.status(),
        "error": request.app.state.model_error,
        "timestamp": now_iso(),
        "note": "Seuil 0,5 ; choix du modèle descriptif sur le test (F1).",
    }


@app.get("/api/system/info", tags=["Système"])
async def system_info(request: Request) -> dict[str, Any]:
    service: ModelService = request.app.state.service
    dataset_rows = None
    if DATASET_PATH.exists():
        try:
            import pandas as pd

            dataset_rows = int(len(pd.read_csv(DATASET_PATH, usecols=[0])))
        except Exception:
            dataset_rows = None
    return {
        "version": VERSION,
        "model": service.model_name,
        "threshold": service.threshold,
        "metadata": service.metadata,
        "features": [
            "type",
            "air_temperature",
            "process_temperature",
            "rotational_speed",
            "torque",
            "tool_wear",
        ],
        "derived_features": ["Delta temperature [K]", "Power proxy [W]"],
        "dataset_rows": dataset_rows,
        "artifacts_dir": str(ARTIFACTS_DIR),
        "database": str(DB_PATH),
        "note": "Seuil 0,5 ; choix du modèle descriptif sur le test (F1).",
    }


@app.get("/api/config", tags=["Système"])
async def config(request: Request) -> dict[str, Any]:
    """Configuration métier consommée par l'IHM (aucune valeur métier en dur)."""
    service: ModelService = request.app.state.service
    schema = PredictRequest.model_json_schema()["properties"]
    field_meta = [
        ("air_temperature", "Température air", "K", 0.1),
        ("process_temperature", "Température procédé", "K", 0.1),
        ("rotational_speed", "Vitesse rotation", "tr/min", 1),
        ("torque", "Couple", "Nm", 0.1),
        ("tool_wear", "Usure outil", "min", 1),
    ]
    fields = []
    for key, label, unit, step in field_meta:
        spec = schema.get(key, {})
        fields.append(
            {
                "key": key,
                "label": label,
                "unit": unit,
                "min": spec.get("minimum"),
                "max": spec.get("maximum"),
                "step": step,
            }
        )
    type_labels = {"L": "L — faible", "M": "M — moyenne", "H": "H — haute"}
    type_values = schema.get("type", {}).get("enum") or ["L", "M", "H"]
    threshold = service.threshold
    return {
        "types": [
            {"value": value, "label": type_labels.get(value, value)}
            for value in type_values
        ],
        "fields": fields,
        "statuses": [
            {
                "value": "NORMAL",
                "label": "Normal",
                "min": 0.0,
                "max": WARNING_THRESHOLD,
                "action": "Aucune action immédiate",
            },
            {
                "value": "SURVEILLANCE",
                "label": "Surveillance",
                "min": WARNING_THRESHOLD,
                "max": threshold,
                "action": "Planifier une inspection",
            },
            {
                "value": "PANNE_PREVUE",
                "label": "Panne prévue",
                "min": threshold,
                "max": 1.0,
                "action": "Arrêt / intervention prioritaire",
            },
        ],
        "severities": [
            {"value": "INFO", "label": "Retour à la normale"},
            {"value": "SURVEILLANCE", "label": "Surveillance"},
            {"value": "PANNE_PREVUE", "label": "Panne prévue"},
        ],
        "thresholds": {"warning": WARNING_THRESHOLD, "alarm": threshold},
        "intervals": [1, 2, 5],
        "display": {
            "torque": {"label": "Couple", "unit": "Nm", "min": 0, "max": 100},
            "rotational_speed": {
                "label": "Vitesse",
                "unit": "tr/min",
                "min": 0,
                "max": 3000,
            },
            "tool_wear": {"label": "Usure outil", "unit": "min", "min": 0, "max": 300},
            "delta_temperature": {
                "label": "Écart thermique",
                "unit": "K",
                "min": 0,
                "max": 20,
            },
            "probability": {
                "label": "Probabilité de panne",
                "unit": "%",
                "min": 0,
                "max": 100,
            },
        },
        "model": {
            "name": service.model_name,
            "threshold": threshold,
            "metadata": service.metadata,
        },
        "line": {
            "name": "Ligne 2",
            "workshop": "Usinage",
            "operator": "Superviseur",
        },
        "derived_features": ["Delta temperature [K]", "Power proxy [W]"],
        "note": "Seuil 0,5 ; choix du modèle descriptif sur le test (F1).",
    }


@app.get("/api/reports", tags=["Rapports"])
async def reports(request: Request) -> dict[str, Any]:
    """Liste dynamique des artefacts disponibles, sans liste écrite dans l'IHM."""
    if not ARTIFACTS_DIR.exists():
        return {"files": [], "count": 0, "total_bytes": 0}
    kinds = {".csv": "CSV", ".png": "PNG", ".json": "JSON", ".joblib": "MODÈLE"}
    files = []
    for path in sorted(ARTIFACTS_DIR.iterdir()):
        if not path.is_file():
            continue
        stat = path.stat()
        files.append(
            {
                "filename": path.name,
                "kind": kinds.get(path.suffix.lower(), path.suffix.lstrip(".").upper()),
                "size_bytes": stat.st_size,
                "modified": datetime.fromtimestamp(
                    stat.st_mtime, tz=timezone.utc
                ).isoformat(timespec="seconds"),
            }
        )
    return {
        "files": files,
        "count": len(files),
        "total_bytes": sum(item["size_bytes"] for item in files),
    }


@app.get("/api/logs", tags=["Système"])
async def api_logs(limit: int = Query(100, ge=1, le=300)) -> dict[str, Any]:
    return {"logs": list(REQUEST_LOGS)[:limit], "count": len(REQUEST_LOGS)}


# ------------------------------------------------------------------ prédiction
@app.post("/api/predict", response_model=PredictResponse, tags=["Prédiction"])
async def predict(payload: PredictRequest, request: Request) -> dict[str, Any]:
    service = get_service(request)
    result = await run_in_threadpool(service.predict, payload)
    simulator = get_simulator(request)
    simulator.publish(
        {
            "type": "manual_prediction",
            "prediction": result,
            "input": payload.model_dump(),
            "timestamp": now_iso(),
        }
    )
    return result


@app.post(
    "/api/predict/batch", response_model=BatchPredictResponse, tags=["Prédiction"]
)
async def predict_batch(
    payload: BatchPredictRequest, request: Request
) -> dict[str, Any]:
    service = get_service(request)
    results, total_ms = await run_in_threadpool(
        service.predict_many, payload.machines
    )
    return {
        "predictions": results,
        "count": len(results),
        "latency_ms": total_ms,
    }


# --------------------------------------------------------------------- modèles
@app.get("/api/models/comparison", tags=["Modèles"])
async def models_comparison(request: Request) -> dict[str, Any]:
    return get_service(request).comparison()


@app.get("/api/models/metrics", tags=["Modèles"])
async def models_metrics(request: Request) -> dict[str, Any]:
    return get_service(request).metrics()


@app.get("/api/models/confusion/{model}", tags=["Modèles"])
async def models_confusion(model: str, request: Request) -> dict[str, Any]:
    result = get_service(request).confusion(model)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=(
                "Matrice introuvable. Modèles valides : logistic_regression, svm_rbf, "
                "random_forest, xgboost, mlp."
            ),
        )
    return result


@app.get("/api/models/importance", tags=["Modèles"])
async def models_importance(request: Request) -> dict[str, Any]:
    service = get_service(request)
    return await run_in_threadpool(service.importance)


@app.get("/api/models/roc", tags=["Modèles"])
async def models_roc(request: Request) -> dict[str, Any]:
    return get_service(request).roc()


@app.get("/api/models/pr", tags=["Modèles"])
async def models_pr(request: Request) -> dict[str, Any]:
    return get_service(request).pr()


@app.get("/api/models/bilan", tags=["Modèles"])
async def models_bilan(request: Request) -> dict[str, Any]:
    service = get_service(request)
    return {"bilan": service.bilan(), "equilibrage": service.equilibrage()}


# ---------------------------------------------------------------------- machines
@app.get("/api/machines", tags=["Machines"])
async def machines(request: Request) -> dict[str, Any]:
    return get_simulator(request).machines_payload()


@app.get("/api/machines/{machine_id}/history", tags=["Machines"])
async def machine_history(
    request: Request,
    machine_id: str,
    limit: int = Query(120, ge=10, le=1000),
) -> dict[str, Any]:
    simulator = get_simulator(request)
    if machine_id not in simulator.machines:
        raise HTTPException(status_code=404, detail=f"Machine inconnue : {machine_id}")
    db: Database = request.app.state.db
    points = db.history(machine_id, limit=limit)
    return {
        "machine_id": machine_id,
        "points": points,
        "count": len(points),
    }


# ----------------------------------------------------------------------- alarmes
@app.get("/api/alarms", tags=["Alarmes"])
async def alarms(
    request: Request,
    limit: int = Query(100, ge=1, le=1000),
    severity: str | None = Query(None),
    machine_id: str | None = Query(None),
) -> dict[str, Any]:
    db: Database = request.app.state.db
    valid = {"INFO", "SURVEILLANCE", "PANNE_PREVUE"}
    if severity and severity not in valid:
        raise HTTPException(status_code=422, detail=f"Sévérité invalide : {severity}")
    return {
        "alarms": db.alarms(limit=limit, severity=severity, machine_id=machine_id),
        "counts": db.alarm_counts(),
        "note": "Seuil 0,5 ; choix du modèle descriptif sur le test (F1).",
    }


# -------------------------------------------------------------------- simulateur
@app.get("/api/simulator/status", tags=["Simulateur"])
async def simulator_status(request: Request) -> dict[str, Any]:
    return get_simulator(request).status()


@app.post("/api/simulator/control", tags=["Simulateur"])
async def simulator_control(
    payload: SimulatorControl, request: Request
) -> dict[str, Any]:
    simulator = get_simulator(request)
    if payload.interval is not None:
        simulator.set_interval(payload.interval)
    if payload.paused is not None:
        simulator.set_paused(payload.paused)
    return simulator.status()


@app.post(
    "/api/simulator/inject/{machine_id}",
    response_model=SimulatorInjectResponse,
    tags=["Simulateur"],
)
async def simulator_inject(machine_id: str, request: Request) -> dict[str, Any]:
    simulator = get_simulator(request)
    result = simulator.inject(machine_id)
    if result is None:
        raise HTTPException(status_code=404, detail=f"Machine inconnue : {machine_id}")
    return result


# ---------------------------------------------------------------- temps réel
@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket) -> None:
    await websocket.accept()
    simulator: MaintenanceSimulator = websocket.app.state.simulator
    queue = simulator.subscribe()
    try:
        await websocket.send_json(simulator.snapshot())
        while True:
            try:
                message = await asyncio.wait_for(queue.get(), timeout=25)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping", "timestamp": now_iso()})
                continue
            await websocket.send_json(message)
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # pragma: no cover - réseau
        logger.debug("WebSocket fermé : %s", exc)
    finally:
        simulator.unsubscribe(queue)


@app.get("/api/stream", tags=["Temps réel"])
async def sse_stream(request: Request) -> StreamingResponse:
    simulator: MaintenanceSimulator = request.app.state.simulator

    async def event_generator():
        queue = simulator.subscribe()
        try:
            yield f"data: {json.dumps(simulator.snapshot(), ensure_ascii=False)}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
                    continue
                yield f"data: {json.dumps(message, ensure_ascii=False)}\n\n"
        finally:
            simulator.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# -------------------------------------------------------------------- rapports
@app.get("/api/reports/zip", tags=["Rapports"])
async def reports_zip() -> Response:
    if not ARTIFACTS_DIR.exists():
        raise HTTPException(status_code=404, detail="Dossier resultats_projet absent")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(ARTIFACTS_DIR.iterdir()):
            if path.is_file():
                archive.write(path, arcname=path.name)
    buffer.seek(0)
    filename = f"predictmaint_rapports_{datetime.now(timezone.utc):%Y%m%d_%H%M}.zip"
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


if ARTIFACTS_DIR.exists():
    app.mount("/files", StaticFiles(directory=str(ARTIFACTS_DIR)), name="files")

if FRONTEND_DIST.exists():
    assets = FRONTEND_DIST / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=str(assets)), name="assets")


@app.get("/", include_in_schema=False)
async def root():
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    return JSONResponse(
        {
            "message": "PredictMaint API en ligne. Interface non compilée.",
            "docs": "/docs",
            "frontend": "cd frontend && npm install && npm run dev",
        }
    )


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    if full_path.startswith(("api/", "ws/", "files/", "docs", "openapi")):
        raise HTTPException(status_code=404, detail="Not Found")
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="Interface non compilée")
