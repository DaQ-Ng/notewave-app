from fastapi import FastAPI, UploadFile, HTTPException
from .transcription import router as transcription_router
# Import our function for loading audio information.
from app.audio_processing import load_audio_info
# import CORSMiddleware to allow using other websites/ports (in this case, diff localhosts)
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import tempfile
import time
import uuid # Make unique id
import hashlib
import json
import redis
from rq import Queue


app = FastAPI(title="NoteWave API")

# Include your transcription router from transcription.py
app.include_router(transcription_router)

ALLOWED_CONTENT_TYPES = {"audio/mpeg", "audio/mp3"}
MAX_FILE_SIZE = 25 * 1024 * 1024 # 25 MB in bytes
CACHE_TTL_SECONDS = 86400
JOB_TTL_SECONDS = 3600
redis_client = redis.Redis(host = "localhost", port=6379, decode_responses=True)
queue_redis = redis.Redis(host="localhost", port=6379) # creates the connection to Redis
job_queue = Queue(connection=queue_redis) # creates a queue and tells it which connection talk through

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173","http://localhost:3000","http://127.0.0.1:8000"], #change to real website later
    allow_methods=["*"],
    allow_headers=["*"],
)

def has_mp3_signature(header: bytes) -> bool:
    # Return True if the header starts with "ID3" or an MP3 frame header (0xFF, then >= 0xE0)
    if header.startswith(b"ID3"):
        return True
    return len(header) >= 2 and header[0] == 0xFF and header[1] >= 0xE0

def save_job(job_id: str, job: dict) -> None:
   redis_client.set(f"job:{job_id}", json.dumps(job), ex = JOB_TTL_SECONDS)

def load_job(job_id: str) -> dict | None:
    raw = redis_client.get(f"job:{job_id}")
    if raw is None:
        return None
    else:
        return json.loads(raw)

def save_cached_result(file_hash: str, result: dict) -> None:
    redis_client.set(f"cache:{file_hash}", json.dumps(result), ex=CACHE_TTL_SECONDS)

def load_cached_result(file_hash: str) -> dict | None:
    raw = redis_client.get(f"cache:{file_hash}")
    if raw is None:
        return None
    else:
        return json.loads(raw)

def detect_notes(audio_path: str) -> list[dict]:
    # Fake analyzer until the team's real one is ready: pretends to take 10 seconds
    time.sleep(10) #<-------- REMOVE THIS WHEN THE LOGIC FILE IS READY
    return [
        {"note": "C4", "start": 0.0, "end": 0.5},
        {"note": "E4", "start": 0.5, "end": 1.0},
    ]

def run_job(job_id: str, path: str, file_hash: str) -> None:
    # Run in the background after/ upload has replied
    try:
        audio = load_audio_info(path)
        notes = detect_notes(path)
        save_job(job_id, {"status": "done", "notes": notes, "audio": audio})
        save_cached_result(file_hash, {"notes": notes, "audio": audio})
    except Exception:
        save_job(job_id, {"status": "failed", "notes": None, "audio": None})
    finally:
        os.remove(path) # Always delete the temp file, even if detection failed


@app.get("/")
def health_check():
    return {"status": "ok", "message": "NoteWave backend is running"}

@app.post("/upload")
def upload_audio(file: UploadFile):
    # Check 1: The filename must end with .mp3
    if not file.filename or not file.filename.lower().endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Only .mp3 files are allowed")

    # Check 2: The content type must be audio/mpeg or audio/mp3
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid content type: {file.content_type}")

    # Check 3: The file must not be larger than MAX_FILE_SIZE
    if file.size is not None and file.size > MAX_FILE_SIZE:
        raise HTTPException(status_code = 413, detail = f"File is too large (max {MAX_FILE_SIZE // (1024 * 1024)} MB)")

    # Check 4: The file must have a valid MP3 signature
    header = file.file.read(3)  # Read the first 3 bytes of the file
    if not has_mp3_signature(header):
        raise HTTPException(status_code=400, detail="Invalid MP3 file signature")

    # Hash the upload, then save it to a temp file that run_job deletes
    file.file.seek(0) #Go back to the start, since Check 4 already read the first 3 bytes
    file_hash = hashlib.sha256(file.file.read()).hexdigest()
    job_id = str(uuid.uuid4())

    cached = load_cached_result(file_hash)
    if cached is not None:
        save_job(job_id,{"status": "done", "notes": cached["notes"], "audio": cached["audio"]})
        return {
            "message": "Already analyzed, returning cache result",
            "filename": file.filename,
            "job_id": job_id,
            "status": "done",
            "file_hash": file_hash,
            "notes": cached["notes"],
            "audio": cached["audio"],
        }
    file.file.seek(0)

    with tempfile.NamedTemporaryFile(suffix=".mp3", delete = False) as tmp:
        shutil.copyfileobj(file.file, tmp) # Copy the upload into the temp file
        path = tmp.name # Remember where the file is for run_job

    # Create a job and run the slow analysis in the background
    save_job(job_id, {"status": "processing", "notes": None, "audio": None})
    job_queue.enqueue(run_job, job_id, path, file_hash)
    return {
        "message": "Upload accepted, processing started",
        "filename": file.filename,
        "job_id": job_id,
        "status": "processing",
        "file_hash": file_hash,
    }

@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    # Let the browser check on a job processing, done (with notess), or failed
    job = load_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    return{
        "job_id": job_id,
        "status": job["status"],
        "notes": job["notes"],
        "audio": job.get("audio"),
    }
