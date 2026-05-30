import sys
import os
import uvicorn
import multiprocessing
import threading
import time
import subprocess

# 1. Rutas absolutas inteligentes
if getattr(sys, 'frozen', False):
    ruta_base = os.path.dirname(sys.executable)
else:
    ruta_base = os.path.dirname(os.path.abspath(__file__))

ruta_backend = os.path.join(ruta_base, "backend")
sys.path.insert(0, ruta_backend)

# 2. SOLUCIÓN A LOS MODELOS: Obligamos a Python a mirar dentro de la carpeta 'backend'
os.chdir(ruta_backend)

from backend.main import app

def abrir_navegador():
    time.sleep(3)
    
    # Construimos la ruta apuntando a la carpeta frontend (que está en ruta_base)
    ruta_index = os.path.join(ruta_base, "frontend", "index.html")
    url_archivo = "file:///" + ruta_index.replace("\\", "/")
    
    # 3. SOLUCIÓN A CHROME: Comando nativo de Windows para forzar Google Chrome
    try:
        # Esto le dice a la consola de Windows: "Inicia Chrome con este archivo"
        subprocess.run(['cmd', '/c', 'start', 'chrome', url_archivo])
    except Exception:
        # Plan B (por si Chrome no está instalado, usamos el navegador por defecto)
        import webbrowser
        webbrowser.open(url_archivo)

if __name__ == "__main__":
    multiprocessing.freeze_support()
    print("Iniciando SawubonaReloaded Local Server...")
    
    threading.Thread(target=abrir_navegador, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)