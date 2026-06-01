"""
database.py
Capa de persistencia para las correcciones manuales de emociones.

Se usa SQLite (de la librería estándar) por su ligereza y porque encaja
con la filosofía del proyecto: un único fichero, sin servidor de BD aparte.

La ruta del fichero .db se controla con la variable de entorno
SAWUBONA_DB_PATH. Si no está definida, se usa una carpeta por defecto que
vive FUERA del repositorio (~/sawubona_data/), de modo que el 'git clean -fd'
del pipeline de despliegue del CESGA no pueda borrarla nunca.
"""

import os
import sqlite3
import json
from datetime import datetime
from contextlib import contextmanager

# --- 1. Ubicación del fichero de base de datos ---
# Por defecto vive en el HOME del usuario, jamás dentro del repo de git.
# En el CESGA se sobreescribirá con la variable de entorno para apuntar a
# una ruta persistente (por ejemplo $STORE).

# Por defecto el .db vive en  <Escritorio>/SawubonaReloaded/correcciones.db,
# es decir, al mismo nivel que la carpeta del repo (NO dentro de ella), de modo
# que el 'git clean -fd' del pipeline jamás lo pueda borrar.
# En tu equipo esto resuelve a: C:\Users\pedro\Desktop\SawubonaReloaded\correcciones.db
RUTA_POR_DEFECTO = os.path.join(
    os.path.expanduser("~"), "Desktop", "SawubonaReloaded", "correcciones.db"
)
RUTA_DB = os.environ.get("SAWUBONA_DB_PATH", RUTA_POR_DEFECTO)

def _asegurar_directorio():
    """Crea la carpeta contenedora del .db si todavía no existe."""
    carpeta = os.path.dirname(RUTA_DB)
    if carpeta and not os.path.exists(carpeta):
        os.makedirs(carpeta, exist_ok=True)


@contextmanager
def get_conexion():
    """
    Context manager que abre una conexión a SQLite, la entrega al bloque
    'with' y garantiza el commit y el cierre aunque salte una excepción.

    Uso:
        with get_conexion() as conn:
            conn.execute(...)
    """
    _asegurar_directorio()
    conn = sqlite3.connect(RUTA_DB)
    # row_factory = Row permite acceder a las columnas por nombre (fila["hash_video"])
    conn.row_factory = sqlite3.Row
    # Se activan las claves foráneas (SQLite las trae desactivadas por defecto)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def inicializar_db():
    """
    Crea las tablas e índices si no existen. Es idempotente: se puede llamar
    en cada arranque del servidor sin ningún riesgo de borrar datos.

    Tabla 'videos'        -> un registro por vídeo único (identificado por su hash).
    Tabla 'correcciones'  -> cada corrección manual hecha por el usuario.
                             El embedding (huella biométrica de la cara) se guarda
                             como texto JSON para poder reasignar la corrección a la
                             persona correcta al reanalizar, sin depender del número
                             de ID de tracking (que es volátil entre sesiones).
    """
    with get_conexion() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS videos (
                hash_video        TEXT PRIMARY KEY,
                nombre_original   TEXT,
                duracion          REAL,
                primera_vez_visto TEXT
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS correcciones (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                hash_video        TEXT NOT NULL,
                embedding         TEXT NOT NULL,
                segundo_inicio    REAL NOT NULL,
                segundo_fin       REAL NOT NULL,
                emocion_corregida TEXT NOT NULL,
                created_at        TEXT NOT NULL,
                FOREIGN KEY (hash_video) REFERENCES videos (hash_video)
            )
        """)

        # Índice sobre hash_video: la consulta más frecuente será
        # "dame todas las correcciones de este vídeo", así que la aceleramos.
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_correcciones_hash
            ON correcciones (hash_video)
        """)

    print(f"--- Base de datos de correcciones lista en: {RUTA_DB} ---")


# ---------------------------------------------------------------------------
# 2. Serialización del embedding biométrico
# ---------------------------------------------------------------------------
# El embedding que devuelve FaceNet es un tensor/array de 512 floats. SQLite no
# guarda vectores, así que lo convertimos a una lista de Python y la volcamos a
# texto JSON. Al reanalizar, hacemos el camino inverso para reconstruir el vector
# y poder medir distancias (el mismo mecanismo que usa el tracking en detector.py).

def embedding_a_texto(embedding):
    """
    Convierte un embedding (tensor de PyTorch, array de NumPy o lista) en una
    cadena JSON apta para guardar en SQLite.
    """
    # Si es un tensor de PyTorch -> pasamos a CPU y a lista de Python.
    if hasattr(embedding, "detach"):
        valores = embedding.detach().cpu().numpy().flatten().tolist()
    # Si es un array de NumPy -> aplanamos y a lista.
    elif hasattr(embedding, "flatten"):
        valores = embedding.flatten().tolist()
    # Si ya es una lista/iterable normal.
    else:
        valores = list(embedding)

    return json.dumps(valores)


def texto_a_embedding(texto):
    """
    Reconstruye la lista de floats a partir del texto JSON guardado.
    Devuelve una lista de Python; quien la use (detector.py) la convertirá
    a tensor cuando necesite medir distancias.
    """
    return json.loads(texto)


# ---------------------------------------------------------------------------
# 3. Operaciones sobre la tabla 'videos'
# ---------------------------------------------------------------------------

def registrar_video(hash_video, nombre_original, duracion):
    """
    Registra un vídeo la primera vez que se ve. Si el hash ya existe, no hace
    nada (INSERT OR IGNORE), de modo que la fecha de 'primera_vez_visto' se
    conserva intacta aunque el vídeo se reanalice mil veces.
    """
    with get_conexion() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO videos (hash_video, nombre_original, duracion, primera_vez_visto)
            VALUES (?, ?, ?, ?)
            """,
            (hash_video, nombre_original, duracion, datetime.now().isoformat())
        )


def existe_video(hash_video):
    """Devuelve True si el vídeo ya está registrado en la BD."""
    with get_conexion() as conn:
        fila = conn.execute(
            "SELECT 1 FROM videos WHERE hash_video = ?",
            (hash_video,)
        ).fetchone()
        return fila is not None


# ---------------------------------------------------------------------------
# 4. Operaciones sobre la tabla 'correcciones'
# ---------------------------------------------------------------------------

def guardar_correccion(hash_video, embedding, segundo_inicio, segundo_fin, emocion_corregida):
    """
    Guarda una corrección manual. El embedding se serializa a JSON.
    Devuelve el id autoincremental de la corrección recién creada, por si el
    frontend quiere referenciarla luego (editar/borrar).
    """
    embedding_texto = embedding_a_texto(embedding)
    with get_conexion() as conn:
        cursor = conn.execute(
            """
            INSERT INTO correcciones
                (hash_video, embedding, segundo_inicio, segundo_fin, emocion_corregida, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (hash_video, embedding_texto, segundo_inicio, segundo_fin,
             emocion_corregida, datetime.now().isoformat())
        )
        return cursor.lastrowid


def obtener_correcciones(hash_video):
    """
    Devuelve todas las correcciones de un vídeo como una lista de diccionarios.
    El embedding ya viene reconstruido a lista de floats, listo para usar.
    """
    with get_conexion() as conn:
        filas = conn.execute(
            """
            SELECT id, hash_video, embedding, segundo_inicio, segundo_fin, emocion_corregida, created_at
            FROM correcciones
            WHERE hash_video = ?
            ORDER BY segundo_inicio
            """,
            (hash_video,)
        ).fetchall()

    correcciones = []
    for fila in filas:
        correcciones.append({
            "id": fila["id"],
            "hash_video": fila["hash_video"],
            "embedding": texto_a_embedding(fila["embedding"]),
            "segundo_inicio": fila["segundo_inicio"],
            "segundo_fin": fila["segundo_fin"],
            "emocion_corregida": fila["emocion_corregida"],
            "created_at": fila["created_at"],
        })
    return correcciones


def contar_correcciones(hash_video):
    """Devuelve cuántas correcciones tiene un vídeo (para el aviso del frontend)."""
    with get_conexion() as conn:
        fila = conn.execute(
            "SELECT COUNT(*) AS total FROM correcciones WHERE hash_video = ?",
            (hash_video,)
        ).fetchone()
        return fila["total"]


def borrar_correccion(id_correccion):
    """Borra una corrección concreta por su id. Devuelve True si borró algo."""
    with get_conexion() as conn:
        cursor = conn.execute(
            "DELETE FROM correcciones WHERE id = ?",
            (id_correccion,)
        )
        return cursor.rowcount > 0

# Permite probar el módulo de forma aislada con:  python database.py
# Debe crear el fichero .db y las tablas, e imprimir la ruta.
if __name__ == "__main__":
    inicializar_db()
    print("Esquema verificado correctamente.")