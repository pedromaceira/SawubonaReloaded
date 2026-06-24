import numpy as np
import base64
import cv2
import pytest
from backend.utils import base64_to_cv2, preprocess_face


def _imagen_base64(con_cabecera=True):
    dummy = np.zeros((5, 5, 3), dtype=np.uint8)
    _, buffer = cv2.imencode('.jpg', dummy)
    b64 = base64.b64encode(buffer).decode('utf-8')
    return f"data:image/jpeg;base64,{b64}" if con_cabecera else b64


def test_base64_to_cv2_con_cabecera():
    resultado = base64_to_cv2(_imagen_base64(con_cabecera=True))
    assert isinstance(resultado, np.ndarray)
    assert resultado.shape == (5, 5, 3)


def test_base64_to_cv2_sin_cabecera():
    resultado = base64_to_cv2(_imagen_base64(con_cabecera=False))
    assert isinstance(resultado, np.ndarray)
    assert resultado.shape == (5, 5, 3)


def test_base64_to_cv2_devuelve_bgr_3_canales():
    resultado = base64_to_cv2(_imagen_base64())
    assert resultado.ndim == 3
    assert resultado.shape[2] == 3


def test_base64_to_cv2_no_imagen_devuelve_none():
    no_imagen = base64.b64encode(b"esto no es una imagen").decode('utf-8')
    payload = f"data:image/jpeg;base64,{no_imagen}"
    resultado = base64_to_cv2(payload)
    assert resultado is None


def test_preprocess_face_forma_correcta():
    cara = np.ones((100, 100, 3), dtype=np.uint8) * 255
    resultado = preprocess_face(cara)
    assert resultado.shape == (1, 64, 64, 1)


def test_preprocess_face_normaliza_entre_0_y_1():
    cara = np.ones((100, 100, 3), dtype=np.uint8) * 255
    resultado = preprocess_face(cara)
    assert resultado.max() <= 1.0
    assert resultado.min() >= 0.0


def test_preprocess_face_blanco_da_uno():
    cara = np.ones((30, 30, 3), dtype=np.uint8) * 255
    resultado = preprocess_face(cara)
    assert np.allclose(resultado, 1.0)


def test_preprocess_face_negro_da_cero():
    cara = np.zeros((30, 30, 3), dtype=np.uint8)
    resultado = preprocess_face(cara)
    assert np.allclose(resultado, 0.0)


def test_preprocess_face_tipo_float32():
    cara = np.ones((40, 40, 3), dtype=np.uint8) * 120
    resultado = preprocess_face(cara)
    assert resultado.dtype == np.float32


def test_preprocess_face_tamano_personalizado():
    cara = np.ones((80, 80, 3), dtype=np.uint8) * 128
    resultado = preprocess_face(cara, target_size=(32, 32))
    assert resultado.shape == (1, 32, 32, 1)