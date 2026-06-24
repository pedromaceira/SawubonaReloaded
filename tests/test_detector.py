import torch
import pytest
from backend.detector import EmotionDetector


def make_emb(values):
    return torch.tensor([values], dtype=torch.float32)


@pytest.fixture
def det():
    d = object.__new__(EmotionDetector)
    d.device = "cpu"
    d.known_faces = []
    d.next_id = 1
    d.match_threshold = 1.15
    d.correcciones_activas = []
    return d


def test_obtener_embedding_por_id_encontrado(det):
    emb = make_emb([1.0, 0.0, 0.0])
    det.known_faces = [(1, emb)]
    assert det.obtener_embedding_por_id(1) is emb


def test_obtener_embedding_por_id_no_encontrado(det):
    det.known_faces = [(1, make_emb([1.0, 0.0, 0.0]))]
    assert det.obtener_embedding_por_id(99) is None


def test_cargar_correcciones_construye_lista(det):
    n = det.cargar_correcciones([
        {"embedding": [1.0, 0.0, 0.0], "id_tracking": 3,
         "segundo_inicio": 1.0, "segundo_fin": 5.0, "emocion_corregida": "Enfado"}
    ])
    assert n == 1
    c = det.correcciones_activas[0]
    assert c["id_tracking"] == 3
    assert c["inicio"] == 1.0
    assert c["fin"] == 5.0
    assert c["emocion"] == "Enfado"
    assert isinstance(c["embedding"], torch.Tensor)


def test_aplicar_correccion_coincide(det):
    det.known_faces = [(1, make_emb([1.0, 0.0, 0.0]))]
    det.cargar_correcciones([
        {"embedding": [1.0, 0.0, 0.0], "id_tracking": 1,
         "segundo_inicio": 1.0, "segundo_fin": 5.0, "emocion_corregida": "Felicidad"}
    ])
    assert det.aplicar_correccion(1, 3.0) == "Felicidad"


def test_aplicar_correccion_fuera_de_rango_temporal(det):
    det.known_faces = [(1, make_emb([1.0, 0.0, 0.0]))]
    det.cargar_correcciones([
        {"embedding": [1.0, 0.0, 0.0], "id_tracking": 1,
         "segundo_inicio": 1.0, "segundo_fin": 5.0, "emocion_corregida": "Felicidad"}
    ])
    assert det.aplicar_correccion(1, 10.0) is None


def test_aplicar_correccion_embedding_lejano(det):
    det.known_faces = [(1, make_emb([5.0, 0.0, 0.0]))]
    det.cargar_correcciones([
        {"embedding": [0.0, 0.0, 0.0], "id_tracking": 1,
         "segundo_inicio": 1.0, "segundo_fin": 5.0, "emocion_corregida": "Felicidad"}
    ])
    assert det.aplicar_correccion(1, 3.0) is None


def test_aplicar_correccion_persona_desconocida(det):
    det.cargar_correcciones([
        {"embedding": [1.0, 0.0, 0.0], "id_tracking": 1,
         "segundo_inicio": 1.0, "segundo_fin": 5.0, "emocion_corregida": "Felicidad"}
    ])
    assert det.aplicar_correccion(99, 3.0) is None


def test_aplicar_correccion_sin_correcciones(det):
    det.known_faces = [(1, make_emb([1.0, 0.0, 0.0]))]
    assert det.aplicar_correccion(1, 3.0) is None


def test_agregar_correccion_memoria_ok(det):
    det.known_faces = [(1, make_emb([1.0, 0.0, 0.0]))]
    indice = det.agregar_correccion_memoria(1, 2.0, 3.0, "Sorpresa")
    assert indice == 0
    assert len(det.correcciones_activas) == 1
    assert det.correcciones_activas[0]["emocion"] == "Sorpresa"


def test_agregar_correccion_memoria_id_desconocido(det):
    assert det.agregar_correccion_memoria(99, 2.0, 3.0, "Sorpresa") is None
    assert det.correcciones_activas == []


def test_eliminar_correccion_memoria_ok(det):
    det.known_faces = [(1, make_emb([1.0, 0.0, 0.0]))]
    det.agregar_correccion_memoria(1, 2.0, 3.0, "Sorpresa")
    assert det.eliminar_correccion_memoria(0) is True
    assert det.correcciones_activas == []


def test_eliminar_correccion_memoria_indice_invalido(det):
    assert det.eliminar_correccion_memoria(5) is False


def test_listar_correcciones_memoria(det):
    det.known_faces = [(1, make_emb([1.0, 0.0, 0.0]))]
    det.agregar_correccion_memoria(1, 2.0, 3.0, "Miedo")
    lista = det.listar_correcciones_memoria()
    assert lista == [{
        "indice": 0, "id_tracking": 1,
        "segundo_inicio": 2.0, "segundo_fin": 3.0, "emocion_corregida": "Miedo"
    }]


def test_exportar_correcciones_memoria_serializa_embedding(det):
    det.known_faces = [(1, make_emb([1.0, 2.0, 3.0]))]
    det.agregar_correccion_memoria(1, 2.0, 3.0, "Disgusto")
    exportadas = det.exportar_correcciones_memoria()
    assert exportadas[0]["embedding"] == [1.0, 2.0, 3.0]
    assert exportadas[0]["emocion_corregida"] == "Disgusto"
    assert exportadas[0]["id_tracking"] == 1


def test_exportar_memoria(det):
    det.known_faces = [(1, make_emb([1.0, 0.0])), (2, make_emb([0.0, 1.0]))]
    det.next_id = 3
    memoria = det.exportar_memoria()
    assert memoria["next_id"] == 3
    assert len(memoria["known_faces"]) == 2
    assert memoria["known_faces"][0]["id"] == 1
    assert memoria["known_faces"][0]["embedding"] == [1.0, 0.0]


def test_importar_memoria_round_trip(det):
    det.known_faces = [(1, make_emb([1.0, 0.0, 0.0])), (2, make_emb([0.0, 1.0, 0.0]))]
    det.next_id = 3
    memoria = det.exportar_memoria()

    otro = object.__new__(EmotionDetector)
    otro.device = "cpu"
    otro.importar_memoria(memoria)

    assert otro.next_id == 3
    assert len(otro.known_faces) == 2
    assert otro.known_faces[0][0] == 1
    assert otro.known_faces[0][1].flatten().tolist() == [1.0, 0.0, 0.0]


def test_importar_memoria_vacia(det):
    otro = object.__new__(EmotionDetector)
    otro.device = "cpu"
    otro.importar_memoria({})
    assert otro.known_faces == []
    assert otro.next_id == 1


def test_reset_memory_limpia_todo(det):
    det.known_faces = [(1, make_emb([1.0, 0.0]))]
    det.next_id = 5
    det.correcciones_activas = [{"x": 1}]
    det.reset_memory()
    assert det.known_faces == []
    assert det.next_id == 1
    assert det.correcciones_activas == []