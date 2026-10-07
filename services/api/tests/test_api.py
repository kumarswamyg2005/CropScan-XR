"""API surface: diseases, cycle, ledger endpoints, scans and the legacy shims."""

import io
import json

import numpy as np
import pytest
from PIL import Image
from sqlalchemy import select

from app import ledger as chain
from app.inference import Prediction
from app.models import LedgerEntry, Video


def png_bytes(size=(64, 64), colour=(40, 120, 60)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, colour).save(buf, format="PNG")
    return buf.getvalue()


# --- health -----------------------------------------------------------------

def test_healthz_reports_degraded_without_a_model(client):
    body = client.get("/healthz").json()
    assert body["model_loaded"] is False
    assert body["status"] == "degraded"
    assert body["db_reachable"] is True
    assert body["cycles_loaded"] == 14


# --- diseases ---------------------------------------------------------------

def test_list_diseases_returns_all_68(client):
    """38 PlantVillage classes, healthy orange and squash, and 28 for rice, wheat,
    cotton, sugarcane, chilli and mango."""
    rows = client.get("/api/diseases").json()
    assert len(rows) == 68


def test_list_diseases_filters_by_crop(client):
    rows = client.get("/api/diseases", params={"crop": "Tomato"}).json()
    assert rows and all(r["plant"] == "Tomato" for r in rows)


def test_has_cycle_flag_matches_the_knowledge_base(client):
    rows = {r["id"]: r for r in client.get("/api/diseases").json()}
    assert rows["Apple___Apple_scab"]["has_cycle"] is True
    assert rows["Apple___healthy"]["has_cycle"] is False
    assert rows["Orange___Haunglongbing_(Citrus_greening)"]["has_cycle"] is False


def test_filter_by_has_cycle(client):
    rows = client.get("/api/diseases", params={"has_cycle": True}).json()
    assert len(rows) == 14


def test_disease_detail_includes_content_and_cycle(client):
    body = client.get("/api/diseases/Apple___Apple_scab").json()
    assert body["name"] == "Apple Scab"
    assert body["symptoms"]
    assert body["cycle"]["pathogen"]["name"] == "Venturia inaequalis"
    assert len(body["cycle"]["stages"]) == 9


def test_disease_detail_in_telugu(client):
    body = client.get("/api/diseases/Apple___Apple_scab", params={"lang": "te"}).json()
    stage = body["cycle"]["stages"][0]
    assert stage["label"] == stage["label_te"]


def test_healthy_disease_returns_null_cycle(client):
    """Not a 404. The UI switches to browse mode on null, and an error state
    would read as something being wrong when nothing is."""
    body = client.get("/api/diseases/Apple___healthy/cycle").json()
    assert body["cycle"] is None


def test_unknown_disease_is_404(client):
    assert client.get("/api/diseases/Kiwi___mystery").status_code == 404


def test_cycle_endpoint_returns_the_gating_thresholds(client):
    """The three dials in the Infection Theatre read these."""
    body = client.get("/api/diseases/Tomato___Leaf_Mold/cycle").json()
    stage = next(s for s in body["cycle"]["stages"] if s["id"] == "prepenetration")
    assert stage["requires"]["rh_pct"] == [85.0, 100.0]


# --- ledger -----------------------------------------------------------------

def append_some(db, n=3):
    for i in range(n):
        chain.append(db, "scan.created", f"scan-{i}",
                     {"scan_id": f"scan-{i}", "disease_id": "Apple___Apple_scab"})
    db.commit()


def test_ledger_starts_empty_and_verifies(client):
    body = client.get("/api/ledger/verify").json()
    assert body["ok"] is True
    assert body["checked"] == 0


def test_ledger_reads_back_in_sequence(client, db_session):
    append_some(db_session, 5)
    rows = client.get("/api/ledger").json()
    assert [r["seq"] for r in rows] == [1, 2, 3, 4, 5]
    assert rows[0]["prev_hash"] == chain.GENESIS_HASH


def test_ledger_pagination(client, db_session):
    append_some(db_session, 5)
    rows = client.get("/api/ledger", params={"since_seq": 3, "limit": 2}).json()
    assert [r["seq"] for r in rows] == [4, 5]


def test_verify_catches_a_tampered_payload(client, db_session):
    """This is the demo. docs/demo.md does the same edit in psql."""
    append_some(db_session, 4)
    assert client.get("/api/ledger/verify").json()["ok"] is True

    victim = db_session.execute(
        select(LedgerEntry).where(LedgerEntry.seq == 3)
    ).scalar_one()
    victim.payload = {"scan_id": "scan-2", "disease_id": "Tomato___healthy"}
    db_session.commit()

    body = client.get("/api/ledger/verify").json()
    assert body["ok"] is False
    assert body["first_break"]["seq"] == 3
    assert body["first_break"]["reason"] == "payload_modified"
    assert "edited after it was written" in body["first_break"]["detail"]


def test_verify_catches_a_deleted_entry(client, db_session):
    append_some(db_session, 4)
    victim = db_session.execute(select(LedgerEntry).where(LedgerEntry.seq == 2)).scalar_one()
    db_session.delete(victim)
    db_session.commit()

    body = client.get("/api/ledger/verify").json()
    assert body["ok"] is False
    assert body["first_break"]["reason"] == "sequence_gap"


def test_ledger_stats_expose_the_head(client, db_session):
    append_some(db_session, 3)
    body = client.get("/api/ledger/stats").json()
    assert body["entries"] == 3
    assert body["head_seq"] == 3
    assert len(body["head_hash"]) == 64


def test_merkle_root_and_inclusion_proof(client, db_session):
    append_some(db_session, 6)
    built = client.post("/api/ledger/roots/build").json()
    assert built["entry_count"] == 6

    entry = db_session.execute(select(LedgerEntry).where(LedgerEntry.seq == 4)).scalar_one()
    proof = client.get(f"/api/ledger/{entry.id}/proof").json()

    assert proof["leaf"] == entry.entry_hash
    assert proof["root"] == built["root_hash"]
    assert chain.verify_merkle_proof(proof["leaf"], proof["proof"], proof["root"])


def test_proof_for_an_unknown_entry_is_404(client):
    assert client.get("/api/ledger/nope/proof").status_code == 404


def test_ledger_rejects_an_unknown_event_type(db_session):
    with pytest.raises(ValueError):
        chain.append(db_session, "scan.deleted", "x", {})


# --- scans ------------------------------------------------------------------

def test_scan_without_a_model_returns_503(client):
    """Never a random-weight fallback. Silently returning garbage predictions
    is worse than an error."""
    r = client.post("/api/scans", files={"file": ("leaf.png", png_bytes(), "image/png")})
    assert r.status_code == 503


def test_scan_rejects_a_non_image(client):
    r = client.post("/api/scans", files={"file": ("x.png", b"not an image", "image/png")})
    assert r.status_code == 400


def test_scan_rejects_an_oversized_upload(client, monkeypatch):
    from app.config import Settings

    small = Settings(max_upload_bytes=128)
    monkeypatch.setattr("app.routers.scans.get_settings", lambda: small)
    r = client.post("/api/scans", files={"file": ("big.png", png_bytes((400, 400)), "image/png")})
    assert r.status_code == 413


@pytest.fixture
def fake_model(monkeypatch):
    def _install(status="ok", disease_id="Apple___Apple_scab", confidence=0.94):
        monkeypatch.setattr("app.storage.put", lambda key, data, ct: key)
        monkeypatch.setattr(
            "app.inference.predict",
            lambda image, allowed=None: Prediction(
                status=status,
                disease_id=disease_id,
                confidence=confidence,
                top3=[{"disease_id": disease_id or "Apple___healthy", "confidence": confidence}],
                entropy=0.1,
                model_version="convnext_tiny@abc12345",
                cam=np.linspace(0, 1, 49).reshape(7, 7).astype(np.float32)
                if status == "ok" else None,
            ),
        )
    return _install


def test_confident_scan_is_recorded_and_can_enter_the_field(client, db_session, fake_model):
    fake_model()
    r = client.post("/api/scans", files={"file": ("leaf.png", png_bytes(), "image/png")})
    assert r.status_code == 201

    body = r.json()
    assert body["status"] == "ok"
    assert body["disease_id"] == "Apple___Apple_scab"
    assert body["has_cycle"] is True
    assert body["can_enter_field"] is True
    assert body["field_blocked_reason"] is None
    assert body["gradcam_url"]
    assert body["info"]["name"] == "Apple Scab"

    entry = db_session.execute(select(LedgerEntry)).scalar_one()
    assert entry.event_type == "scan.created"
    assert entry.payload["scan_id"] == body["id"]


def test_uncertain_scan_cannot_enter_the_field(client, db_session, fake_model):
    """The worst outcome in this system is narrating a pathogen life cycle for
    a photo of someone's hand."""
    fake_model(status="uncertain", disease_id=None, confidence=0.31)
    body = client.post("/api/scans",
                       files={"file": ("x.png", png_bytes(), "image/png")}).json()

    assert body["status"] == "uncertain"
    assert body["disease_id"] is None
    assert body["can_enter_field"] is False
    assert "not confident enough" in body["field_blocked_reason"]
    assert body["gradcam_url"] is None

    entry = db_session.execute(select(LedgerEntry)).scalar_one()
    assert entry.event_type == "scan.uncertain"


def test_scan_of_a_disease_without_a_cycle_is_blocked_with_a_different_reason(
    client, fake_model
):
    fake_model(disease_id="Orange___Haunglongbing_(Citrus_greening)")
    body = client.post("/api/scans",
                       files={"file": ("x.png", png_bytes(), "image/png")}).json()
    assert body["status"] == "ok"
    assert body["can_enter_field"] is False
    assert "no disease cycle written up" in body["field_blocked_reason"]


def test_scan_can_be_fetched_by_id(client, fake_model):
    fake_model()
    created = client.post("/api/scans",
                          files={"file": ("x.png", png_bytes(), "image/png")}).json()
    fetched = client.get(f"/api/scans/{created['id']}").json()
    assert fetched["id"] == created["id"]
    assert fetched["disease_id"] == created["disease_id"]


def test_unknown_scan_is_404(client):
    assert client.get("/api/scans/nope").status_code == 404


def test_scan_and_ledger_entry_commit_together(client, db_session, fake_model):
    """A diagnosis without a ledger record would break the one property this
    system sells."""
    fake_model()
    for _ in range(3):
        client.post("/api/scans", files={"file": ("x.png", png_bytes(), "image/png")})
    assert len(list(db_session.execute(select(LedgerEntry)).scalars())) == 3
    assert client.get("/api/ledger/verify").json()["ok"] is True


# --- videos and legacy ------------------------------------------------------

def test_videos_filter_by_disease(client, db_session):
    db_session.add(Video(disease_id="Apple___Apple_scab", kind="field360",
                         title="Scab in the orchard", hls_key="v/1/index.m3u8",
                         projection="equirect", stereo="top_bottom", language="en"))
    db_session.commit()

    rows = client.get("/api/videos", params={"disease_id": "Apple___Apple_scab"}).json()
    assert len(rows) == 1
    assert rows[0]["projection"] == "equirect"
    assert rows[0]["hls_url"].startswith("https://signed/")
    assert client.get("/api/videos", params={"disease_id": "Tomato___healthy"}).json() == []


@pytest.mark.parametrize("path,target", [
    ("/diseases", "/api/diseases"),
    ("/treatment/Apple___Apple_scab", "/api/diseases/Apple___Apple_scab"),
])
def test_legacy_get_shims_are_308(client, path, target):
    r = client.get(path, follow_redirects=False)
    assert r.status_code == 308
    assert r.headers["location"] == target


def test_legacy_predict_shim_preserves_the_post(client):
    """308, not 302: the method and body must survive so the deployed Vercel
    frontend keeps working through the cutover."""
    r = client.post("/predict", files={"file": ("x.png", png_bytes(), "image/png")},
                    follow_redirects=False)
    assert r.status_code == 308
    assert r.headers["location"] == "/api/scans"


def test_storage_failure_is_a_clear_error_with_cors(client, monkeypatch):
    """Not a bare 500: that reaches the browser without CORS headers and reads
    as a network failure. The ledger stays untouched."""
    from app import inference

    monkeypatch.setattr(inference, "predict", lambda image, allowed=None: inference.Prediction(
        status="ok", disease_id="Apple___Apple_scab", confidence=0.99, top3=[],
        entropy=0.0, model_version="test@0", cam=None))

    def broken_put(*a, **k):
        raise ConnectionError("bucket unreachable")
    monkeypatch.setattr("app.storage.put", broken_put)

    r = client.post("/api/scans", files={"file": ("leaf.png", png_bytes(), "image/png")},
                    headers={"Origin": "https://example.org"})
    assert r.status_code == 502
    assert "storage" in r.json()["detail"].lower()
    assert r.headers.get("access-control-allow-origin") in ("*", "https://example.org")
    assert client.get("/api/ledger/stats").json()["entries"] == 0


def test_root_points_to_health_and_docs(client):
    body = client.get("/").json()
    assert body == {"service": "CropScan API", "health": "/healthz", "docs": "/docs"}


def test_not_a_leaf_is_never_a_diagnosis(monkeypatch):
    """However sure the model is that a photo is not a leaf, that is not a disease."""
    import numpy as np
    from PIL import Image
    from app import inference

    labels = ["Apple___Apple_scab", "Apple___healthy", inference.NOT_A_LEAF]

    class Session:
        def __init__(self, top):
            self.top = top

        def run(self, _, feeds):
            logits = np.full((1, 3), -5.0, dtype=np.float32)
            logits[0, self.top] = 10.0
            return logits, np.zeros((1, 3, 7, 7), dtype=np.float32)

    meta = {"model_name": "t", "input_size": 32, "resize_ratio": 1.0, "num_classes": 3,
            "normalization": {"mean": [0.5] * 3, "std": [0.5] * 3},
            "confidence_threshold": 0.2, "entropy_threshold": 0.5}
    img = Image.new("RGB", (40, 40), "green")
    for top, status in ((2, "uncertain"), (0, "ok")):
        model = inference.LoadedModel(session=Session(top), labels=labels, meta=meta)
        monkeypatch.setattr(inference, "load_model", lambda: model)
        p = inference.predict(img)
        assert p.status == status, (top, p)
        assert (p.disease_id is None) == (status == "uncertain")


def test_a_chosen_crop_limits_the_answer_to_that_crop(monkeypatch):
    """Tomato-looking logits, but the farmer says Apple: the answer must be an apple class,
    and Not_a_leaf still competes whatever crop is chosen."""
    import numpy as np
    from PIL import Image
    from app import inference

    labels = ["Apple___Apple_scab", "Apple___healthy", "Tomato___healthy", inference.NOT_A_LEAF]

    class Session:
        def __init__(self, logits):
            self.logits = logits

        def run(self, _, feeds):
            return np.array([self.logits], dtype=np.float32), np.zeros((1, 4, 7, 7), dtype=np.float32)

    meta = {"model_name": "t", "input_size": 32, "resize_ratio": 1.0, "num_classes": 4,
            "normalization": {"mean": [0.5] * 3, "std": [0.5] * 3},
            "confidence_threshold": 0.2, "entropy_threshold": 0.9}
    img = Image.new("RGB", (40, 40), "green")
    apple = {"Apple___Apple_scab", "Apple___healthy"}
    for logits, want in (([1.0, 4.0, 9.0, -5.0], "Apple___healthy"), ([1.0, 1.0, 1.0, 9.0], inference.NOT_A_LEAF)):
        model = inference.LoadedModel(session=Session(logits), labels=labels, meta=meta)
        monkeypatch.setattr(inference, "load_model", lambda: model)
        p = inference.predict(img, allowed=apple)
        assert p.top3[0]["disease_id"] == want, p
        assert all(t["disease_id"] in apple | {inference.NOT_A_LEAF} for t in p.top3)


def test_an_unknown_crop_is_rejected(client):
    import io
    from PIL import Image
    buf = io.BytesIO(); Image.new("RGB", (40, 40), "green").save(buf, "JPEG")
    r = client.post("/api/scans?crop=Banana", files={"file": ("leaf.jpg", buf.getvalue(), "image/jpeg")})
    assert r.status_code == 422
