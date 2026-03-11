import cv2
import numpy as np
import tensorflow as tf
from ultralytics import YOLO
from tensorflow.keras.models import load_model
from utils import preprocess_face

'''
Implementar clase que cargue yolo que tenga un método para 
devolver las coordenadas de las caras encontradas.
Aplica los dos modelos
'''

# CONTROL DE MEMORIA GPU PARA CESGA
gpus = tf.config.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    except RuntimeError as e:
        print(f"Error configurando la memoria de la GPU: {e}")

class EmotionDetector:
    def __init__(self, yolo_path, emotion_model_path):
        """
        Inicializa los modelos. Se cargan una sola vez al arrancar el servidor
        para maximizar el rendimiento en el CESGA o en local.
        """

        # se carga el modelo YOLO para detección de caras y se envía a la GPU
        self.face_detector = YOLO(yolo_path)
        self.face_detector.to('cuda') # se fuerza la carga en GPU
        
        # se carga el modelo de clasificación de emociones
        self.emotion_classifier = load_model(emotion_model_path, compile=False)
        
        # lista de etiquetas de emociones (REVISAR BIEN ORDEN porque si está mal devuelve lo que no es)
        self.emotions = ["Enfado", "Disgusto", "Miedo", "Felicidad", "Tristeza", "Sorpresa", "Neutral"]

    def detect_and_classify(self, frame):
        """
        Recibe un frame de OpenCV, detecta caras y clasifica la emoción de cada una.
        """
        results_list = []
        
        # DETECCIÓN DE CARAS CON YOLO
        # se usa el umbral=0.5 para evitar falsos positivos y forzamos el uso de la gráfica (device=0)
        detections = self.face_detector(frame, conf=0.5, verbose=False, device=0) # <-- AÑADIDO: device=0
        
        # para cada detección
        for detection in detections:

            # se extraen las coordenadas de las bounding boxes que rodean las caras detectadas
            boxes = detection.boxes.xyxy.cpu().numpy()
            
            # para cada bounding box
            for box in boxes:

                # se convierten las coordenadas a números enteros (para que no haya medios píxeles sueltos)
                x1, y1, x2, y2 = map(int, box)
                
                # se extrae el recorte de la cara
                face_crop = frame[y1:y2, x1:x2]
                
                # por si el recorte sale vacío
                if face_crop.size == 0:
                    continue
                
                # se preprocesa la cara usando utils.py
                # transformación del recorte en color al formato que necesita el modelo
                processed_face = preprocess_face(face_crop)
                
                # inferencia de emoción
                # aquí se obtiene la emoción predominante y un vector de probabilidades con todas las emociones
                prediction = self.emotion_classifier.predict(processed_face, verbose=0)
                emotion_idx = np.argmax(prediction)
                emotion_text = self.emotions[emotion_idx]
                confidence = float(np.max(prediction))
                
                # se almacenan resultados
                results_list.append({
                    "box": [x1, y1, x2, y2],
                    "emotion": emotion_text,
                    "confidence": confidence
                })
                
        return results_list