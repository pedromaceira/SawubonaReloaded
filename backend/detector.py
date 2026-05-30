import os
import json
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'

import cv2
import numpy as np
import torch
import tensorflow as tf
from ultralytics import YOLO
from tensorflow.keras.models import load_model
from facenet_pytorch import InceptionResnetV1
import torchvision.transforms as transforms
from utils import preprocess_face
import requests
import base64

gpus = tf.config.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    except RuntimeError as e:
        print(f"Error configurando la memoria: {e}")

class EmotionDetector:
    def __init__(self, yolo_path, emotion_model_path):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print(f"--- Hardware detectado para PyTorch: {self.device.upper()} ---")

        self.face_detector = YOLO(yolo_path)
        self.face_detector.to(self.device)

        self.emotion_classifier = load_model(emotion_model_path, compile=False)
        self.emotions = ["Enfado", "Disgusto", "Miedo", "Felicidad", "Tristeza", "Sorpresa", "Neutral"]

        print(f"Cargando modelo FaceNet en {self.device.upper()}...")
        self.facenet = InceptionResnetV1(pretrained='vggface2').eval().to(self.device)

        self.trans = transforms.Compose([
            transforms.ToTensor(),
            transforms.Resize((160, 160)),
            transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
        ])

        self.known_faces = []
        self.next_id = 1
        self.match_threshold = 1.15
        
        self.face_avatars = {} 
        self.face_avatars_metrics = {} 

        self.config_microservicios = self.cargar_configuracion()

        print(f"Warm up de {self.device.upper()}... por favor espera.")
        try:
            dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            self.face_detector.predict(dummy_frame, conf=0.20, verbose=False)

            dummy_tensor = torch.zeros((1, 3, 160, 160), device=self.device)
            with torch.no_grad():
                self.facenet(dummy_tensor)

            dummy_face = np.zeros((1, 64, 64, 1), dtype=np.float32)
            self.emotion_classifier.predict(dummy_face, verbose=0)

            print(f"¡{self.device.upper()} lista!")
        except Exception as e:
            print(f"Advertencia durante el calentamiento: {e}")

    def cargar_configuracion(self):
        ruta_config = "config.json"
        try:
            if os.path.exists(ruta_config):
                with open(ruta_config, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    print("--- Configuración de Módulos Enchufables Cargada ---")
                    return config
            else:
                print("--- Advertencia: No se encontró config.json, corriendo sin microservicios ---")
                return {"microservicios": {}}
        except Exception as e:
            print(f"--- Error al leer config.json: {e} ---")
            return {"microservicios": {}}

    def reset_memory(self):
        self.known_faces = []
        self.next_id = 1
        self.face_avatars = {} 
        self.face_avatars_metrics = {} 
        print("--- Memoria biométrica y galería formateadas para el nuevo vídeo ---")

    def get_face_id(self, face_crop):
        face_rgb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
        face_tensor = self.trans(face_rgb).unsqueeze(0).to(self.device)

        with torch.no_grad():
            embedding = self.facenet(face_tensor)

        if len(self.known_faces) == 0:
            self.known_faces.append((self.next_id, embedding))
            self.next_id += 1
            return self.next_id - 1

        min_dist = float('inf')
        best_id = None

        for face_id, known_emb in self.known_faces:
            dist = torch.dist(embedding, known_emb).item()
            if dist < min_dist:
                min_dist = dist
                best_id = face_id

        if min_dist < self.match_threshold:
            return best_id
        else:
            self.known_faces.append((self.next_id, embedding))
            self.next_id += 1
            return self.next_id - 1

    def consultar_microservicio(self, url, face_crop, is_screen_share):
        if not url:
            return False

        try:
            _, buffer = cv2.imencode('.jpg', face_crop)
            img_base64 = base64.b64encode(buffer).decode('utf-8')

            payload = {
                "image_base64": img_base64,
                "is_screen_share": is_screen_share
            }

            response = requests.post(url, json=payload, timeout=2.0)

            if response.status_code == 200:
                data = response.json()
                return data.get("valido", False)
            else:
                print(f"Error del microservicio en {url}: {response.status_code}")
                return False

        except requests.exceptions.RequestException as e:
            print(f"Error de conexión con el microservicio en {url}: {e}")
            return False

    def detect_and_classify(self, frame, is_screen_share=False):
        results_list = []

        umbral_tamano = 30 if is_screen_share else 50
        umbral_foco = 2.0 if is_screen_share else 5.0
        umbral_ratio = 0.58 if is_screen_share else 0.67

        results = self.face_detector.predict(frame, conf=0.20, verbose=False)

        for r in results:
            boxes = r.boxes.xyxy.cpu().numpy()

            for box in boxes:
                x1, y1, x2, y2 = map(int, box)

                ancho = x2 - x1
                alto = y2 - y1

                if ancho < umbral_tamano or alto < umbral_tamano:
                    continue

                aspect_ratio = ancho / alto

                if aspect_ratio < umbral_ratio or aspect_ratio > 1.50:
                    cara_rescatada = False
                    modulos_fase_1 = self.config_microservicios.get("microservicios", {}).get("fase_1_correccion", [])
                    
                    for modulo in modulos_fase_1:
                        if modulo.get("activo"):
                            face_crop_temp = frame[y1:y2, x1:x2]
                            if face_crop_temp.size == 0:
                                continue

                            es_valido = self.consultar_microservicio(modulo["url"], face_crop_temp, is_screen_share)
                            
                            if es_valido:
                                cara_rescatada = True
                                break 
                    
                    if not cara_rescatada:
                        continue 

                face_crop = frame[y1:y2, x1:x2]
                if face_crop.size == 0:
                    continue

                gray_face = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
                focus_measure = cv2.Laplacian(gray_face, cv2.CV_64F).var()

                if focus_measure < umbral_foco:
                    continue

                person_id = self.get_face_id(face_crop)

                score_calidad = focus_measure * (ancho * alto)
                avatar_actualizado = False

                if person_id not in self.face_avatars or score_calidad > self.face_avatars_metrics.get(person_id, 0):
                    self.face_avatars_metrics[person_id] = score_calidad 
                    
                    _, buffer_avatar = cv2.imencode('.jpg', face_crop)
                    avatar_base64 = base64.b64encode(buffer_avatar).decode('utf-8')
                    self.face_avatars[person_id] = f"data:image/jpeg;base64,{avatar_base64}"
                    avatar_actualizado = True 

                processed_face = preprocess_face(face_crop)
                prediction = self.emotion_classifier.predict(processed_face, verbose=0)
                emotion_idx = np.argmax(prediction)
                emotion_text = self.emotions[emotion_idx]
                confidence = float(np.max(prediction))

                result_dict = {
                    "id_tracking": person_id,
                    "box": [x1, y1, x2, y2],
                    "emotion": emotion_text,
                    "confidence": confidence
                }
                
                if avatar_actualizado:
                    result_dict["avatar"] = self.face_avatars[person_id]

                results_list.append(result_dict)

        return results_list