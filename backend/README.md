---
title: NoteWave API
emoji: 🎵
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# NoteWave API

Backend for [NoteWave](https://github.com/DaQ-Ng/notewave-app): upload an MP3, get the notes back.

The block at the top of this file is configuration for Hugging Face Spaces, which deploys this
folder as a Docker Space. The container runs Redis, an RQ worker, and the FastAPI app together
(see `Dockerfile` and `start.sh`).

Endpoints are documented in [API.md](https://github.com/DaQ-Ng/notewave-app/blob/main/API.md).
