import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .detector import EmotionDetector


'''
Configurar los puntos de entrada (endpoints) con fastapi

# un endpoint /detectar que reciba una imagen (frame)
# coordine la detección de caras y la inferencia de emociones
# devuelva un JSON con los resultados
'''


# se define el modelo de datos que recibiremos del frontend
# el servidor espera recibir un objeto JSON con una clave llamada "image_base64"
# en caso de que el frontend intentara mandar otra cosa, FastAPI rechazaría automáticamente la petición
class ImageRequest(BaseModel):
    image_base64: str

# se inicializa FastAPI
app = FastAPI(title="Sawubona Reloaded API")

# se configura CORS para permitir que el frontend se comunique con el backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # en producción (CESGA) se puede restringir a la IP del cliente
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# se cargan los dos modelos a usar una única vez
try:
    detector = EmotionDetector(
        yolo_path="modelos/yolo11n-face.pt", 
        emotion_model_path="modelos/emotion_model.hdf5"
    )
except Exception as e:
    print(f"Error al cargar los modelos: {e}")
    detector = None

# endpoint de comprobación (verificar si el servidor está levantado)
@app.get("/")
def read_root():
    return {"status": "Servidor funcionando correctamente"}

# endpoint de procesamiento
@app.post("/analizar")

# al ser asíncrona, permite que el servidor puede recibir otro frame mientras la IA termina de procesar una imagen
async def analizar_emociones(request: ImageRequest):

    # filtro por si los modelos no se cargaron
    if detector is None:
        raise HTTPException(status_code=500, detail="Modelos no cargados en el servidor")

    try:
        # se importa la utilidad de conversión dentro para evitar bloqueos
        from .utils import base64_to_cv2
        
        # se convierte la imagen base64 a formato OpenCV
        frame = base64_to_cv2(request.image_base64)
        
        # se realiza la detección y clasificación
        resultados = detector.detect_and_classify(frame)
        
        return {"caras_detectadas": len(resultados), "analisis": resultados}
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error procesando la imagen: {str(e)}")


if __name__ == "__main__":
    # comando para ejecutar: python main.py
    uvicorn.run(app, host="0.0.0.0", port=8000)