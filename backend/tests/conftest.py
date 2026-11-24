import sys
import tempfile
import types

import fakeredis
import pytest
from fastapi.testclient import TestClient

# The tests never decode real audio, so if librosa isn't installed, use an empty stand-in module.
try:
    import librosa  # noqa: F401
except ImportError:
    sys.modules["librosa"] = types.ModuleType("librosa")

from app import main


@pytest.fixture
def fake_redis(monkeypatch):
    # An in-memory Redis, so tests don't need a real Redis server running
    client = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(main, "redis_client", client)
    return client


@pytest.fixture
def enqueued(monkeypatch):
    # Record queued jobs instead of sending them to a real RQ worker
    calls = []
    monkeypatch.setattr(main.job_queue, "enqueue", lambda *args: calls.append(args))
    return calls


@pytest.fixture
def temp_dir(monkeypatch, tmp_path):
    # Make every NamedTemporaryFile land in a fresh folder, so tests can check nothing was left behind
    monkeypatch.setattr(tempfile, "tempdir", str(tmp_path))
    return tmp_path


@pytest.fixture
def client(fake_redis, enqueued, temp_dir):
    return TestClient(main.app)
