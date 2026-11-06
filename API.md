c# NoteWave API

Base URL (local): `http://localhost:8000`
Interactive docs: `http://localhost:8000/docs`

## How it works

1. `POST /upload` an MP3. You get a `job_id` back right away.
2. If `status` is `done` (song analyzed before), the notes are already in the response.
3. Otherwise, poll `GET /jobs/{job_id}` every 1–2 seconds until `status` is `done` or `failed`.

Requires Redis and a worker running: see "Running the backend" below.
CORS allows `http://localhost:5173` (the Vite dev server) and `http://localhost:3000`.

---

## GET /

Health check. Also checks that Redis is reachable, since uploads and jobs need it.

**Response 200**

```json
{ "status": "ok", "message": "NoteWave backend is running" }
```

**Response 503: Redis is down**

```json
{ "status": "error", "message": "Redis is unreachable" }
```

---

## POST /upload

Upload an MP3 for analysis.

**Request:** `multipart/form-data` with one field:

- `file`: the MP3 file (`.mp3`, content type `audio/mpeg`, max 25 MB)

**Response 200: new song (analysis started)**

```json
{
  "message": "Upload accepted, processing started",
  "filename": "song.mp3",
  "job_id": "140fac27-404f-41e7-bbac-ac7aefb43735",
  "status": "processing",
  "file_hash": "340a0127...2e4c"
}
```

**Response 200: song analyzed before (from cache, no polling needed)**

```json
{
  "message": "Already analyzed, returning cache result",
  "filename": "song.mp3",
  "job_id": "570c4739-02b3-447d-8fc1-0810c92e8cb5",
  "status": "done",
  "file_hash": "340a0127...2e4c",
  "notes": [
    { "note": "C4", "start": 0.0, "end": 0.5 },
    { "note": "E4", "start": 0.5, "end": 1.0 }
  ],
  "audio": {
    "sample_rate": 44100,
    "duration_seconds": 100.83,
    "sample_count": 4446720
  }
}
```

**Errors**

| Code | `detail`                        | Cause                           |
| ---- | ------------------------------- | ------------------------------- |
| 400  | `Only .mp3 files are allowed`   | filename doesn't end in `.mp3`  |
| 400  | `Invalid content type: ...`     | not `audio/mpeg` or `audio/mp3` |
| 400  | `Invalid MP3 file signature`    | file isn't really an MP3        |
| 413  | `File is too large (max 25 MB)` | file over 25 MB                 |
| 503  | `Job queue is unavailable, try again later` | Redis is down; nothing was saved, safe to retry |

---

## GET /jobs/{job_id}

Check an analysis job.

**Path parameter:** `job_id`, from `POST /upload`

**Response 200**

```json
{
  "job_id": "140fac27-404f-41e7-bbac-ac7aefb43735",
  "status": "done",
  "notes": [
    { "note": "C4", "start": 0.0, "end": 0.5 },
    { "note": "E4", "start": 0.5, "end": 1.0 }
  ],
  "audio": {
    "sample_rate": 44100,
    "duration_seconds": 100.83,
    "sample_count": 4446720
  }
}
```

| `status`     | Meaning                         | `notes` / `audio` |
| ------------ | ------------------------------- | ----------------- |
| `processing` | still analyzing                 | `null`            |
| `done`       | finished                        | filled in         |
| `failed`     | the audio couldn't be processed | `null`            |

**Errors**

| Code | `detail`        | Cause                                                 |
| ---- | --------------- | ----------------------------------------------------- |
| 404  | `Job not found` | unknown job ID, or expired (jobs expire after 1 hour) |

---

## Data formats

**Note:** `{ "note": "C4", "start": 1.2, "end": 1.65 }`. `start`/`end` are seconds from the start of the song.
Notes are placeholders until real note detection is added.

**Audio:** `sample_rate` (Hz), `duration_seconds`, `sample_count`.

Cached results expire after 24 hours.

---

## Example (JavaScript)

```js
const form = new FormData();
form.append("file", file);
let res = await fetch("http://localhost:8000/upload", {
  method: "POST",
  body: form,
});
let job = await res.json();

while (job.status === "processing") {
  await new Promise((r) => setTimeout(r, 1500));
  res = await fetch(`http://localhost:8000/jobs/${job.job_id}`);
  job = await res.json();
}
// job.status is now "done" (use job.notes) or "failed"
```

---

## Running the backend

From `backend/` with the venv active:

1. `sudo service redis-server start`
2. `uvicorn app.main:app --reload`
3. `rq worker` (in a second terminal)

Redis defaults to `redis://localhost:6379/0`. To use a different Redis, set `REDIS_URL`
(see `backend/.env.example`) in both terminals, and start the worker with
`rq worker --url "$REDIS_URL"` so it reads from the same queue.
