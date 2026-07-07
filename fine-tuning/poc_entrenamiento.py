import tensorflow as tf
from tensorflow import keras
import numpy as np
import os

# 1. RUTAS
RUTA_MODELO_ACTUAL = "../backend/modelos/emotion_model.hdf5"
RUTA_DATASET = "dataset/train"
RUTA_NUEVO_MODELO = "modelo_finetuned_v1.hdf5"

print("Cargando imágenes del dataset...")

# 2. CARGAR Y PREPROCESAR DATOS (Directo a 64x64 y Escala de grises)
train_dataset = keras.utils.image_dataset_from_directory(
    RUTA_DATASET,
    color_mode="grayscale",
    image_size=(64, 64),
    batch_size=32,
    label_mode="categorical" # se usa one-hot encoding, vital para el .hdf5
)

# 3. NORMALIZAR LOS PÍXELES (De 0-255 a 0.0-1.0)
normalization_layer = keras.layers.Rescaling(1./255)
train_dataset = train_dataset.map(lambda x, y: (normalization_layer(x), y))

print("Cargando el modelo base...")

# 4. CARGAR EL MODELO ACTUAL
modelo = keras.models.load_model(RUTA_MODELO_ACTUAL, compile=False)

# 5. TRANSFER LEARNING: CONGELAR CAPAS INFERIORES
# se bloquea el entrenamiento de casi todas las capas para no romper el detector base
# solo se dejan "descongeladas" las últimas 4 capas (las que toman la decisión final)
for layer in modelo.layers[:-4]:
    layer.trainable = False

for layer in modelo.layers[-4:]:
    layer.trainable = True

print("Compilando el modelo con un Learning Rate microscópico...")

# 6. RECOMPILAR (con un optimizador súper lento para ajustar con cuidado)
modelo.compile(
    optimizer=keras.optimizers.Adam(learning_rate=1e-5),
    loss="categorical_crossentropy",
    metrics=["accuracy"]
)

print("Iniciando el reentrenamiento (Fine-Tuning)...")

# 7. ENTRENAR (pocas épocas, es solo una PoC)
historial = modelo.fit(
    train_dataset,
    epochs=10
)

print("Entrenamiento finalizado. Guardando el nuevo modelo...")

# 8. GUARDAR EL RESULTADO AISLADO
modelo.save(RUTA_NUEVO_MODELO)
print(f"¡Éxito! Nuevo modelo guardado en: {RUTA_NUEVO_MODELO}")