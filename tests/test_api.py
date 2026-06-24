import base64
import numpy as np
import cv2
import pytest
from fastapi.testclient import TestClient


class FakeDetector:
    def __init__(self):
        self.known = {1: [0.1, 0.2, 0.3], 2: [0.4, 0.5, 0.6]}
        self.correcciones_activas = []
        self.next_id = 3
        self.reset_llamado = False

    def reset_memory(self):
        self.correcciones_activas = []
        self.reset_llamado = True

    def obtener_embedding_por_id(self, pid):
        return self.known.get(pid)

    def agregar_correccion_memoria(self, id_tracking, segundo_inicio, segundo_fin, emocion):
        emb = self.known.get(id_tracking)
        if emb is None:
            return None
        self.correcciones_activas.append({
            "embedding": emb, "id_tracking": id_tracking,
            "inicio": segundo_inicio, "fin": segundo_fin, "emocion": emocion
        })
        return len(self.correcciones_activas) - 1

    def eliminar_correccion_memoria(self, indice):
        if 0 <= indice < len(self.correcciones_activas):
            del self.correcciones_activas[indice]
            return True
        return False

    def listar_correcciones_memoria(self):
        return [{"indice": i, "id_tracking": c["id_tracking"],
                 "segundo_inicio": c["inicio"], "segundo_fin": c["fin"],
                 "emocion_corregida": c["emocion"]}
                for i, c in enumerate(self.correcciones_activas)]

    def exportar_correcciones_memoria(self):
        return [{"embedding": c["embedding"], "id_tracking": c["id_tracking"],
                 "segundo_inicio": c["inicio"], "segundo_fin": c["fin"],
                 "emocion_corregida": c["emocion"]}
                for c in self.correcciones_activas]

    def cargar_correcciones(self, lista):
        self.correcciones_activas = [{
            "embedding": c["embedding"], "id_tracking": c.get("id_tracking"),
            "inicio": c["segundo_inicio"], "fin": c["segundo_fin"],
            "emocion": c["emocion_corregida"]
        } for c in lista]
        return len(self.correcciones_activas)

    def exportar_memoria(self):
        return {"known_faces": [{"id": k, "embedding": v} for k, v in self.known.items()],
                "next_id": self.next_id}

    def importar_memoria(self, memoria):
        self.known = {f["id"]: f["embedding"] for f in memoria.get("known_faces", [])}
        self.next_id = memoria.get("next_id", 1)

    def detect_and_classify(self, frame, is_screen_share=False, tiempo_actual=None):
        return [{"id_tracking": 1, "box": [0, 0, 10, 10], "emotion": "Felicidad",
                 "confidence": 0.9, "corregido": False}]


@pytest.fixture
def fake():
    from backend import main
    f = FakeDetector()
    main.detector = f
    yield f
    main.detector = None


@pytest.fixture
def client(fake):
    from backend import main
    return TestClient(main.app)


def _img_b64():
    dummy = np.zeros((10, 10, 3), dtype=np.uint8)
    _, buf = cv2.imencode('.jpg', dummy)
    return "data:image/jpeg;base64," + base64.b64encode(buf).decode('utf-8')


def _crear_sesion(client, hash_video="h", nombre=None):
    body = {"hash_video": hash_video, "nombre_original": "v.mp4"}
    if nombre is not None:
        body["nombre_sesion"] = nombre
    return client.post("/sesiones/crear", json=body).json()["id"]


def test_root(client):
    assert client.get("/").json() == {"status": "Servidor funcionando correctamente"}


def test_reset(client, fake):
    r = client.post("/reset")
    assert r.status_code == 200
    assert fake.reset_llamado is True


def test_analizar(client):
    r = client.post("/analizar", json={"image_base64": _img_b64()})
    assert r.status_code == 200
    data = r.json()
    assert data["caras_detectadas"] == 1
    assert data["analisis"][0]["emotion"] == "Felicidad"


def test_crear_y_listar_sesion(client):
    sid = _crear_sesion(client, "h1", "S1")
    sesiones = client.get("/sesiones/listar/h1").json()["sesiones"]
    assert len(sesiones) == 1
    assert sesiones[0]["id"] == sid
    assert sesiones[0]["nombre_sesion"] == "S1"


def test_crear_sesion_sin_nombre(client):
    sid = _crear_sesion(client, "h1b")
    sesiones = client.get("/sesiones/listar/h1b").json()["sesiones"]
    assert sesiones[0]["nombre_sesion"] == f"Sesión {sid}"


def test_guardar_y_activar_sesion_restaura_snapshot(client):
    sid = _crear_sesion(client, "h2")
    snap = {"sessionData": {"Cara 1": ["Enfado"]}, "slotsData": []}
    r = client.post("/sesiones/guardar", json={
        "session_id": sid, "segundo_actual": 30.0, "snapshot_display": snap})
    assert r.status_code == 200
    data = client.post("/sesiones/activar", json={"session_id": sid}).json()
    assert data["segundo_actual"] == 30.0
    assert data["snapshot_display"] == snap


def test_activar_sesion_inexistente_404(client):
    assert client.post("/sesiones/activar", json={"session_id": 99999}).status_code == 404


def test_eliminar_sesion(client):
    sid = _crear_sesion(client, "h3")
    assert client.delete(f"/sesiones/{sid}").status_code == 200
    assert client.get("/sesiones/listar/h3").json()["sesiones"] == []


def test_eliminar_sesion_inexistente_404(client):
    assert client.delete("/sesiones/99999").status_code == 404


def test_correccion_se_anade_a_memoria(client):
    sid = _crear_sesion(client, "h4")
    r = client.post("/correcciones/guardar", json={
        "session_id": sid, "hash_video": "h4", "id_tracking": 1,
        "segundo_inicio": 1.0, "segundo_fin": 2.0, "emocion_corregida": "Enfado"})
    assert r.status_code == 200
    assert r.json()["indice"] == 0
    activas = client.get("/correcciones/activas").json()["correcciones"]
    assert len(activas) == 1
    assert activas[0]["emocion_corregida"] == "Enfado"


def test_correccion_id_desconocido_404(client):
    sid = _crear_sesion(client, "h5")
    r = client.post("/correcciones/guardar", json={
        "session_id": sid, "hash_video": "h5", "id_tracking": 999,
        "segundo_inicio": 1.0, "segundo_fin": 2.0, "emocion_corregida": "Enfado"})
    assert r.status_code == 404


def test_correccion_no_persiste_sin_guardar_sesion(client):
    sid = _crear_sesion(client, "h6")
    client.post("/correcciones/guardar", json={
        "session_id": sid, "hash_video": "h6", "id_tracking": 1,
        "segundo_inicio": 1.0, "segundo_fin": 2.0, "emocion_corregida": "Enfado"})
    assert len(client.get("/correcciones/activas").json()["correcciones"]) == 1
    assert client.get(f"/correcciones/sesion/{sid}").json()["total"] == 0


def test_correccion_persiste_al_guardar_sesion(client):
    sid = _crear_sesion(client, "h7")
    client.post("/correcciones/guardar", json={
        "session_id": sid, "hash_video": "h7", "id_tracking": 1,
        "segundo_inicio": 1.0, "segundo_fin": 2.0, "emocion_corregida": "Enfado"})
    client.post("/sesiones/guardar", json={
        "session_id": sid, "segundo_actual": 0.0, "snapshot_display": {}})
    assert client.get(f"/correcciones/sesion/{sid}").json()["total"] == 1


def test_eliminar_correccion_memoria(client):
    sid = _crear_sesion(client, "h8")
    client.post("/correcciones/guardar", json={
        "session_id": sid, "hash_video": "h8", "id_tracking": 1,
        "segundo_inicio": 1.0, "segundo_fin": 2.0, "emocion_corregida": "Enfado"})
    assert client.delete("/correcciones/memoria/0").status_code == 200
    assert client.get("/correcciones/activas").json()["correcciones"] == []


def test_eliminar_correccion_memoria_invalida_404(client):
    assert client.delete("/correcciones/memoria/99").status_code == 404


def test_cargar_correcciones_desde_bd(client):
    sid = _crear_sesion(client, "h9")
    client.post("/correcciones/guardar", json={
        "session_id": sid, "hash_video": "h9", "id_tracking": 1,
        "segundo_inicio": 1.0, "segundo_fin": 2.0, "emocion_corregida": "Enfado"})
    client.post("/sesiones/guardar", json={
        "session_id": sid, "segundo_actual": 0.0, "snapshot_display": {}})
    r = client.post("/correcciones/cargar", json={"session_id": sid})
    assert r.status_code == 200
    assert r.json()["total"] == 1


def test_dos_sesiones_correcciones_independientes(client):
    s1 = _crear_sesion(client, "h10", "S1")
    s2 = _crear_sesion(client, "h10", "S2")
    for sid, emo in [(s1, "Enfado"), (s2, "Felicidad")]:
        client.post("/reset")
        client.post("/correcciones/guardar", json={
            "session_id": sid, "hash_video": "h10", "id_tracking": 1,
            "segundo_inicio": 1.0, "segundo_fin": 2.0, "emocion_corregida": emo})
        client.post("/sesiones/guardar", json={
            "session_id": sid, "segundo_actual": 0.0, "snapshot_display": {}})
    c1 = client.get(f"/correcciones/sesion/{s1}").json()["correcciones"]
    c2 = client.get(f"/correcciones/sesion/{s2}").json()["correcciones"]
    assert [c["emocion_corregida"] for c in c1] == ["Enfado"]
    assert [c["emocion_corregida"] for c in c2] == ["Felicidad"]


def test_endpoints_sin_detector_devuelven_500():
    from backend import main
    main.detector = None
    c = TestClient(main.app)
    assert c.post("/reset").status_code == 500
    assert c.post("/analizar", json={"image_base64": _img_b64()}).status_code == 500
    assert c.get("/correcciones/activas").status_code == 500