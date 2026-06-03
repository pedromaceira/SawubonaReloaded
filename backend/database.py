"""
database.py
Capa de persistencia para las correcciones manuales de emociones.

Se usa SQLite (de la librería estándar) por su ligereza y porque encaja
con la filosofía del proyecto: un único fichero, sin servidor de BD aparte.

La ruta del fichero .db se controla con la variable de entorno
SAWUBONA_DB_PATH. Si no está definida, se usa una carpeta por defecto que
vive FUERA del repositorio, de modo que el 'git clean -fd' del pipeline de
despliegue del CESGA no pueda borrarla nunca.
"""

import os
import sqlite3
import json
from datetime import datetime
from contextlib import contextmanager

# --- 1. Ubicación del fichero de base de datos ---
# Por defecto el .db vive en  <Escritorio>/SawubonaReloaded/correcciones.db,
# es decir, al mismo nivel que la carpeta del repo (NO dentro de ella).
# En el CESGA se sobreescribirá con la variable de entorno para apuntar a
# una ruta persistente (por ejemplo $STORE).
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
    """
    _asegurar_directorio()
    conn = sqlite3.connect(RUTA_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def inicializar_db():
    """
    Crea las tablas e índices si no existen. Es idempotente.

    Nota sobre 'id_tracking' en la tabla correcciones: es solo una ETIQUETA
    informativa (el número de cara que vio el usuario al corregir), para poder
    mostrarlo en la interfaz. La coincidencia real al reanalizar se hace por
    embedding, no por este número.
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
                id_tracking       INTEGER,
                segundo_inicio    REAL NOT NULL,
                segundo_fin       REAL NOT NULL,
                emocion_corregida TEXT NOT NULL,
                created_at        TEXT NOT NULL,
                FOREIGN KEY (hash_video) REFERENCES videos (hash_video)
            )
        """)

        # Migración para BD de versiones anteriores: si falta la columna
        # id_tracking, se añade (las filas antiguas quedarán con NULL).
        columnas = [fila["name"] for fila in conn.execute("PRAGMA table_info(correcciones)").fetchall()]
        if "id_tracking" not in columnas:
            conn.execute("ALTER TABLE correcciones ADD COLUMN id_tracking INTEGER")

        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_correcciones_hash
            ON correcciones (hash_video)
        """)

    print(f"--- Base de datos de correcciones lista en: {RUTA_DB} ---")


# ---------------------------------------------------------------------------
# 2. Serialización del embedding biométrico
# ---------------------------------------------------------------------------

def embedding_a_texto(embedding):
    """Convierte un embedding (tensor PyTorch, array NumPy o lista) en texto JSON."""
    if hasattr(embedding, "detach"):
        valores = embedding.detach().cpu().numpy().flatten().tolist()
    elif hasattr(embedding, "flatten"):
        valores = embedding.flatten().tolist()
    else:
        valores = list(embedding)
    return json.dumps(valores)


def texto_a_embedding(texto):
    """Reconstruye la lista de floats a partir del texto JSON guardado."""
    return json.loads(texto)


# ---------------------------------------------------------------------------
# 3. Operaciones sobre la tabla 'videos'
# ---------------------------------------------------------------------------

def registrar_video(hash_video, nombre_original, duracion):
    """Registra un vídeo la primera vez que se ve (no pisa la fecha si ya existe)."""
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

def guardar_correccion(hash_video, embedding, segundo_inicio, segundo_fin,
                       emocion_corregida, id_tracking=None):
    """
    Guarda una corrección manual. El embedding se serializa a JSON.
    'id_tracking' se guarda solo como etiqueta para mostrarla luego.
    Devuelve el id autoincremental de la corrección creada.
    """
    embedding_texto = embedding_a_texto(embedding)
    with get_conexion() as conn:
        cursor = conn.execute(
            """
            INSERT INTO correcciones
                (hash_video, embedding, id_tracking, segundo_inicio, segundo_fin, emocion_corregida, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (hash_video, embedding_texto, id_tracking, segundo_inicio, segundo_fin,
             emocion_corregida, datetime.now().isoformat())
        )
        return cursor.lastrowid


def obtener_correcciones(hash_video):
    """
    Devuelve todas las correcciones de un vídeo como lista de diccionarios,
    con el embedding ya reconstruido a lista de floats.
    """
    with get_conexion() as conn:
        filas = conn.execute(
            """
            SELECT id, hash_video, embedding, id_tracking, segundo_inicio, segundo_fin, emocion_corregida, created_at
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
            "id_tracking": fila["id_tracking"],
            "segundo_inicio": fila["segundo_inicio"],
            "segundo_fin": fila["segundo_fin"],
            "emocion_corregida": fila["emocion_corregida"],
            "created_at": fila["created_at"],
        })
    return correcciones


def contar_correcciones(hash_video):
    """Devuelve cuántas correcciones tiene un vídeo."""
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


if __name__ == "__main__":
    inicializar_db()
    print("Esquema verificado correctamente.")