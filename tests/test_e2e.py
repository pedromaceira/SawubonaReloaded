import os
import base64
import cv2
import pytest
from fastapi.testclient import TestClient


_AQUI = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_AQUI)
_BACKEND = os.path.join(_ROOT, "backend")
_MODELOS = os.path.join(_BACKEND, "modelos")
_YOLO = os.path.join(_MODELOS, "yolo11n-face.pt")
_EMO = os.path.join(_MODELOS, "emotion_model.hdf5")
_IMG = os.path.join(_AQUI, "fixtures", "cara.jpg")

_RECURSOS_OK = os.path.exists(_YOLO) and os.path.exists(_EMO) and os.path.exists(_IMG)

pytestmark = [
    pytest.mark.e2e,
    pytest.mark.skipif(
        not _RECURSOS_OK,
        reason="Faltan los modelos (backend/modelos) o la imagen (tests/fixtures/cara.jpg); E2E omitido."
    ),
]

EMOCIONES = ["Enfado", "Disgusto", "Miedo", "Felicidad", "Tristeza", "Sorpresa", "Neutral"]


@pytest.fixture(scope="module")
def detector_real():
    from backend.detector import EmotionDetector
    cwd = os.getcwd()
    os.chdir(_BACKEND)
    try:
        det = EmotionDetector(
            yolo_path="modelos/yolo11n-face.pt",
            emotion_model_path="modelos/emotion_model.hdf5"
        )
    finally:
        os.chdir(cwd)
    return det


@pytest.fixture
def client_real(detector_real):
    from backend import main
    detector_real.reset_memory()
    main.detector = detector_real
    yield TestClient(main.app)
    main.detector = None


def _img_b64():
    with open(_IMG, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


# ---------- Opción 1: E2E directo del detector (inferencia real) ----------

def test_e2e_detector_detecta_cara_y_emocion(detector_real):
    detector_real.reset_memory()
    frame = cv2.imread(_IMG)
    assert frame is not None, "No se pudo leer la imagen de la cara"

    resultados = detector_real.detect_and_classify(frame)

    assert len(resultados) >= 1
    r = resultados[0]
    assert r["emotion"] in EMOCIONES
    assert len(r["box"]) == 4
    assert 0.0 <= r["confidence"] <= 1.0
    assert isinstance(r["id_tracking"], int)


def test_e2e_misma_cara_mantiene_id(detector_real):
    detector_real.reset_memory()
    frame = cv2.imread(_IMG)
    r1 = detector_real.detect_and_classify(frame)
    r2 = detector_real.detect_and_classify(frame)
    assert r1[0]["id_tracking"] == r2[0]["id_tracking"]


# ---------- Opción 2: E2E completo a través de la API ----------

def test_e2e_api_analizar(client_real):
    r = client_real.post("/analizar", json={"image_base64": _img_b64()})
    assert r.status_code == 200
    data = r.json()
    assert data["caras_detectadas"] >= 1
    assert data["analisis"][0]["emotion"] in EMOCIONES


def test_e2e_api_flujo_sesion_con_correccion(client_real):
    b64 = _img_b64()

    primera = client_real.post("/analizar", json={"image_base64": b64, "tiempo_actual": 1.0}).json()
    face_id = primera["analisis"][0]["id_tracking"]

    sid = client_real.post("/sesiones/crear", json={
        "hash_video": "e2e", "nombre_original": "cara.jpg"}).json()["id"]

    rc = client_real.post("/correcciones/guardar", json={
        "session_id": sid, "hash_video": "e2e", "id_tracking": face_id,
        "segundo_inicio": 0.0, "segundo_fin": 5.0, "emocion_corregida": "Sorpresa"})
    assert rc.status_code == 200

    client_real.post("/sesiones/guardar", json={
        "session_id": sid, "segundo_actual": 2.0, "snapshot_display": {"x": 1}})

    assert client_real.get(f"/correcciones/sesion/{sid}").json()["total"] == 1

    act = client_real.post("/sesiones/activar", json={"session_id": sid}).json()
    assert act["segundo_actual"] == 2.0

    segunda = client_real.post("/analizar", json={"image_base64": b64, "tiempo_actual": 2.0}).json()
    assert any(a.get("corregido") and a["emotion"] == "Sorpresa" for a in segunda["analisis"])