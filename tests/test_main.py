from fastapi.testclient import TestClient
from backend.main import app

# Creamos un cliente de pruebas
client = TestClient(app)

def test_read_root():
    # Simulamos una petición GET a la raíz que tienes configurada en main.py
    response = client.get("/")
    
    # Comprobamos que el servidor responde con un 200 OK
    assert response.status_code == 200
    # Comprobamos que el mensaje es exactamente el que tú programaste
    assert response.json() == {"status": "Servidor funcionando correctamente"}