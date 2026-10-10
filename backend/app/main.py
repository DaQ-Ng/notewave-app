from fastapi import FastAPI, UploadFile, HTTPException

app = FastAPI(title="NoteWave API")

ALLOWED_EXTENSIONS = {"audio/mpeg", "audio/mp3"}

@app.get("/")
def health_check():
    return {"status": "ok", "message" : "NoteWave backend is running"}

@app.post("/upload")
def upload_audio(file: UploadFile):
    #Check 1: The filename must end with .mp3
    if not file.filename or not file.filename.endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Only .mp3 files are allowed")

    #Check 2: The content type must be audio/mpeg or audio/mp3
    if file.content_type not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Invalid content type: {file.content_type}")
    return{
        "message": "File uploaded successfully",
        "filename": file.filename,
        "content_type": file.content_type,
    }