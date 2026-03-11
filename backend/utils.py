import cv2
import numpy as np
import base64
from PIL import Image
import io

'''
Funciones para procesar imágenes con OpenCV y NumPy 
(recortar la cara detectada, convertir a gris y normalizar píxeles)
Convierte el frame a imagen de cv2
'''

def base64_to_cv2(base64_string):
    """
    Convierte una imagen en formato base64 (como la envía el navegador) 
    a un formato que OpenCV pueda procesar.
    """

    # en caso de que la cadena base64 venga con un encabezado, lo elimina
    # se queda solo con el código puro de la imagen
    if "," in base64_string:
        base64_string = base64_string.split(",")[1]
    
    # se convierte la cadena base64 en bytes
    img_bytes = base64.b64decode(base64_string)
    
    # se convierten los bytes en un array de NumPy (vector unidimensional de números)
    np_array = np.frombuffer(img_bytes, np.uint8)
    
    # se decodifica el array de NumPy a una imagen de OpenCV
    # OpenCV interpreta los números y los organiza en uan imagen BGR
    image = cv2.imdecode(np_array, cv2.IMREAD_COLOR)

    return image

def preprocess_face(face_image, target_size=(64, 64)):
    """
    Prepara el recorte de la cara para el modelo de emociones,
    que requiere escala de grises y un tamaño específico.
    """
    
    # se convierte a escala de grises porque el modelo se entrenó así
    gray_face = cv2.cvtColor(face_image, cv2.COLOR_BGR2GRAY)
    
    # se redimensiona al tamaño que necesita el modelo
    resized_face = cv2.resize(gray_face, target_size)
    
    # se normalizan los píxeles (de 0-255 a 0-1) 
    normalized_face = resized_face.astype("float32") / 255.0
    
    # se añaden dimensiones para que el modelo lo acepte (1, 64, 64, 1)
    final_face = np.expand_dims(normalized_face, axis=(0, -1))
    
    return final_face