"""
PredictMaint - Réentraînement et export des artefacts.

Reproduit la démarche du notebook `soutenance finalise.ipynb` :
  - split 80/20 stratifié (SEED=42)
  - préprocesseur (imputation + standardisation + one-hot)
  - SVMSMOTE dans le pipeline (uniquement sur le train)
  - 5 modèles comparés, Random Forest retenu sur le F1 test
  - export du pipeline retenu et des métriques/figures

Sorties supplémentaires utilisées par l'API :
  - roc_curves.csv, pr_curves.csv : courbes réelles des 5 modèles
  - importance_variables.csv : importance par permutation du modèle retenu
  - model_metadata.json : métadonnées du modèle actif

Usage :
    python train_export.py
    python train_export.py --data chemin/vers/ai4i2020.csv
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from imblearn.over_sampling import SVMSMOTE
from imblearn.pipeline import Pipeline
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline as SkPipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.svm import SVC
from xgboost import XGBClassifier

SEED = 42
THRESHOLD = 0.5
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DATA = BASE_DIR / "data" / "ai4i2020.csv"
OUT_DIR = BASE_DIR / "resultats_projet"

NUMERIC_RAW = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
]
NUM_FEATURES = NUMERIC_RAW + ["Delta temperature [K]", "Power proxy [W]"]
FEATURES = NUM_FEATURES + ["Type"]


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    data = df.copy()
    data["Delta temperature [K]"] = (
        data["Process temperature [K]"] - data["Air temperature [K]"]
    )
    data["Power proxy [W]"] = (
        data["Torque [Nm]"] * data["Rotational speed [rpm]"] * 2 * np.pi / 60
    )
    return data


def preprocessing() -> ColumnTransformer:
    return ColumnTransformer(
        [
            (
                "num",
                SkPipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                NUM_FEATURES,
            ),
            (
                "cat",
                SkPipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "onehot",
                            OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                        ),
                    ]
                ),
                ["Type"],
            ),
        ],
        sparse_threshold=0,
    )


def build_pipeline(estimator) -> Pipeline:
    return Pipeline(
        [("preprocess", preprocessing()), ("balance", SVMSMOTE(random_state=SEED, k_neighbors=3, m_neighbors=5)), ("model", estimator)]
    )


def make_models() -> dict:
    return {
        "Logistic Regression": LogisticRegression(max_iter=1500, random_state=SEED),
        "SVM RBF": SVC(C=1, kernel="rbf", probability=True, random_state=SEED),
        "Random Forest": RandomForestClassifier(
            n_estimators=200, min_samples_leaf=2, random_state=SEED, n_jobs=-1
        ),
        "XGBoost": XGBClassifier(
            n_estimators=200,
            max_depth=4,
            learning_rate=0.05,
            subsample=0.9,
            colsample_bytree=0.9,
            eval_metric="logloss",
            random_state=SEED,
            n_jobs=2,
        ),
        "MLP": MLPClassifier(
            hidden_layer_sizes=(64, 32),
            max_iter=350,
            early_stopping=True,
            random_state=SEED,
        ),
    }


def downsample(x: np.ndarray, y: np.ndarray, max_points: int = 240):
    if len(x) <= max_points:
        return x, y
    idx = np.unique(np.linspace(0, len(x) - 1, max_points).astype(int))
    return x[idx], y[idx]


def load_dataset(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Dataset introuvable : {path}")
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]
    if "Machine failure" not in df.columns:
        raise ValueError("Colonne cible 'Machine failure' absente du dataset.")
    return df


def main() -> int:
    parser = argparse.ArgumentParser(description="Réentraîne et exporte PredictMaint.")
    parser.add_argument("--data", type=Path, default=DEFAULT_DATA, help="Chemin du CSV AI4I 2020")
    parser.add_argument("--out", type=Path, default=OUT_DIR, help="Dossier de sortie")
    args = parser.parse_args()

    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    print("=" * 72)
    print("PredictMaint - entraînement et export")
    print("=" * 72)
    df = load_dataset(args.data)
    data = build_features(df)
    X = data[FEATURES].copy()
    y = data["Machine failure"].astype(int)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=SEED
    )
    print(f"Train : {X_train.shape} | Test : {X_test.shape} | prévalence test : {y_test.mean():.2%}")

    comparison_rows: list[dict] = []
    predictions: dict[str, np.ndarray] = {}
    probabilities: dict[str, np.ndarray] = {}
    trained: dict[str, Pipeline] = {}
    roc_rows: list[dict] = []
    pr_rows: list[dict] = []

    for name, estimator in make_models().items():
        print(f"\n>>> Entraînement : {name}")
        started = time.perf_counter()
        pipeline = build_pipeline(estimator)
        pipeline.fit(X_train, y_train)
        elapsed = time.perf_counter() - started
        proba = pipeline.predict_proba(X_test)[:, 1]
        pred = (proba >= THRESHOLD).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_test, pred, labels=[0, 1]).ravel()
        row = {
            "Modèle": name,
            "SVMSMOTE": True,
            "Accuracy": accuracy_score(y_test, pred),
            "Precision": precision_score(y_test, pred, zero_division=0),
            "Recall": recall_score(y_test, pred, zero_division=0),
            "F1-score": f1_score(y_test, pred, zero_division=0),
            "ROC-AUC": roc_auc_score(y_test, proba),
            "Average Precision": average_precision_score(y_test, proba),
            "TN": int(tn),
            "FP": int(fp),
            "FN": int(fn),
            "TP": int(tp),
        }
        comparison_rows.append(row)
        trained[name] = pipeline
        predictions[name] = pred
        probabilities[name] = proba
        print(
            f"    F1={row['F1-score']:.4f} | Recall={row['Recall']:.4f} | "
            f"Precision={row['Precision']:.4f} | AUC={row['ROC-AUC']:.4f} | {elapsed:.1f}s"
        )

        fpr, tpr, _ = roc_curve(y_test, proba)
        fpr, tpr = downsample(fpr, tpr)
        roc_rows.extend({"Modèle": name, "FPR": float(a), "TPR": float(b)} for a, b in zip(fpr, tpr))
        precision, recall, _ = precision_recall_curve(y_test, proba)
        precision, recall = downsample(precision, recall)
        pr_rows.extend(
            {"Modèle": name, "Recall": float(a), "Precision": float(b)}
            for a, b in zip(recall, precision)
        )

    comparison = pd.DataFrame(comparison_rows)
    selected_name = str(comparison.sort_values("F1-score", ascending=False).iloc[0]["Modèle"])
    final_model = trained[selected_name]
    final_proba = probabilities[selected_name]
    final_pred = predictions[selected_name]
    print(f"\nModèle retenu (F1 test) : {selected_name}")

    tn, fp, fn, tp = confusion_matrix(y_test, final_pred, labels=[0, 1]).ravel()
    metrics = pd.Series(
        {
            "Accuracy": accuracy_score(y_test, final_pred),
            "Précision": precision_score(y_test, final_pred, zero_division=0),
            "Rappel": recall_score(y_test, final_pred, zero_division=0),
            "F1": f1_score(y_test, final_pred, zero_division=0),
            "ROC-AUC": roc_auc_score(y_test, final_proba),
            "Average Precision": average_precision_score(y_test, final_proba),
        },
        name="Valeur",
    )
    bilan = pd.DataFrame(
        {
            "Indicateur": [
                "Pannes détectées (TP)",
                "Pannes manquées (FN)",
                "Fausses alertes (FP)",
                "Normaux correctement identifiés (TN)",
                "Prévalence des pannes (%)",
            ],
            "Valeur": [tp, fn, fp, tn, round(100 * y_test.mean(), 2)],
        }
    )
    equilibrage = pd.DataFrame(
        {
            "Classe": ["Normal (0)", "Défaillance (1)"],
            "Avant SVMSMOTE": [int((y_train == 0).sum()), int((y_train == 1).sum())],
            "Après SVMSMOTE": [int((y_train == 0).sum()), int((y_train == 1).sum())],
        }
    )
    equilibrage["Avant (%)"] = (
        100 * equilibrage["Avant SVMSMOTE"] / equilibrage["Avant SVMSMOTE"].sum()
    ).round(2)
    equilibrage["Après (%)"] = (
        100 * equilibrage["Après SVMSMOTE"] / equilibrage["Après SVMSMOTE"].sum()
    ).round(2)
    # SVMSMOTE sur-échantillonne la classe minoritaire jusqu'à la classe majoritaire.
    n_majority = int(equilibrage.loc[0, "Avant SVMSMOTE"])
    equilibrage.loc[0, "Après SVMSMOTE"] = n_majority
    equilibrage.loc[1, "Après SVMSMOTE"] = n_majority
    equilibrage["Après (%)"] = 50.0

    print("\nCalcul de l'importance par permutation (modèle retenu)...")
    n_importance = min(800, len(X_test))
    X_imp = X_test.sample(n=n_importance, random_state=SEED)
    y_imp = y_test.loc[X_imp.index]
    importance = permutation_importance(
        final_model,
        X_imp,
        y_imp,
        n_repeats=3,
        scoring="average_precision",
        random_state=SEED,
        n_jobs=1,
    )
    importance_df = (
        pd.DataFrame(
            {
                "Variable": X_test.columns,
                "Importance moyenne": importance.importances_mean,
                "Écart-type": importance.importances_std,
            }
        )
        .sort_values("Importance moyenne", ascending=False)
        .reset_index(drop=True)
    )

    roc_df = pd.DataFrame(roc_rows)
    pr_df = pd.DataFrame(pr_rows)
    metadata = {
        "selected_model": selected_name,
        "threshold": THRESHOLD,
        "seed": SEED,
        "test_size": int(len(y_test)),
        "train_size": int(len(y_train)),
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "features": FEATURES,
        "metrics": {k: float(v) for k, v in metrics.items()},
        "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)},
        "note": "Seuil 0,5 ; choix du modèle descriptif sur le test (F1).",
    }

    print("\nÉcriture des artefacts...")
    comparison.to_csv(out_dir / "comparaison_5_modeles_test.csv", index=False)
    metrics.to_csv(out_dir / "metriques_test.csv")
    bilan.to_csv(out_dir / "bilan_metier.csv", index=False)
    equilibrage.to_csv(out_dir / "equilibrage_avant_apres_svmsmote.csv", index=False)
    for name, pred in predictions.items():
        slug = name.lower().replace(" ", "_").replace("-", "_")
        pd.DataFrame(
            confusion_matrix(y_test, pred, labels=[0, 1]),
            index=["Reel_Normal", "Reel_Panne"],
            columns=["Predit_Normal", "Predit_Panne"],
        ).to_csv(out_dir / f"matrice_{slug}.csv")
    roc_df.to_csv(out_dir / "roc_curves.csv", index=False)
    pr_df.to_csv(out_dir / "pr_curves.csv", index=False)
    importance_df.to_csv(out_dir / "importance_variables.csv", index=False)
    (out_dir / "model_metadata.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    joblib.dump(final_model, out_dir / "modele_retenu.joblib")
    print(f"Modèle et artefacts enregistrés dans : {out_dir.resolve()}")
    print("Terminé.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
