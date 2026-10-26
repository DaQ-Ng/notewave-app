from fastapi import FastAPI, UploadFile, HTTPException
from .transcription import router as transcription_router

app = FastAPI(title="NoteWave API")

# Include your transcription router from transcription.py
app.include_router(transcription_router)

ALLOWED_CONTENT_TYPES = {"audio/mpeg", "audio/mp3"}

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

    # Check 3: The file must have a valid MP3 signature
    header = file.file.read(3)  # Read the first 3 bytes of the file
    if not has_mp3_signature(header):
        raise HTTPException(status_code=400, detail="Invalid MP3 file signature")
    
    return {
        "message": "File uploaded successfully",
        "filename": file.filename,
        "content_type": file.content_type,
    }