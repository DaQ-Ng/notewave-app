# Recipe for the NoteWave API container image.
# Build (from backend/):  docker build -t notewave-api .
# Run:                    docker run --rm -p 7860:7860 notewave-api

# Start from a small Linux image with Python 3.10 installed.
# Python 3.10 (not 3.14) because basic-pitch and TensorFlow don't support newer versions yet.
FROM python:3.10-slim

# System libraries for decoding audio: libsndfile for librosa/soundfile, ffmpeg for MP3 fallback.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libsndfile1 ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces runs containers as user 1000, so create that user and work in its home folder.
RUN useradd -m -u 1000 user
USER user
ENV PATH="/home/user/.local/bin:$PATH" \
    PYTHONUNBUFFERED=1
WORKDIR /home/user/app

# Install Python packages first, so Docker can reuse this slow step when only our code changes.
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt "numpy<2"
# ("numpy<2" because basic-pitch's tflite-runtime model loader only works with numpy 1.x.)

# Copy the API code.
COPY --chown=user app ./app

# Hosts tell the app which port to listen on via $PORT; Hugging Face Spaces uses 7860.
ENV PORT=7860
EXPOSE 7860
# "exec" makes uvicorn the main process, so it shuts down cleanly when the host stops the container.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
