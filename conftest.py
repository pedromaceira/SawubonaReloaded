import os
import tempfile

os.environ["SAWUBONA_SKIP_MODELS"] = "1"

_DB_TMP = os.path.join(tempfile.gettempdir(), "sawubona_test.db")
os.environ["SAWUBONA_DB_PATH"] = _DB_TMP

import pytest
from backend import database


@pytest.fixture(autouse=True)
def _bd_limpia():
    if os.path.exists(_DB_TMP):
        os.remove(_DB_TMP)
    database.inicializar_db()
    yield
    if os.path.exists(_DB_TMP):
        os.remove(_DB_TMP)