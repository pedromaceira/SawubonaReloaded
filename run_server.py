import sys
import os
import uvicorn
import multiprocessing
import webbrowser
import threading
import time

# 1. Enseñar a Python dónde están los archivos
ruta_actual = os.path.dirname(os.path.abspath(__file__))
ruta_backend = os.path.join(ruta_actual, "backend")
sys.path.insert(0, ruta_backend)

# 2. Importar la API
from backend.main import app

def abrir_navegador():
    # Esperamos 3 segundos a que FastAPI arranque del todo
    time.sleep(3)
    
    # Construimos la ruta absoluta al archivo index.html del frontend
    ruta_index = os.path.join(ruta_actual, "frontend", "index.html")
    
    # Transformamos la ruta de Windows (C:\...) a formato web (file:///C:/...)
    url_archivo = "file:///" + ruta_index.replace("\\", "/")
    
    # Le decimos a Windows que lo abra
    webbrowser.open(url_archivo)

if __name__ == "__main__":
    multiprocessing.freeze_support()
    print("Iniciando SawubonaReloaded Local Server...")
    
    # Lanzamos el "abridor de pestañas" en segundo plano
    threading.Thread(target=abrir_navegador, daemon=True).start()
    
    # Arrancamos el motor principal
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)