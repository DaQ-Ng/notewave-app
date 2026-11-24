# NoteWave API

Backend for [NoteWave](https://github.com/DaQ-Ng/notewave-app): upload an MP3, get the notes back.

The Docker image runs Redis, an RQ worker, and the FastAPI app together (see `Dockerfile` and
`start.sh`), so it deploys as a single web service, for example on Render.

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `ALLOWED_ORIGINS` | local dev servers | Frontend URL(s) allowed to call the API (CORS) |
| `MAX_DURATION_SECONDS` | `0` (no limit) | Reject longer songs at upload. On a 512 MB host, use `240` |
| `JOB_TIMEOUT_SECONDS` | `600` | How long one analysis may run before it's stopped |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis inside the container; only change for an external Redis |

Measured on a 512 MB container: a 4-minute song peaks around 470 MB. With about 0.1 CPU,
a 3-minute song takes about 4 minutes to analyze.

Endpoints are documented in [API.md](https://github.com/DaQ-Ng/notewave-app/blob/main/API.md).
