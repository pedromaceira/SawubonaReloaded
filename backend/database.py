"""
database.py
Capa de persistencia: correcciones manuales y sesiones de trabajo.

SQLite (stdlib). La ruta del .db se controla con SAWUBONA_DB_PATH; por
defecto vive fuera del repositorio para sobrevivir al 'git clean -fd'.

Modelo:
  - videos        : un registro por vídeo único (hash).
  - sesiones      : una sesión de trabajo sobre un vídeo (snapshot + segundo).
  - correcciones  : correcciones manuales, AHORA ligadas a una sesión (session_id),
                    de modo que un mismo vídeo puede tener varias sesiones con
                    correcciones distintas. La coincidencia sigue siendo por embedding.
"""

import os
import sqlite3
import json
from datetime import datetime
from contextlib import contextmanager

RUTA_POR_DEFECTO = os.path.join(
    os.path.expanduser("~"), "Desktop", "SawubonaReloaded", "correcciones.db"
)
RUTA_DB = os.environ.get("SAWUBONA_DB_PATH", RUTA_POR_DEFECTO)


def _asegurar_directorio():
    carpeta = os.path.dirname(RUTA_DB)
    if carpeta and not os.path.exists(carpeta):
        os.makedirs(carpeta, exist_ok=True)


@contextmanager
def get_conexion():
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
            CREATE TABLE IF NOT EXISTS sesiones (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                hash_video      TEXT NOT NULL,
                nombre_original TEXT,
                nombre_sesion   TEXT,
                segundo_actual  REAL DEFAULT 0,
                snapshot        TEXT,
                created_at      TEXT NOT NULL,
                updated_at      TEXT NOT NULL
            )
        """)

        conn.execute("""
            CREATE TABLE IF NOT EXISTS correcciones (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id        INTEGER,
                hash_video        TEXT NOT NULL,
                embedding         TEXT NOT NULL,
                id_tracking       INTEGER,
                segundo_inicio    REAL NOT NULL,
                segundo_fin       REAL NOT NULL,
                emocion_corregida TEXT NOT NULL,
                created_at        TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sesiones (id)
            )
        """)

        columnas = [f["name"] for f in conn.execute("PRAGMA table_info(correcciones)").fetchall()]
        if "id_tracking" not in columnas:
            conn.execute("ALTER TABLE correcciones ADD COLUMN id_tracking INTEGER")
        if "session_id" not in columnas:
            conn.execute("ALTER TABLE correcciones ADD COLUMN session_id INTEGER")

        conn.execute("CREATE INDEX IF NOT EXISTS idx_correcciones_sesion ON correcciones (session_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sesiones_hash ON sesiones (hash_video)")

    print(f"--- Base de datos lista en: {RUTA_DB} ---")

def embedding_a_texto(embedding):
    if hasattr(embedding, "detach"):
        valores = embedding.detach().cpu().numpy().flatten().tolist()
    elif hasattr(embedding, "flatten"):
        valores = embedding.flatten().tolist()
    else:
        valores = list(embedding)
    return json.dumps(valores)


def texto_a_embedding(texto):
    return json.loads(texto)

def registrar_video(hash_video, nombre_original, duracion):
    with get_conexion() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO videos (hash_video, nombre_original, duracion, primera_vez_visto)
            VALUES (?, ?, ?, ?)
            """,
            (hash_video, nombre_original, duracion, datetime.now().isoformat())
        )

def crear_sesion(hash_video, nombre_original="", nombre_sesion=None):
    ahora = datetime.now().isoformat()
    with get_conexion() as conn:
        cursor = conn.execute(
            """
            INSERT INTO sesiones (hash_video, nombre_original, nombre_sesion, segundo_actual, snapshot, created_at, updated_at)
            VALUES (?, ?, ?, 0, NULL, ?, ?)
            """,
            (hash_video, nombre_original, nombre_sesion, ahora, ahora)
        )
        nuevo_id = cursor.lastrowid
        if not nombre_sesion:
            conn.execute(
                "UPDATE sesiones SET nombre_sesion = ? WHERE id = ?",
                (f"Sesión {nuevo_id}", nuevo_id)
            )
        return nuevo_id


def listar_sesiones(hash_video):
    """Lista las sesiones de un vídeo, con su nº de correcciones, más recientes primero."""
    with get_conexion() as conn:
        filas = conn.execute(
            """
            SELECT s.id, s.nombre_sesion, s.nombre_original, s.segundo_actual, s.created_at, s.updated_at,
                   (SELECT COUNT(*) FROM correcciones c WHERE c.session_id = s.id) AS num_correcciones
            FROM sesiones s
            WHERE s.hash_video = ?
            ORDER BY s.updated_at DESC
            """,
            (hash_video,)
        ).fetchall()
    return [{
        "id": f["id"],
        "nombre_sesion": f["nombre_sesion"],
        "nombre_original": f["nombre_original"],
        "segundo_actual": f["segundo_actual"],
        "created_at": f["created_at"],
        "updated_at": f["updated_at"],
        "num_correcciones": f["num_correcciones"],
    } for f in filas]


def obtener_sesion(session_id):
    """Devuelve una sesión con su snapshot ya deserializado (o None si no existe)."""
    with get_conexion() as conn:
        f = conn.execute(
            "SELECT * FROM sesiones WHERE id = ?",
            (session_id,)
        ).fetchone()
    if f is None:
        return None
    snapshot = None
    if f["snapshot"]:
        try:
            snapshot = json.loads(f["snapshot"])
        except Exception:
            snapshot = None
    return {
        "id": f["id"],
        "hash_video": f["hash_video"],
        "nombre_original": f["nombre_original"],
        "nombre_sesion": f["nombre_sesion"],
        "segundo_actual": f["segundo_actual"],
        "snapshot": snapshot,
        "created_at": f["created_at"],
        "updated_at": f["updated_at"],
    }


def guardar_estado_sesion(session_id, segundo_actual, snapshot):
    """Actualiza el snapshot del análisis y el segundo donde se dejó la sesión."""
    snapshot_texto = json.dumps(snapshot) if snapshot is not None else None
    with get_conexion() as conn:
        conn.execute(
            """
            UPDATE sesiones
            SET segundo_actual = ?, snapshot = ?, updated_at = ?
            WHERE id = ?
            """,
            (segundo_actual, snapshot_texto, datetime.now().isoformat(), session_id)
        )


def borrar_sesion(session_id):
    """Borra una sesión y todas sus correcciones."""
    with get_conexion() as conn:
        conn.execute("DELETE FROM correcciones WHERE session_id = ?", (session_id,))
        cursor = conn.execute("DELETE FROM sesiones WHERE id = ?", (session_id,))
        return cursor.rowcount > 0


def guardar_correccion(session_id, hash_video, embedding, segundo_inicio, segundo_fin,
                       emocion_corregida, id_tracking=None):
    embedding_texto = embedding_a_texto(embedding)
    with get_conexion() as conn:
        cursor = conn.execute(
            """
            INSERT INTO correcciones
                (session_id, hash_video, embedding, id_tracking, segundo_inicio, segundo_fin, emocion_corregida, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (session_id, hash_video, embedding_texto, id_tracking, segundo_inicio, segundo_fin,
             emocion_corregida, datetime.now().isoformat())
        )
        return cursor.lastrowid


def reemplazar_correcciones_sesion(session_id, hash_video, lista):
    ahora = datetime.now().isoformat()
    with get_conexion() as conn:
        conn.execute("DELETE FROM correcciones WHERE session_id = ?", (session_id,))
        for c in lista:
            conn.execute(
                """
                INSERT INTO correcciones
                    (session_id, hash_video, embedding, id_tracking, segundo_inicio, segundo_fin, emocion_corregida, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (session_id, hash_video, embedding_a_texto(c["embedding"]), c.get("id_tracking"),
                 c["segundo_inicio"], c["segundo_fin"], c["emocion_corregida"], ahora)
            )
        return len(lista)


def obtener_correcciones_sesion(session_id):
    with get_conexion() as conn:
        filas = conn.execute(
            """
            SELECT id, session_id, hash_video, embedding, id_tracking, segundo_inicio, segundo_fin, emocion_corregida, created_at
            FROM correcciones
            WHERE session_id = ?
            ORDER BY segundo_inicio
            """,
            (session_id,)
        ).fetchall()
    correcciones = []
    for f in filas:
        correcciones.append({
            "id": f["id"],
            "session_id": f["session_id"],
            "hash_video": f["hash_video"],
            "embedding": texto_a_embedding(f["embedding"]),
            "id_tracking": f["id_tracking"],
            "segundo_inicio": f["segundo_inicio"],
            "segundo_fin": f["segundo_fin"],
            "emocion_corregida": f["emocion_corregida"],
            "created_at": f["created_at"],
        })
    return correcciones


def borrar_correccion(id_correccion):
    with get_conexion() as conn:
        cursor = conn.execute("DELETE FROM correcciones WHERE id = ?", (id_correccion,))
        return cursor.rowcount > 0


if __name__ == "__main__":
    inicializar_db()
    print("Esquema verificado correctamente.")