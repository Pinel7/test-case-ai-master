import sys
import os
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


@pytest.fixture(autouse=True)
def _test_env(monkeypatch):
    """Redirect all databases to a temp directory."""
    tmpdir = tempfile.mkdtemp()
    tmp = Path(tmpdir)
    monkeypatch.setattr("app.services.database.DB_DIR", tmp)
    monkeypatch.setattr("app.services.database.DB_PATH", tmp / "library.db")
    monkeypatch.setattr("app.services.auth.DB_DIR", tmp)
    monkeypatch.setattr("app.services.auth.AUTH_DB_PATH", tmp / "auth.db")
    monkeypatch.setattr("app.services.sql_runner.TEST_DB_DIR", tmp)
    monkeypatch.setattr("app.services.sql_runner.TEST_DB_PATH", tmp / "test_data.db")
    # Re-initialize databases in the temp directory
    from app.services.database import _init_db as init_library_db
    init_library_db()
    from app.services.auth import init_auth_db
    init_auth_db()
    yield
    shutil.rmtree(tmpdir, ignore_errors=True)


@pytest.fixture
def db():
    from app.services import database
    return database


@pytest.fixture
def auth():
    from app.services import auth
    return auth


@pytest.fixture
def exporter():
    from app.services import exporter
    return exporter
