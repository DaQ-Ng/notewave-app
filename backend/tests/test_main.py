import io
import json
import logging
import os

import pytest
import redis
from fastapi import HTTPException, UploadFile

from app import main

# Smallest thing that passes the MP3 signature check: an ID3 header plus some bytes
MP3_BYTES = b"ID3" + b"\x00" * 100


def upload(client, data=MP3_BYTES, filename="song.mp3", content_type="audio/mpeg"):
    return client.post("/upload", files={"file": (filename, data, content_type)})


# ---------- GET / (health check) ----------

def test_health_ok_when_redis_answers(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_health_503_when_redis_is_down(client, monkeypatch):
    def broken_ping():
        raise redis.ConnectionError("no redis")

    monkeypatch.setattr(main.redis_client, "ping", broken_ping)
    response = client.get("/")
    assert response.status_code == 503
    assert response.json() == {"status": "error", "message": "Redis is unreachable"}


# ---------- POST /upload ----------

def test_upload_starts_job_and_keeps_temp_file_for_worker(client, enqueued, temp_dir):
    response = upload(client)
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "processing"

    # Exactly one job was queued, and its temp file holds the exact uploaded bytes
    assert len(enqueued) == 1
    _, job_id, path, file_hash = enqueued[0]
    assert job_id == body["job_id"]
    assert file_hash == body["file_hash"]
    with open(path, "rb") as f:
        assert f.read() == MP3_BYTES


@pytest.mark.parametrize(
    "filename, content_type, data",
    [
        ("song.wav", "audio/mpeg", MP3_BYTES),     # wrong extension
        ("song.mp3", "text/plain", MP3_BYTES),     # wrong content type
        ("song.mp3", "audio/mpeg", b"not an mp3"),  # wrong signature
    ],
)
def test_upload_rejects_bad_files_without_leaving_temp_files(client, temp_dir, filename, content_type, data):
    response = upload(client, data=data, filename=filename, content_type=content_type)
    assert response.status_code == 400
    assert list(temp_dir.iterdir()) == []


def test_upload_rejects_too_large_file(client, monkeypatch, temp_dir):
    monkeypatch.setattr(main, "MAX_FILE_SIZE", 50)
    response = upload(client)
    assert response.status_code == 413
    assert list(temp_dir.iterdir()) == []


def test_cached_song_returns_notes_without_new_job(client, fake_redis, enqueued, temp_dir):
    first = upload(client).json()
    cached = {"notes": [{"note": "A4", "start": 0.0, "end": 1.0}], "audio": {"duration_seconds": 1.0}}
    main.save_cached_result(first["file_hash"], cached)

    second = upload(client).json()
    assert second["status"] == "done"
    assert second["notes"] == cached["notes"]
    assert len(enqueued) == 1  # only the first upload was queued
    assert len(list(temp_dir.iterdir())) == 1  # the second upload's temp file was deleted


def test_upload_503_and_cleans_up_when_queue_fails(client, monkeypatch, temp_dir):
    def broken_enqueue(*args):
        raise redis.ConnectionError("no redis")

    monkeypatch.setattr(main.job_queue, "enqueue", broken_enqueue)
    response = upload(client)
    assert response.status_code == 503
    assert list(temp_dir.iterdir()) == []


# ---------- save_upload_to_temp (streaming size limit) ----------

def test_streaming_limit_works_when_size_is_unknown(monkeypatch, temp_dir):
    # UploadFile built by hand has size=None, which is the case Check 3 can't catch
    monkeypatch.setattr(main, "MAX_FILE_SIZE", 10)
    monkeypatch.setattr(main, "CHUNK_SIZE", 4)
    file = UploadFile(file=io.BytesIO(b"x" * 20))
    assert file.size is None

    with pytest.raises(HTTPException) as error:
        main.save_upload_to_temp(file)
    assert error.value.status_code == 413
    assert list(temp_dir.iterdir()) == []


def test_streaming_copy_matches_bytes_and_hash(monkeypatch, temp_dir):
    import hashlib

    monkeypatch.setattr(main, "CHUNK_SIZE", 7)  # force several chunks
    data = bytes(range(256)) * 3
    path, file_hash = main.save_upload_to_temp(UploadFile(file=io.BytesIO(data)))
    with open(path, "rb") as f:
        assert f.read() == data
    assert file_hash == hashlib.sha256(data).hexdigest()


# ---------- run_job (background worker) ----------

def test_run_job_success_saves_result_and_deletes_file(fake_redis, monkeypatch, tmp_path):
    path = tmp_path / "song.mp3"
    path.write_bytes(MP3_BYTES)
    notes = [{"note": "C4", "start": 0.0, "end": 0.5}]
    monkeypatch.setattr(main, "load_audio_info", lambda p: {"duration_seconds": 0.5})
    monkeypatch.setattr(main, "detect_notes", lambda p: notes)

    main.run_job("job-1", str(path), "hash-1")

    assert main.load_job("job-1")["status"] == "done"
    assert main.load_cached_result("hash-1")["notes"] == notes
    assert not path.exists()


def test_run_job_failure_is_logged_and_marked_failed(fake_redis, monkeypatch, tmp_path, caplog):
    path = tmp_path / "song.mp3"
    path.write_bytes(MP3_BYTES)

    def broken_load(p):
        raise ValueError("The audio file contains no samples")

    monkeypatch.setattr(main, "load_audio_info", broken_load)

    with caplog.at_level(logging.ERROR, logger="notewave"):
        main.run_job("job-2", str(path), "hash-2")

    assert main.load_job("job-2")["status"] == "failed"
    assert "Job job-2 failed" in caplog.text
    assert "contains no samples" in caplog.text  # the traceback is in the log
    assert not path.exists()


# ---------- GET /jobs/{job_id} ----------

def test_get_job_returns_saved_job(client):
    job_id = upload(client).json()["job_id"]
    response = client.get(f"/jobs/{job_id}")
    assert response.status_code == 200
    assert response.json()["status"] == "processing"


def test_get_unknown_job_is_404(client):
    assert client.get("/jobs/does-not-exist").status_code == 404
