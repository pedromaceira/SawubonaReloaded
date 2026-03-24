import os
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

gpus = tf.config.list_physical_devices('GPU')
if gpus:
    try:
        for gpu in gpus:
            tf.config.experimental.set_memory_growth(gpu, True)
    except RuntimeError as e:
        print(f"Error configurando la memoria: {e}")

class EmotionDetector:
    def __init__(self, yolo_path, emotion_model_path):
        self.face_detector = YOLO(yolo_path)
        self.face_detector.to('cuda')

        self.emotion_classifier = load_model(emotion_model_path, compile=False)
        self.emotions = ["Enfado", "Disgusto", "Miedo", "Felicidad", "Tristeza", "Sorpresa", "Neutral"]

        print("Cargando modelo FaceNet en GPU...")
        self.facenet = InceptionResnetV1(pretrained='vggface2').eval().to('cuda')

        self.trans = transforms.Compose([
            transforms.ToTensor(),
            transforms.Resize((160, 160)),
            transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
        ])

        self.known_faces = []
        self.next_id = 1

        # se mantiene la tolerancia biométrica alta para evitar saltos de ID
        self.match_threshold = 1.15

        print("Warm up de la CPU... por favor espera.")
        try:
            dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            # se caliente con el nuevo umbral de YOLO (0.20)
            self.face_detector.predict(dummy_frame, conf=0.20, verbose=False, device=0)

            dummy_tensor = torch.zeros((1, 3, 160, 160), device='cuda')
            with torch.no_grad():
                self.facenet(dummy_tensor)

            dummy_face = np.zeros((1, 64, 64, 1), dtype=np.float32)
            self.emotion_classifier.predict(dummy_face, verbose=0)

            print("¡GPU lista!")
        except Exception as e:
            print(f"Advertencia durante el calentamiento: {e}")

    def reset_memory(self):
        self.known_faces = []
        self.next_id = 1
        print("--- Memoria biométrica formateada para el nuevo vídeo ---")

    def get_face_id(self, face_crop):
        face_rgb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2RGB)
        face_tensor = self.trans(face_rgb).unsqueeze(0).to('cuda')

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

    def detect_and_classify(self, frame):
        results_list = []

        # confianza más permisiva para encontrar caras en peores ángulos
        results = self.face_detector.predict(frame, conf=0.20, verbose=False, device=0)

        for r in results:
            boxes = r.boxes.xyxy.cpu().numpy()

            for box in boxes:
                x1, y1, x2, y2 = map(int, box)

                # permitimos caras más pequeñas (20x20) para planos generales
                ancho = x2 - x1
                alto = y2 - y1
                if ancho < 20 or alto < 20:
                    continue

                face_crop = frame[y1:y2, x1:x2]
                if face_crop.size == 0:
                    continue

                # filtro Laplaciano muy bajo (5.0) para tolerar webcams y luz natural
                gray_face = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
                focus_measure = cv2.Laplacian(gray_face, cv2.CV_64F).var()

                if focus_measure < 5.0:
                    continue

                person_id = self.get_face_id(face_crop)

                processed_face = preprocess_face(face_crop)
                prediction = self.emotion_classifier.predict(processed_face, verbose=0)
                emotion_idx = np.argmax(prediction)
                emotion_text = self.emotions[emotion_idx]
                confidence = float(np.max(prediction))

                results_list.append({
                    "id_tracking": person_id,
                    "box": [x1, y1, x2, y2],
                    "emotion": emotion_text,
                    "confidence": confidence
                })

        return results_list