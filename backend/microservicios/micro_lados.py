import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import base64
import cv2
import numpy as np

# Inicializamos el microservicio
app = FastAPI(title="Microservicio: Corrector de Lados (Aspect Ratio)")

# Contrato de datos esperado
class FaceCropRequest(BaseModel):
    image_base64: str
    is_screen_share: bool = False

def base64_to_cv2(base64_string):
    if "," in base64_string:
        base64_string = base64_string.split(",")[1]
    img_data = base64.b64decode(base64_string)
    nparr = np.frombuffer(img_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img

@app.post("/verificar_ratio")
async def verificar_ratio(request: FaceCropRequest):
    try:
        img = base64_to_cv2(request.image_base64)
        if img is None or img.size == 0:
            return {"valido": False, "ratio": 0.0, "motivo": "Imagen vacía"}

        alto, ancho = img.shape[:2]
        if alto == 0:
            return {"valido": False, "ratio": 0.0, "motivo": "Altura cero"}

        aspect_ratio = ancho / alto

        # --- AHORA SÍ SOMOS LAXOS PARA LOS PERFILES ---
        # Permitimos un ratio de hasta 0.45 (cara girada casi de perfil)
        umbral_minimo = 0.6
        umbral_maximo = 1.60 # Damos un poco más de margen por arriba también

        es_valido = umbral_minimo <= aspect_ratio <= umbral_maximo

        return {
            "valido": es_valido,
            "ratio": round(aspect_ratio, 3),
            "motivo": "Ratio aceptado (perfil permitido)" if es_valido else "Ratio extremo rechazado"
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error interno: {str(e)}")

if __name__ == "__main__":
    # IMPORTANTE: Levantamos este microservicio en el puerto 8001
    uvicorn.run(app, host="0.0.0.0", port=8001)