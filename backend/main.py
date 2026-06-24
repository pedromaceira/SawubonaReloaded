import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import os
import database


class ImageRequest(BaseModel):
    image_base64: str
    is_screen_share: bool = False
    tiempo_actual: Optional[float] = None


class CrearSesionRequest(BaseModel):
    hash_video: str
    nombre_original: str = ""
    nombre_sesion: Optional[str] = None


class GuardarSesionRequest(BaseModel):
    session_id: int
    segundo_actual: float
    snapshot_display: dict


class ActivarSesionRequest(BaseModel):
    session_id: int


class CargarCorreccionesRequest(BaseModel):
    session_id: int


class CorreccionRequest(BaseModel):
    session_id: int
    hash_video: str
    nombre_original: str = ""
    duracion: float = 0.0
    id_tracking: int
    segundo_inicio: float
    segundo_fin: float
    emocion_corregida: str


app = FastAPI(title="Sawubona Reloaded API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

detector = None
if os.environ.get("SAWUBONA_SKIP_MODELS") != "1":
    try:
        from detector import EmotionDetector
        detector = EmotionDetector(
            yolo_path="modelos/yolo11n-face.pt",
            emotion_model_path="modelos/emotion_model.hdf5"
        )
    except Exception as e:
        print(f"Error al cargar los modelos: {e}")
        detector = None

try:
    database.inicializar_db()
except Exception as e:
    print(f"Error al inicializar la base de datos: {e}")


def _correccion_ligera(c):
    return {k: v for k, v in c.items() if k != "embedding"}


@app.get("/")
def read_root():
    return {"status": "Servidor funcionando correctamente"}


@app.post("/reset")
async def reset_memory():
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")
    try:
        detector.reset_memory()
        return {"status": "ok", "message": "Memoria biométrica reseteada con éxito"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reseteando la memoria: {str(e)}")


@app.post("/analizar")
async def analizar_emociones(request: ImageRequest):
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")
    try:
        from utils import base64_to_cv2
        frame = base64_to_cv2(request.image_base64)
        resultados = detector.detect_and_classify(
            frame,
            is_screen_share=request.is_screen_share,
            tiempo_actual=request.tiempo_actual
        )
        return {"caras_detectadas": len(resultados), "analisis": resultados}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error procesando la imagen: {str(e)}")



@app.post("/sesiones/crear")
async def crear_sesion(request: CrearSesionRequest):
    try:
        database.registrar_video(request.hash_video, request.nombre_original, 0.0)
        sid = database.crear_sesion(request.hash_video, request.nombre_original, request.nombre_sesion)
        return {"status": "ok", "id": sid}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creando la sesión: {str(e)}")


@app.get("/sesiones/listar/{hash_video}")
async def listar_sesiones(hash_video: str):
    try:
        return {"sesiones": database.listar_sesiones(hash_video)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listando sesiones: {str(e)}")


@app.post("/sesiones/guardar")
async def guardar_sesion(request: GuardarSesionRequest):
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")
    try:
        memoria = detector.exportar_memoria()
        snapshot = {"display": request.snapshot_display, "backend": memoria}
        database.guardar_estado_sesion(request.session_id, request.segundo_actual, snapshot)

        ses = database.obtener_sesion(request.session_id)
        hash_video = ses["hash_video"] if ses else ""
        database.reemplazar_correcciones_sesion(
            request.session_id, hash_video, detector.exportar_correcciones_memoria()
        )
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando la sesión: {str(e)}")


@app.post("/sesiones/activar")
async def activar_sesion(request: ActivarSesionRequest):
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")
    ses = database.obtener_sesion(request.session_id)
    if ses is None:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    try:
        detector.reset_memory()
        snapshot = ses["snapshot"] if isinstance(ses["snapshot"], dict) else {}
        memoria = snapshot.get("backend")
        if memoria:
            detector.importar_memoria(memoria)

        correcciones = database.obtener_correcciones_sesion(request.session_id)
        detector.cargar_correcciones(correcciones)

        return {
            "status": "ok",
            "segundo_actual": ses["segundo_actual"],
            "snapshot_display": snapshot.get("display"),
            "correcciones": [_correccion_ligera(c) for c in correcciones]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error activando la sesión: {str(e)}")


@app.delete("/sesiones/{session_id}")
async def eliminar_sesion(session_id: int):
    try:
        borrado = database.borrar_sesion(session_id)
        if not borrado:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")
        return {"status": "ok", "session_id": session_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error borrando la sesión: {str(e)}")



@app.post("/correcciones/cargar")
async def cargar_correcciones(request: CargarCorreccionesRequest):
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")
    try:
        correcciones = database.obtener_correcciones_sesion(request.session_id)
        total = detector.cargar_correcciones(correcciones)
        return {"status": "ok", "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error cargando correcciones: {str(e)}")


@app.post("/correcciones/guardar")
async def guardar_correccion(request: CorreccionRequest):
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")

    indice = detector.agregar_correccion_memoria(
        id_tracking=request.id_tracking,
        segundo_inicio=request.segundo_inicio,
        segundo_fin=request.segundo_fin,
        emocion=request.emocion_corregida
    )
    if indice is None:
        raise HTTPException(
            status_code=404,
            detail=f"No se encontró la cara con id {request.id_tracking} en la sesión actual"
        )
    return {"status": "ok", "indice": indice}


@app.get("/correcciones/activas")
async def listar_correcciones_activas():
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")
    return {"correcciones": detector.listar_correcciones_memoria()}


@app.delete("/correcciones/memoria/{indice}")
async def eliminar_correccion_memoria(indice: int):
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")
    borrado = detector.eliminar_correccion_memoria(indice)
    if not borrado:
        raise HTTPException(status_code=404, detail="Corrección no encontrada en memoria")
    return {"status": "ok", "indice": indice}


@app.get("/correcciones/sesion/{session_id}")
async def listar_correcciones_sesion(session_id: int):
    try:
        correcciones = database.obtener_correcciones_sesion(session_id)
        ligeras = [_correccion_ligera(c) for c in correcciones]
        return {"total": len(ligeras), "correcciones": ligeras}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando correcciones: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)