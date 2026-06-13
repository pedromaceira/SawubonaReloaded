import sys
import os
import uvicorn
import multiprocessing
import threading
import time
import subprocess

if getattr(sys, 'frozen', False):
    ruta_exe = os.path.dirname(sys.executable)
    ruta_datos = getattr(sys, '_MEIPASS', ruta_exe)
else:
    ruta_exe = os.path.dirname(os.path.abspath(__file__))
    ruta_datos = ruta_exe

ruta_backend = os.path.join(ruta_datos, "backend")
sys.path.insert(0, ruta_backend)

os.chdir(ruta_backend)

from backend.main import app

def abrir_navegador():
    time.sleep(3)

    ruta_index = os.path.join(ruta_datos, "frontend", "index.html")
    url_archivo = "file:///" + ruta_index.replace("\\", "/")

    try:
        subprocess.run(['cmd', '/c', 'start', 'chrome', url_archivo])
    except Exception:
        import webbrowser
        webbrowser.open(url_archivo)

if __name__ == "__main__":
    multiprocessing.freeze_support()
    print("Iniciando SawubonaReloaded Local Server...")

    threading.Thread(target=abrir_navegador, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)