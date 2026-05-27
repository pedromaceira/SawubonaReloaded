import sys
import os
import uvicorn
import multiprocessing

# 1. TRAMPA VITAL: Le enseñamos a Python dónde buscar los archivos internos (como detector.py)
ruta_actual = os.path.dirname(os.path.abspath(__file__))
ruta_backend = os.path.join(ruta_actual, "backend")
sys.path.insert(0, ruta_backend)

# 2. Ahora ya podemos importar la app sin que las dependencias internas exploten
from backend.main import app

if __name__ == "__main__":
    # Soporte para empaquetado en Windows
    multiprocessing.freeze_support()
    
    print("Iniciando SawubonaReloaded Local Server...")
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)