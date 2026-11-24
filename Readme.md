# NoteWave

Upload a recording and see the notes in it. NoteWave turns an MP3 into a list of detected notes
(pitch, start, end) and shows them on an interactive waveform and piano roll that follow playback.

Built as a team project for ACM at UTA. This fork is maintained by
[Dat Nguyen (@DaQ-Ng)](https://github.com/DaQ-Ng), who built the backend.

## How it works

```
Browser ──POST /upload──▶ FastAPI ──enqueue──▶ Redis queue ──▶ RQ worker ──▶ basic-pitch
   │                         │                                     │
   │                         └── cache hit? return notes now       └── save result + cache by file hash
   └──GET /jobs/{id} (poll every 1 s)◀──────────── job status in Redis ◀─┘
```

1. **Upload.** `POST /upload` checks the file (`.mp3` name, content type, MP3 signature, 25 MB limit),
   streams it to disk in 1 MB chunks, and hashes it with SHA-256 on the way.
2. **Cache.** If that hash was analyzed before, the notes come back in the same response.
3. **Background job.** Otherwise the API replies right away with a `job_id` and queues the analysis.
   An RQ worker runs [basic-pitch](https://github.com/spotify/basic-pitch) on the file, filters
   overtones, stores the result in Redis, and caches it for 24 hours.
4. **Polling.** The frontend polls `GET /jobs/{job_id}` until the status is `done` or `failed`.

The slow part (note detection) never blocks a web request, so long songs don't time out, and
uploading the same song twice is instant.

## Tech stack

| Part | Tools |
|---|---|
| Frontend | React 19, Vite |
| API | FastAPI, Uvicorn |
| Jobs and cache | Redis, RQ |
| Note detection | basic-pitch, pretty_midi, librosa |
| Tests | pytest, fakeredis |

## Running it locally

You need four things running: **Redis**, the **API**, the **worker**, and the **frontend**.
Linux, macOS, or WSL on Windows; Python 3.10–3.12; Node 20+.

### 1. Redis

With Docker:

```bash
docker run -d --name notewave-redis -p 6379:6379 redis:7-alpine
```

Or on Ubuntu/WSL: `sudo apt install redis-server && sudo service redis-server start`

### 2. Backend setup (once)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install fastapi "uvicorn[standard]" python-multipart pretty_midi redis librosa rq
```

Then install basic-pitch. On **Python 3.10 or 3.11**:

```bash
pip install basic-pitch
```

On **Python 3.12**, basic-pitch's TensorFlow pin has no wheels, so use its ONNX backend instead:

```bash
pip install basic-pitch==0.4.0 --no-deps
pip install "mir-eval>=0.6" "resampy<0.4.3,>=0.2.2" onnxruntime "setuptools<81"
```

### 3. API (terminal 1)

```bash
cd backend && source .venv/bin/activate
uvicorn app.main:app --reload
```

Runs on `http://localhost:8000`. Interactive docs are at `http://localhost:8000/docs`.

### 4. Worker (terminal 2)

```bash
cd backend && source .venv/bin/activate
rq worker --url redis://localhost:6379/0
```

The first job takes a few extra seconds while the model loads.

### 5. Frontend (terminal 3)

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173` and upload an MP3.

### Configuration

Both settings are optional; see [`backend/.env.example`](backend/.env.example).

| Variable | Default | Used for |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379/0` | Job store, cache, and queue (set it for the API **and** the worker) |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000,...` | Sites allowed to call the API (CORS) |

## Tests

```bash
cd backend && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest
```

The tests use an in-memory Redis (fakeredis) and don't need basic-pitch or a running worker.

## Docker (API only)

```bash
cd backend
docker build -t notewave-api .
docker run --rm -p 7860:7860 -e REDIS_URL=redis://host.docker.internal:6379/0 notewave-api
```

The image runs the API. Run the worker separately against the same `REDIS_URL`.

## API

| Method | Path | What it does |
|---|---|---|
| `GET` | `/` | Health check (also checks Redis) |
| `POST` | `/upload` | Upload an MP3; returns a `job_id`, or the notes if cached |
| `GET` | `/jobs/{job_id}` | Job status: `processing`, `done` (with notes), or `failed` |
| `POST` | `/api/transcribe` | Analyze a file in one request (no queue or cache) |

Full request and response details are in [API.md](API.md).

## Project structure

```
backend/
  app/main.py            API: upload, jobs, cache, health check, background job
  app/transcription.py   Note detection (basic-pitch) and /api/transcribe
  app/audio_processing.py  Audio duration and sample rate
  tests/                 pytest suite
  Dockerfile
frontend/
  src/App.jsx            Upload, polling, and page layout
  src/components/        Waveform and piano roll
```

## Credits

Team project by ACM at UTA members. The original repository is
[acmuta/notewave](https://github.com/acmuta/notewave).

- **Dat Nguyen**: backend (FastAPI app, upload validation, Redis job queue and cache, RQ worker,
  tests, Docker, API docs) and wiring the frontend to the async pipeline in this fork
- **Rishav**: frontend design (waveform, piano roll, layout)
- **Sudin**: note detection with basic-pitch
- **kreyescse**: initial frontend and frontend-to-backend connection

See [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).
