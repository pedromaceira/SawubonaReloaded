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

# Poner en False para silenciar el log de diagnostico de deteccion
DEBUG_DETECCION = False
DEBUG_IDENTIDAD = False

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
        self.match_threshold = 1.25

        self.face_avatars = {}
        self.face_avatars_metrics = {}

        self.correcciones_activas = []

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
        self.correcciones_activas = []
        print("--- Memoria biométrica y galería formateadas para el nuevo vídeo ---")

    def get_face_id(self, face_crop):
        face_rgb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
        face_tensor = self.trans(face_rgb).unsqueeze(0).to(self.device)

        with torch.no_grad():
            embedding = self.facenet(face_tensor)

        if len(self.known_faces) == 0:
            self.known_faces.append((self.next_id, embedding))
            self.next_id += 1
            if DEBUG_IDENTIDAD:
                print(f"[ID] NUEVA Cara {self.next_id - 1} (primera cara)")
            return self.next_id - 1

        min_dist = float('inf')
        best_id = None

        for face_id, known_emb in self.known_faces:
            dist = torch.dist(embedding, known_emb).item()
            if dist < min_dist:
                min_dist = dist
                best_id = face_id

        if min_dist < self.match_threshold:
            if DEBUG_IDENTIDAD:
                print(f"[ID] MATCH Cara {best_id} dist={min_dist:.3f} (umbral={self.match_threshold})")
            return best_id
        else:
            self.known_faces.append((self.next_id, embedding))
            self.next_id += 1
            if DEBUG_IDENTIDAD:
                print(f"[ID] NUEVA Cara {self.next_id - 1} dist_min={min_dist:.3f} > umbral={self.match_threshold} (mas parecida: Cara {best_id})")
            return self.next_id - 1

    def obtener_embedding_por_id(self, person_id):
        for face_id, known_emb in self.known_faces:
            if face_id == person_id:
                return known_emb
        return None

    def cargar_correcciones(self, lista_correcciones):
        self.correcciones_activas = []
        for c in lista_correcciones:
            emb = torch.tensor(c["embedding"], dtype=torch.float32, device=self.device).unsqueeze(0)
            self.correcciones_activas.append({
                "embedding": emb,
                "id_tracking": c.get("id_tracking"),
                "inicio": c["segundo_inicio"],
                "fin": c["segundo_fin"],
                "emocion": c["emocion_corregida"]
            })
        return len(self.correcciones_activas)

    def exportar_memoria(self):
        faces = []
        for face_id, emb in self.known_faces:
            faces.append({
                "id": face_id,
                "embedding": emb.detach().cpu().numpy().flatten().tolist()
            })
        return {"known_faces": faces, "next_id": self.next_id}

    def importar_memoria(self, memoria):
        self.known_faces = []
        for f in memoria.get("known_faces", []):
            emb = torch.tensor(f["embedding"], dtype=torch.float32, device=self.device).unsqueeze(0)
            self.known_faces.append((f["id"], emb))
        self.next_id = memoria.get("next_id", len(self.known_faces) + 1)

    def aplicar_correccion(self, person_id, tiempo_actual):
        if not self.correcciones_activas:
            return None

        emb_persona = self.obtener_embedding_por_id(person_id)
        if emb_persona is None:
            return None

        for corr in self.correcciones_activas:
            if corr["inicio"] <= tiempo_actual <= corr["fin"]:
                dist = torch.dist(emb_persona, corr["embedding"]).item()
                if dist < self.match_threshold:
                    return corr["emocion"]
        return None

    def agregar_correccion_memoria(self, id_tracking, segundo_inicio, segundo_fin, emocion):
        emb = self.obtener_embedding_por_id(id_tracking)
        if emb is None:
            return None
        self.correcciones_activas.append({
            "embedding": emb,
            "id_tracking": id_tracking,
            "inicio": segundo_inicio,
            "fin": segundo_fin,
            "emocion": emocion
        })
        return len(self.correcciones_activas) - 1

    def eliminar_correccion_memoria(self, indice):
        if 0 <= indice < len(self.correcciones_activas):
            del self.correcciones_activas[indice]
            return True
        return False

    def listar_correcciones_memoria(self):
        salida = []
        for i, c in enumerate(self.correcciones_activas):
            salida.append({
                "indice": i,
                "id_tracking": c.get("id_tracking"),
                "segundo_inicio": c["inicio"],
                "segundo_fin": c["fin"],
                "emocion_corregida": c["emocion"]
            })
        return salida

    def exportar_correcciones_memoria(self):
        salida = []
        for c in self.correcciones_activas:
            salida.append({
                "embedding": c["embedding"].detach().cpu().numpy().flatten().tolist(),
                "id_tracking": c.get("id_tracking"),
                "segundo_inicio": c["inicio"],
                "segundo_fin": c["fin"],
                "emocion_corregida": c["emocion"]
            })
        return salida

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

    def detect_and_classify(self, frame, is_screen_share=False, tiempo_actual=None):
        results_list = []

        umbral_alto = 30 if is_screen_share else 45
        umbral_ancho = 20 if is_screen_share else 30
        umbral_foco = 2.0 if is_screen_share else 2.0
        umbral_ratio = 0.58 if is_screen_share else 0.50
        umbral_ratio_max = 1.50

        results = self.face_detector.predict(frame, conf=0.20, verbose=False)

        rechazos = {"tamano": 0, "ratio": 0, "foco": 0}
        aceptadas = 0
        total_cajas = 0

        for r in results:
            boxes = r.boxes.xyxy.cpu().numpy()

            for box in boxes:
                total_cajas += 1
                x1, y1, x2, y2 = map(int, box)

                ancho = x2 - x1
                alto = y2 - y1

                if alto < umbral_alto or ancho < umbral_ancho:
                    rechazos["tamano"] += 1
                    if DEBUG_DETECCION:
                        print(f"[DET] RECHAZO tamano  box=({x1},{y1},{x2},{y2}) ancho={ancho} alto={alto} (min ancho={umbral_ancho} alto={umbral_alto})")
                    continue

                aspect_ratio = ancho / alto

                if aspect_ratio < umbral_ratio or aspect_ratio > umbral_ratio_max:
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
                        rechazos["ratio"] += 1
                        if DEBUG_DETECCION:
                            print(f"[DET] RECHAZO ratio   box=({x1},{y1},{x2},{y2}) ratio={aspect_ratio:.2f} (rango {umbral_ratio}-{umbral_ratio_max})")
                        continue

                face_crop = frame[y1:y2, x1:x2]
                if face_crop.size == 0:
                    continue

                gray_face = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
                focus_measure = cv2.Laplacian(gray_face, cv2.CV_64F).var()

                if focus_measure < umbral_foco:
                    rechazos["foco"] += 1
                    if DEBUG_DETECCION:
                        print(f"[DET] RECHAZO foco    box=({x1},{y1},{x2},{y2}) foco={focus_measure:.2f} (umbral={umbral_foco})")
                    continue

                aceptadas += 1
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

                corregido = False
                if tiempo_actual is not None:
                    emocion_corregida = self.aplicar_correccion(person_id, tiempo_actual)
                    if emocion_corregida is not None:
                        emotion_text = emocion_corregida
                        confidence = 1.0
                        corregido = True

                result_dict = {
                    "id_tracking": person_id,
                    "box": [x1, y1, x2, y2],
                    "emotion": emotion_text,
                    "confidence": confidence,
                    "corregido": corregido
                }

                if avatar_actualizado:
                    result_dict["avatar"] = self.face_avatars[person_id]

                results_list.append(result_dict)

        if DEBUG_DETECCION and total_cajas > 0:
            print(f"[DET] frame -> YOLO={total_cajas} aceptadas={aceptadas} | rechazos tam={rechazos['tamano']} ratio={rechazos['ratio']} foco={rechazos['foco']}")

        return results_list