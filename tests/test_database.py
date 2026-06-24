import json
import pytest
from backend import database


EMB = [0.1] * 10


def test_embedding_texto_round_trip():
    texto = database.embedding_a_texto(EMB)
    assert isinstance(texto, str)
    assert database.texto_a_embedding(texto) == EMB


def test_embedding_a_texto_desde_objeto_con_flatten():
    import numpy as np
    arr = np.array([[1.0, 2.0], [3.0, 4.0]])
    texto = database.embedding_a_texto(arr)
    assert database.texto_a_embedding(texto) == [1.0, 2.0, 3.0, 4.0]


def test_registrar_video_no_duplica():
    database.registrar_video("hashA", "video.mp4", 12.0)
    database.registrar_video("hashA", "otro.mp4", 99.0)
    with database.get_conexion() as conn:
        filas = conn.execute("SELECT * FROM videos WHERE hash_video = ?", ("hashA",)).fetchall()
    assert len(filas) == 1
    assert filas[0]["nombre_original"] == "video.mp4"


def test_crear_sesion_con_nombre():
    sid = database.crear_sesion("hashB", "video.mp4", "Mi sesión")
    ses = database.obtener_sesion(sid)
    assert ses["nombre_sesion"] == "Mi sesión"
    assert ses["hash_video"] == "hashB"
    assert ses["segundo_actual"] == 0
    assert ses["snapshot"] is None


def test_crear_sesion_sin_nombre_usa_sesion_n():
    sid = database.crear_sesion("hashC", "video.mp4")
    ses = database.obtener_sesion(sid)
    assert ses["nombre_sesion"] == f"Sesión {sid}"


def test_crear_sesion_nombre_vacio_usa_sesion_n():
    sid = database.crear_sesion("hashC2", "video.mp4", "")
    ses = database.obtener_sesion(sid)
    assert ses["nombre_sesion"] == f"Sesión {sid}"


def test_obtener_sesion_inexistente_devuelve_none():
    assert database.obtener_sesion(99999) is None


def test_listar_sesiones_vacio():
    assert database.listar_sesiones("hash_sin_sesiones") == []


def test_listar_sesiones_cuenta_correcciones():
    sid = database.crear_sesion("hashD", "video.mp4", "S1")
    database.guardar_correccion(sid, "hashD", EMB, 1.0, 2.0, "Enfado", id_tracking=1)
    database.guardar_correccion(sid, "hashD", EMB, 3.0, 4.0, "Felicidad", id_tracking=2)
    sesiones = database.listar_sesiones("hashD")
    assert len(sesiones) == 1
    assert sesiones[0]["num_correcciones"] == 2


def test_listar_sesiones_orden_por_updated_at_desc():
    s1 = database.crear_sesion("hashE", "v.mp4", "primera")
    s2 = database.crear_sesion("hashE", "v.mp4", "segunda")
    database.guardar_estado_sesion(s1, 10.0, {"x": 1})
    sesiones = database.listar_sesiones("hashE")
    assert sesiones[0]["id"] == s1
    assert sesiones[1]["id"] == s2


def test_guardar_estado_sesion_persiste_snapshot_y_segundo():
    sid = database.crear_sesion("hashF", "v.mp4", "S")
    snap = {"display": {"sessionData": {"Cara 1": ["Enfado"]}}, "backend": {"next_id": 3}}
    database.guardar_estado_sesion(sid, 42.5, snap)
    ses = database.obtener_sesion(sid)
    assert ses["segundo_actual"] == 42.5
    assert ses["snapshot"] == snap


def test_guardar_estado_sesion_snapshot_none():
    sid = database.crear_sesion("hashF2", "v.mp4", "S")
    database.guardar_estado_sesion(sid, 5.0, None)
    ses = database.obtener_sesion(sid)
    assert ses["snapshot"] is None
    assert ses["segundo_actual"] == 5.0


def test_guardar_correccion_y_obtener_round_trip_embedding():
    sid = database.crear_sesion("hashG", "v.mp4", "S")
    cid = database.guardar_correccion(sid, "hashG", EMB, 1.5, 3.5, "Sorpresa", id_tracking=7)
    assert isinstance(cid, int)
    corrs = database.obtener_correcciones_sesion(sid)
    assert len(corrs) == 1
    c = corrs[0]
    assert c["embedding"] == EMB
    assert c["emocion_corregida"] == "Sorpresa"
    assert c["id_tracking"] == 7
    assert c["segundo_inicio"] == 1.5
    assert c["segundo_fin"] == 3.5


def test_obtener_correcciones_ordena_por_inicio():
    sid = database.crear_sesion("hashH", "v.mp4", "S")
    database.guardar_correccion(sid, "hashH", EMB, 9.0, 10.0, "Miedo", id_tracking=1)
    database.guardar_correccion(sid, "hashH", EMB, 2.0, 3.0, "Neutral", id_tracking=2)
    corrs = database.obtener_correcciones_sesion(sid)
    assert [c["segundo_inicio"] for c in corrs] == [2.0, 9.0]


def test_sesiones_distintas_tienen_correcciones_independientes():
    s1 = database.crear_sesion("hashI", "v.mp4", "S1")
    s2 = database.crear_sesion("hashI", "v.mp4", "S2")
    database.guardar_correccion(s1, "hashI", EMB, 1.0, 2.0, "Enfado", id_tracking=1)
    database.guardar_correccion(s2, "hashI", EMB, 1.0, 2.0, "Felicidad", id_tracking=1)
    c1 = database.obtener_correcciones_sesion(s1)
    c2 = database.obtener_correcciones_sesion(s2)
    assert [c["emocion_corregida"] for c in c1] == ["Enfado"]
    assert [c["emocion_corregida"] for c in c2] == ["Felicidad"]


def test_reemplazar_correcciones_sesion():
    sid = database.crear_sesion("hashJ", "v.mp4", "S")
    database.guardar_correccion(sid, "hashJ", EMB, 1.0, 2.0, "Enfado", id_tracking=1)
    nuevas = [
        {"embedding": EMB, "id_tracking": 5, "segundo_inicio": 3.0, "segundo_fin": 4.0, "emocion_corregida": "Tristeza"},
        {"embedding": EMB, "id_tracking": 6, "segundo_inicio": 5.0, "segundo_fin": 6.0, "emocion_corregida": "Disgusto"},
    ]
    total = database.reemplazar_correcciones_sesion(sid, "hashJ", nuevas)
    assert total == 2
    corrs = database.obtener_correcciones_sesion(sid)
    assert len(corrs) == 2
    assert {c["emocion_corregida"] for c in corrs} == {"Tristeza", "Disgusto"}


def test_reemplazar_correcciones_con_lista_vacia_borra_todo():
    sid = database.crear_sesion("hashK", "v.mp4", "S")
    database.guardar_correccion(sid, "hashK", EMB, 1.0, 2.0, "Enfado", id_tracking=1)
    total = database.reemplazar_correcciones_sesion(sid, "hashK", [])
    assert total == 0
    assert database.obtener_correcciones_sesion(sid) == []


def test_borrar_correccion():
    sid = database.crear_sesion("hashL", "v.mp4", "S")
    cid = database.guardar_correccion(sid, "hashL", EMB, 1.0, 2.0, "Enfado", id_tracking=1)
    assert database.borrar_correccion(cid) is True
    assert database.obtener_correcciones_sesion(sid) == []


def test_borrar_correccion_inexistente_devuelve_false():
    assert database.borrar_correccion(99999) is False


def test_borrar_sesion_cascada():
    sid = database.crear_sesion("hashM", "v.mp4", "S")
    database.guardar_correccion(sid, "hashM", EMB, 1.0, 2.0, "Enfado", id_tracking=1)
    assert database.borrar_sesion(sid) is True
    assert database.obtener_sesion(sid) is None
    assert database.obtener_correcciones_sesion(sid) == []


def test_obtener_sesion_snapshot_corrupto_devuelve_none():
    sid = database.crear_sesion("hashN", "v.mp4", "S")
    with database.get_conexion() as conn:
        conn.execute("UPDATE sesiones SET snapshot = ? WHERE id = ?", ("{no es json}", sid))
    ses = database.obtener_sesion(sid)
    assert ses["snapshot"] is None


def test_borrar_sesion_inexistente_devuelve_false():
    assert database.borrar_sesion(99999) is False