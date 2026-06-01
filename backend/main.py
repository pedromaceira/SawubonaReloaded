import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from detector import EmotionDetector
import database


class ImageRequest(BaseModel):
    image_base64: str
    is_screen_share: bool = False
    tiempo_actual: Optional[float] = None   # segundo del reproductor (solo vista de vídeo)


class CorreccionRequest(BaseModel):
    hash_video: str
    nombre_original: str = ""
    duracion: float = 0.0
    id_tracking: int               # ID de la cara en la sesión actual
    segundo_inicio: float
    segundo_fin: float
    emocion_corregida: str


class CargarCorreccionesRequest(BaseModel):
    hash_video: str


app = FastAPI(title="Sawubona Reloaded API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# carga de modelos (una sola vez)
try:
    detector = EmotionDetector(
        yolo_path="modelos/yolo11n-face.pt",
        emotion_model_path="modelos/emotion_model.hdf5"
    )
except Exception as e:
    print(f"Error al cargar los modelos: {e}")
    detector = None

# inicialización de la base de datos de correcciones
try:
    database.inicializar_db()
except Exception as e:
    print(f"Error al inicializar la base de datos de correcciones: {e}")


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


# consulta si un vídeo ya tiene correcciones guardadas
@app.get("/correcciones/{hash_video}")
async def consultar_correcciones(hash_video: str):
    try:
        correcciones = database.obtener_correcciones(hash_video)
        return {
            "existe": len(correcciones) > 0,
            "total": len(correcciones),
            "correcciones": correcciones
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error consultando correcciones: {str(e)}")


# carga en memoria del servidor las correcciones de un vídeo (al comenzar el análisis)
@app.post("/correcciones/cargar")
async def cargar_correcciones(request: CargarCorreccionesRequest):
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")
    try:
        correcciones = database.obtener_correcciones(request.hash_video)
        total = detector.cargar_correcciones(correcciones)
        return {"status": "ok", "total": total}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error cargando correcciones: {str(e)}")


# guarda una corrección manual (traduce id_tracking de la sesión a su embedding)
@app.post("/correcciones/guardar")
async def guardar_correccion(request: CorreccionRequest):
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")

    embedding = detector.obtener_embedding_por_id(request.id_tracking)
    if embedding is None:
        raise HTTPException(
            status_code=404,
            detail=f"No se encontró la cara con id {request.id_tracking} en la sesión actual"
        )

    try:
        database.registrar_video(request.hash_video, request.nombre_original, request.duracion)
        nuevo_id = database.guardar_correccion(
            hash_video=request.hash_video,
            embedding=embedding,
            segundo_inicio=request.segundo_inicio,
            segundo_fin=request.segundo_fin,
            emocion_corregida=request.emocion_corregida
        )
        return {"status": "ok", "id_correccion": nuevo_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error guardando la corrección: {str(e)}")


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)