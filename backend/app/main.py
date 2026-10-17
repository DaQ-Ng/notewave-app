from fastapi import FastAPI, UploadFile, HTTPException
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
    file.file.seek(0) #Go back to the start, since Check 4 already read the first 3 bytes
    with tempfile.NamedTemporaryFile(suffix=".mp3") as tmp:
        shutil.copyfileobj(file.file, tmp) # Copy the upload into the temp file
        tmp.flush() # Make sure all bytes are written to disk
        saved_size = os.path.getsize(tmp.name) # tmp.name is the temp file's path

    return {
        "message": "File uploaded successfully",
        "filename": file.filename,
        "content_type": file.content_type,
        "saved_bytes": saved_size,
    }