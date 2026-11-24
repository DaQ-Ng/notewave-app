# Recipe for the NoteWave backend container: Redis + RQ worker + API in one image.
# Build (from backend/):  docker build -t notewave-api .
# Run:                    docker run --rm -p 7860:7860 notewave-api
# Hugging Face Spaces builds and runs this file directly (see README.md in this folder).

FROM python:3.12-slim

# System packages: libsndfile for decoding audio, Redis for the job queue and cache.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 redis-server \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces runs containers as user 1000, so create that user and work in its home folder.
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    REDIS_URL="redis://localhost:6379/0" \
    PORT=7860
WORKDIR /home/user/app

# Install Python packages first, so Docker can reuse this slow step when only our code changes.
# basic-pitch pins an old TensorFlow that has no Python 3.12 build, so install it without its
# dependencies and use its ONNX model instead (onnxruntime is much smaller than TensorFlow).
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && grep -v '^basic-pitch' requirements.txt > /tmp/requirements-no-bp.txt \
    && pip install --no-cache-dir -r /tmp/requirements-no-bp.txt \
    && pip install --no-cache-dir basic-pitch==0.4.0 --no-deps \
    && pip install --no-cache-dir "mir-eval>=0.6" "resampy<0.4.3,>=0.2.2" onnxruntime "setuptools<81"

# Copy the API code and the start script.
COPY --chown=user app ./app
COPY --chown=user start.sh .

EXPOSE 7860
CMD ["sh", "start.sh"]
