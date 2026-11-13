"""
Vérification navigateur de PredictMaint (Playwright + Chrome système).

- capture 1600x900 de chacune des 7 pages
- vérifie l'absence de documentation API dans l'IHM
- vérifie les tailles de police calculées (>= 14 px) et les familles locales
- teste le flux LIVE, le changement de cadence, l'injection de panne
- teste le formulaire de prédiction alimenté par une mesure live
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8000"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
OUT = Path(__file__).resolve().parent / "captures"
OUT.mkdir(exist_ok=True)

PAGES = [
    ("01_supervision", "/", 6500),
    ("02_machines", "/machines", 3000),
    ("03_prediction", "/prediction", 2500),
    ("04_modeles", "/modeles", 5500),
    ("05_alarmes", "/alarmes", 3000),
    ("06_rapports", "/rapports", 3000),
    ("07_parametres", "/parametres", 3000),
]

FORBIDDEN = ["/api/", "Swagger", "ReDoc", "Endpoint", "Journal API", "/docs"]
FORBIDDEN_RE = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE|WS)\s+/")

AUDIT_JS = r"""
() => {
  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const offenders = [];
  const families = {};
  let textCount = 0;
  let minSize = null;
  let minText = '';
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const direct = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' ');
    if (!direct) continue;
    const style = getComputedStyle(el);
    const size = parseFloat(style.fontSize);
    if (!Number.isFinite(size)) continue;
    textCount += 1;
    if (minSize === null || size < minSize) {
      minSize = size;
      minText = direct.slice(0, 90);
    }
    if (size < 13.9) {
      offenders.push({
        tag: el.tagName,
        size,
        text: direct.slice(0, 90),
        className: String(el.className || '').slice(0, 120),
      });
    }
    const family = style.fontFamily;
    families[family] = (families[family] || 0) + 1;
  }
  const bodyText = document.body.innerText || '';
  const forbidden = [];
  const needles = ['/api/', 'Swagger', 'ReDoc', 'Endpoint', 'Journal API', '/docs'];
  for (const needle of needles) {
    if (bodyText.includes(needle)) forbidden.push(needle);
  }
  const httpRe = /\b(GET|POST|PUT|PATCH|DELETE|WS)\s+\//;
  if (httpRe.test(bodyText)) forbidden.push('verbe HTTP + route');
  const numEl = document.querySelector('.num');
  return {
    textCount,
    minFontSize: minSize,
    minText,
    offenders: offenders.slice(0, 20),
    offenderCount: offenders.length,
    families,
    htmlFontSize: getComputedStyle(document.documentElement).fontSize,
    bodyFontFamily: getComputedStyle(document.body).fontFamily,
    numFontFamily: numEl ? getComputedStyle(numEl).fontFamily : null,
    interLoaded: document.fonts.check('16px Inter'),
    jetbrainsLoaded: document.fonts.check('16px "JetBrains Mono"'),
    forbidden,
    bodyExcerpt: bodyText.slice(0, 260).replace(/\s+/g, ' '),
  };
}
"""


def get_json(path: str) -> dict:
    with urllib.request.urlopen(BASE + path, timeout=20) as response:  # noqa: S310
        return json.loads(response.read().decode("utf-8"))


def attach(page, errors, label):
    page.on(
        "console",
        lambda msg: errors.append(f"[{label}] console.{msg.type}: {msg.text}")
        if msg.type == "error"
        else None,
    )
    page.on("pageerror", lambda exc: errors.append(f"[{label}] pageerror: {exc}"))
    page.on(
        "requestfailed",
        lambda req: errors.append(f"[{label}] requestfailed: {req.url} {req.failure}"),
    )


def audit(page, report, name):
    data = page.evaluate(AUDIT_JS)
    report["pages"][name].update(
        {
            "h1": page.locator("h1").first.inner_text() if page.locator("h1").count() else None,
            "panels": page.locator("section.panel").count(),
            "texts": data["textCount"],
            "min_font_size": data["minFontSize"],
            "min_font_text": data["minText"],
            "small_text_count": data["offenderCount"],
            "small_text_samples": data["offenders"],
            "font_families": data["families"],
            "html_font_size": data["htmlFontSize"],
            "body_font_family": data["bodyFontFamily"],
            "num_font_family": data["numFontFamily"],
            "inter_loaded": data["interLoaded"],
            "jetbrains_loaded": data["jetbrainsLoaded"],
            "forbidden_text": data["forbidden"],
        }
    )
    return data


def fail(errors, message):
    errors.append(message)


def main() -> int:
    errors: list[str] = []
    report: dict = {
        "viewport": "1600x900",
        "base": BASE,
        "pages": {},
        "checks": {},
        "console_errors": errors,
    }

    for old in OUT.glob("*.png"):
        old.unlink()

    with sync_playwright() as p:
        launch_kwargs = {"headless": True, "args": ["--disable-gpu"]}
        if Path(CHROME).exists():
            launch_kwargs["executable_path"] = CHROME
        browser = p.chromium.launch(**launch_kwargs)
        context = browser.new_context(
            viewport={"width": 1600, "height": 900},
            locale="fr-FR",
            device_scale_factor=1,
            reduced_motion="reduce",
        )
        page = context.new_page()
        attach(page, errors, "nav")

        # ---------------------------------------------------------- supervision
        page.goto(BASE + "/", wait_until="networkidle", timeout=45000)
        page.wait_for_timeout(6000)
        supervision = page.evaluate(AUDIT_JS)
        header = page.locator("header.fixed").inner_text()
        machine_count_api = len(get_json("/api/machines")["machines"])
        report["checks"]["supervision"] = {
            "header": header,
            "live_label": "LIVE" in header,
            "connected_label": "Connecté" in header or "Hors ligne" in header,
            "machine_cards": page.locator("button[aria-pressed]").count(),
            "machines_api": machine_count_api,
            "kpi_count": page.locator(".stat-value").count(),
            "alarm_rows": page.locator("text=Journal des alarmes").count(),
        }
        if not report["checks"]["supervision"]["live_label"]:
            fail(errors, "[supervision] pastille LIVE absente")
        if report["checks"]["supervision"]["machine_cards"] != machine_count_api:
            fail(errors, "[supervision] cartes machines différentes de l'API")
        if report["checks"]["supervision"]["kpi_count"] != 4:
            fail(errors, "[supervision] 4 KPI attendus")
        page.screenshot(path=str(OUT / "01_supervision.png"), animations="disabled")
        report["pages"]["01_supervision"] = {"path": "/"}
        audit(page, report, "01_supervision")

        # ------------------------------------------------------------- cadence 5 s
        try:
            page.get_by_role("button", name="5 s", exact=True).click()
            page.wait_for_timeout(2200)
            header5 = page.locator("header.fixed").inner_text()
            status = get_json("/api/simulator/status")
            report["checks"]["cadence"] = {
                "header": header5,
                "interval_api": status.get("interval"),
                "live_5s": "5 s" in header5,
            }
            if status.get("interval") != 5:
                fail(errors, "[cadence] l'API n'a pas appliqué 5 s")
            if "5 s" not in header5:
                fail(errors, "[cadence] la topbar n'affiche pas 5 s")
        except Exception as exc:  # noqa: BLE001
            fail(errors, f"[cadence] {exc}")

        # ------------------------------------------------- injection de panne
        try:
            select = page.locator("select[aria-label='Machine pour injection']")
            options = select.locator("option")
            target = options.nth(min(2, options.count() - 1)).get_attribute("value")
            select.select_option(target)
            page.get_by_role("button", name="Injecter une panne").click()
            page.wait_for_timeout(5500)
            toast_text = " ".join(page.locator("[role='status']").all_inner_texts())
            alarms = get_json("/api/alarms?limit=5")["alarms"]
            report["checks"]["injection"] = {
                "machine": target,
                "toast": toast_text[:200],
                "alarms": len(alarms),
                "last_alarm": alarms[0] if alarms else None,
            }
            if "Injection" not in toast_text:
                fail(errors, "[injection] toast de confirmation absent")
            if not any(alarm.get("machine_id") == target for alarm in alarms):
                fail(errors, "[injection] aucune alarme pour la machine ciblée")
            page.screenshot(path=str(OUT / "08_supervision_injection.png"), animations="disabled")
        except Exception as exc:  # noqa: BLE001
            fail(errors, f"[injection] {exc}")

        # retour à la cadence de démonstration
        try:
            page.get_by_role("button", name="2 s", exact=True).click()
            page.wait_for_timeout(1200)
            report["checks"]["cadence"]["restored"] = get_json("/api/simulator/status").get(
                "interval"
            )
        except Exception as exc:  # noqa: BLE001
            fail(errors, f"[cadence restore] {exc}")

        # ------------------------------------------------------------- pages
        for name, path, wait in PAGES[1:]:
            page.goto(BASE + path, wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(wait)
            report["pages"][name] = {"path": path}
            data = audit(page, report, name)
            body = page.locator("body").inner_text()
            if "NaN" in body or "undefined" in body:
                fail(errors, f"[{name}] valeur NaN/undefined visible")
            if data["offenderCount"]:
                fail(errors, f"[{name}] {data['offenderCount']} texte(s) < 14 px")
            if data["forbidden"]:
                fail(errors, f"[{name}] documentation API visible : {data['forbidden']}")
            page.screenshot(path=str(OUT / f"{name}.png"), animations="disabled")

        # -------------------------------------------------- formulaire de prédiction
        try:
            page.goto(BASE + "/prediction", wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(2500)
            page.get_by_role("button", name="Charger", exact=True).wait_for(
                state="visible", timeout=15000
            )
            page.wait_for_timeout(400)
            page.get_by_role("button", name="Charger", exact=True).click()
            page.wait_for_timeout(600)
            hydrated = page.evaluate(
                """() => {
                  const ids = ['air_temperature','process_temperature','rotational_speed','torque','tool_wear'];
                  return ids.every((id) => {
                    const el = document.getElementById(id);
                    return el && String(el.value).trim() !== '';
                  });
                }"""
            )
            page.get_by_role("button", name="Lancer la prédiction").click()
            page.wait_for_timeout(3000)
            body = page.locator("body").inner_text()
            result_visible = "Résultat du modèle" in body and "Probabilité de panne" in body
            report["checks"]["prediction"] = {
                "live_measure_hydrated": hydrated,
                "result_visible": result_visible,
                "body_excerpt": body[:400].replace("\n", " | "),
            }
            if not hydrated:
                fail(errors, "[prediction] la mesure live n'a pas rempli le formulaire")
            if not result_visible:
                fail(errors, "[prediction] résultat du modèle absent")
            page.screenshot(path=str(OUT / "09_prediction_resultat.png"), animations="disabled")
            audit(page, report, "09_prediction_resultat")
        except Exception as exc:  # noqa: BLE001
            fail(errors, f"[prediction] {exc}")

        # ------------------------------------------------------ modèles & métriques
        try:
            page.goto(BASE + "/modeles", wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(5200)
            comparison = get_json("/api/models/comparison")
            rows = page.locator("section.panel table.hmi-table tbody tr").count()
            body = page.locator("body").inner_text()
            report["checks"]["modeles"] = {
                "comparison_rows_ui": rows,
                "comparison_models_api": len(comparison.get("models", [])),
                "selected_api": comparison.get("selected"),
                "retenu_visible": "retenu" in body,
            }
            if rows != len(comparison.get("models", [])):
                fail(errors, "[modeles] lignes de comparaison différentes de l'API")
            if not comparison.get("selected"):
                fail(errors, "[modeles] aucun modèle retenu dans l'API")
            page.screenshot(path=str(OUT / "10_modeles_verification.png"), animations="disabled")
        except Exception as exc:  # noqa: BLE001
            fail(errors, f"[modeles] {exc}")

        # ------------------------------------------------------------- alarmes
        try:
            page.goto(BASE + "/alarmes", wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(3000)
            rows = page.locator("table.hmi-table tbody tr").count()
            body = page.locator("body").inner_text()
            report["checks"]["alarmes"] = {
                "table_rows": rows,
                "has_events": "Événements" in body,
                "filters": page.locator("select").count(),
            }
            if rows < 1:
                fail(errors, "[alarmes] aucune alarme affichée après injection")
            page.screenshot(path=str(OUT / "11_alarmes_verification.png"), animations="disabled")
        except Exception as exc:  # noqa: BLE001
            fail(errors, f"[alarmes] {exc}")

        # ------------------------------------------------------------- rapports
        try:
            page.goto(BASE + "/rapports", wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(3000)
            files = get_json("/api/reports")
            links = page.locator("a[href^='/files/']").count()
            report["checks"]["rapports"] = {
                "files_api": files.get("count"),
                "file_links_ui": links,
                "zip_link": page.locator("a[href='/api/reports/zip']").count(),
            }
            if links < 1:
                fail(errors, "[rapports] aucun artefact listé")
            if links != files.get("count"):
                fail(errors, "[rapports] liens différents de la liste backend")
            page.screenshot(path=str(OUT / "12_rapports_verification.png"), animations="disabled")
        except Exception as exc:  # noqa: BLE001
            fail(errors, f"[rapports] {exc}")

        # ------------------------------------------------------------ paramètres
        try:
            page.goto(BASE + "/parametres", wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(3200)
            body = page.locator("body").inner_text()
            config = get_json("/api/config")
            report["checks"]["parametres"] = {
                "threshold_rows": len(config.get("statuses", [])),
                "has_api_docs": any(
                    needle in body
                    for needle in ["Swagger", "ReDoc", "Endpoints", "/api/", "Journal API"]
                ),
                "has_sensor_table": "Gammes & bornes capteurs" in body,
            }
            if report["checks"]["parametres"]["has_api_docs"]:
                fail(errors, "[parametres] documentation API visible")
            if not report["checks"]["parametres"]["has_sensor_table"]:
                fail(errors, "[parametres] tableau des bornes capteurs absent")
            page.screenshot(path=str(OUT / "13_parametres_verification.png"), animations="disabled")
        except Exception as exc:  # noqa: BLE001
            fail(errors, f"[parametres] {exc}")

        # --------------------------------------------------------- synthèse polices
        all_pages = report["pages"]
        small = {name: data.get("small_text_count", 0) for name, data in all_pages.items()}
        forbidden = {name: data.get("forbidden_text", []) for name, data in all_pages.items()}
        report["checks"]["typography"] = {
            "html_font_size": next(
                (data.get("html_font_size") for data in all_pages.values()), None
            ),
            "min_font_size": min(
                (data.get("min_font_size") or 99) for data in all_pages.values()
            ),
            "small_text": small,
            "inter_loaded": all(data.get("inter_loaded") for data in all_pages.values()),
            "jetbrains_loaded": all(
                data.get("jetbrains_loaded") for data in all_pages.values()
            ),
            "num_families": sorted(
                {
                    data.get("num_font_family")
                    for data in all_pages.values()
                    if data.get("num_font_family")
                }
            ),
        }
        report["checks"]["forbidden_text"] = forbidden
        report["checks"]["ok"] = not errors

        report["final_url"] = page.url
        context.close()
        browser.close()

    (OUT / "rapport_verification.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
