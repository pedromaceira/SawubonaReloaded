from fastapi.testclient import TestClient
from backend.main import app

# se crea un cliente de pruebas
client = TestClient(app)

def test_read_root():
    # se simula una petición GET a la raíz que hay configurada en main.py
    response = client.get("/")
    
    # se comprueba que el servidor responde con un 200 OK
    assert response.status_code == 200
    # se comprueba que el mensaje es exactamente el programado
    assert response.json() == {"status": "Servidor funcionando correctamente"}