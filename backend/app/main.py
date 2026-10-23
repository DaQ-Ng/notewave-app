from fastapi import FastAPI, UploadFile, HTTPException
# Import our function for loading audio information.
from app.audio_processing import load_audio_info
import os
import shutil
import tempfile

app = FastAPI(title="NoteWave API")
ALLOWED_CONTENT_TYPES = {"audio/mpeg", "audio/mp3"}
MAX_FILE_SIZE = 25 * 1024 * 1024 # 25 MB in bytes

def has_mp3_signature(header: bytes) -> bool:
    # Return True if the header starts with "ID3" or an MP3 frame header (0xFF, then >= 0xE0)
    if header.startswith(b"ID3"):
        return True
    return len(header) >= 2 and header[0] == 0xFF and header[1] >= 0xE0

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
    
    # Save the upload to a temporary file (deleted automatically at the end of the "with" block)
    # Return to the beginning after reading the MP3 signature.
    file.file.seek(0)

    # Create a temporary folder that is automatically removed afterward.
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = os.path.join(temp_dir, "upload.mp3")

        # Save the uploaded bytes, then close the file before loading it.
        # Closing it first allows librosa to reopen it on Windows.
        with open(temp_path, "wb") as tmp:
            shutil.copyfileobj(file.file, tmp)

        # Find the saved file's size in bytes.
        saved_size = os.path.getsize(temp_path)

        # Decode the audio while the temporary file still exists.
        try:
            audio_info = load_audio_info(temp_path)
        except (ValueError, RuntimeError, EOFError) as error:
            # Reject audio that cannot be decoded.
            raise HTTPException(
                status_code=400,
                detail="Could not decode the uploaded audio",
            ) from error

    # The temporary folder and file have now been deleted.
    return {
        "message": "Audio loaded successfully",
        "filename": file.filename,
        "content_type": file.content_type,
        "saved_bytes": saved_size,
        "sample_rate": audio_info["sample_rate"],
        "duration_seconds": audio_info["duration_seconds"],
        "sample_count": audio_info["sample_count"],
    }
