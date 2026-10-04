"""Five languages, end to end: the content files are complete, and the API
serves each language rather than silently falling back to English."""

import json
from pathlib import Path

import pytest

from app.content import LANGS, disease_info, translations
from app.cycle import STAGE_ORDER, stage_labels
from app.models import Scan

FIELDS = {"name", "symptoms", "organic", "chemical", "prevention"}
INDIAN = [lang for lang in LANGS if lang != "en"]
# How the disease forms. Every diseased class has it; a healthy one has nothing to form.
DISEASED = [k for k, v in disease_info().items() if not v["is_healthy"]]


@pytest.mark.parametrize("lang", INDIAN)
def test_every_class_is_translated(lang):
    """A missing class would fall back to English mid-page, which a reader of
    the other language may not be able to follow."""
    english = disease_info()
    strings = translations(lang)
    assert set(strings) == set(english), f"{lang}: {set(english) ^ set(strings)}"
    for disease_id, entry in strings.items():
        expected = FIELDS | ({"formation"} if disease_id in DISEASED else set())
        assert set(entry) == expected, f"{lang}/{disease_id}"
        for field in expected:
            assert entry[field].strip(), f"{lang}/{disease_id}/{field} is empty"
            assert entry[field] != english[disease_id][field], f"{lang}/{disease_id}/{field} is English"


def test_every_disease_explains_how_it_forms():
    for disease_id in DISEASED:
        assert len(disease_info()[disease_id].get("formation", "")) > 80, disease_id


@pytest.mark.parametrize("lang", LANGS)
def test_formation_is_served_in_each_language(client, lang):
    detail = client.get("/api/diseases/Tomato___Late_blight", params={"lang": lang}).json()
    expected = (disease_info() if lang == "en" else translations(lang))["Tomato___Late_blight"]["formation"]
    assert detail["formation"] == expected
    healthy = client.get("/api/diseases/Tomato___healthy", params={"lang": lang}).json()
    assert healthy["formation"] is None


def test_scan_info_carries_formation(client, db_session):
    s = Scan(image_key="scans/z/image.jpg", image_sha256="c" * 64,
             model_version="efficientnet_b0@abc", disease_id="Potato___Early_blight",
             confidence=0.99, top3=[], status="ok")
    db_session.add(s)
    db_session.commit()
    body = client.get(f"/api/scans/{s.id}", params={"lang": "kn"}).json()
    assert body["info"]["formation"] == translations("kn")["Potato___Early_blight"]["formation"]


@pytest.mark.parametrize("lang", ["hi", "ta", "kn"])
def test_every_stage_has_a_label(lang):
    labels = stage_labels()[lang]
    assert set(labels) == set(STAGE_ORDER)
    assert all(label.strip() for label in labels.values())


@pytest.mark.parametrize("lang,name", [
    ("hi", "सेब की पपड़ी (स्कैब)"),
    ("ta", "ஆப்பிள் சொறி நோய் (ஸ்கேப்)"),
    ("kn", "ಸೇಬಿನ ಹುರುಪು ರೋಗ (ಸ್ಕ್ಯಾಬ್)"),
])
def test_disease_detail_in_each_language(client, lang, name):
    body = client.get("/api/diseases/Apple___Apple_scab", params={"lang": lang}).json()
    assert body["name"] == name
    assert body["plant"] == "Apple", "plant stays the English key the UI translates"
    stage = body["cycle"]["stages"][0]
    assert stage["label"] == stage_labels()[lang][stage["id"]]


def test_disease_list_names_follow_the_language(client):
    rows = client.get("/api/diseases", params={"has_cycle": True, "lang": "kn"}).json()
    scab = next(r for r in rows if r["id"] == "Apple___Apple_scab")
    assert scab["name"] == translations("kn")["Apple___Apple_scab"]["name"]


def test_scan_top3_carries_names_in_the_language(client, db_session):
    s = Scan(image_key="scans/y/image.jpg", image_sha256="b" * 64,
             model_version="efficientnet_b0@abc", disease_id=None, confidence=0.2,
             top3=[{"disease_id": "Tomato___Late_blight", "confidence": 0.2},
                   {"disease_id": "Potato___Late_blight", "confidence": 0.1}],
             status="uncertain")
    db_session.add(s)
    db_session.commit()
    body = client.get(f"/api/scans/{s.id}", params={"lang": "ta"}).json()
    assert body["status"] == "uncertain" and body["info"] is None
    assert [t["name"] for t in body["top3"]] == [
        translations("ta")["Tomato___Late_blight"]["name"],
        translations("ta")["Potato___Late_blight"]["name"],
    ]


def test_unsupported_language_is_rejected(client):
    assert client.get("/api/diseases/Apple___Apple_scab", params={"lang": "fr"}).status_code == 422


def test_frontend_offers_the_same_languages():
    """The web app's language list and the API's must not drift apart."""
    i18n = Path(__file__).resolve().parents[3] / "frontend" / "src" / "i18n.js"
    offered = {line.split("'")[1] for line in i18n.read_text().splitlines()
               if line.strip().startswith("{ code: '")}
    assert offered == set(LANGS)


def test_content_files_are_valid_json():
    data = Path(__file__).resolve().parents[3] / "data"
    for lang in INDIAN:
        json.loads((data / f"translations_{lang}.json").read_text())
