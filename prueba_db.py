from backend import database as db

db.inicializar_db()

# Embedding de mentira (10 floats en vez de 512, da igual para la prueba)
emb_falso = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]

db.registrar_video("hash_de_prueba_123", "video_test.mp4", 42.5)
print("¿Existe el vídeo?:", db.existe_video("hash_de_prueba_123"))

nuevo_id = db.guardar_correccion("hash_de_prueba_123", emb_falso, 5.0, 8.0, "Enfado")
print("Corrección guardada con id:", nuevo_id)

print("Nº de correcciones:", db.contar_correcciones("hash_de_prueba_123"))

correcciones = db.obtener_correcciones("hash_de_prueba_123")
print("Correcciones leídas:", correcciones)

# Comprobamos que el embedding se reconstruye igual que se guardó
print("Embedding reconstruido:", correcciones[0]["embedding"])
print("¿Coincide con el original?:", correcciones[0]["embedding"] == emb_falso)