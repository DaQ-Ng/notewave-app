from fastapi import FastAPI, UploadFile

app = FastAPI(title="NoteWave API")

@app.get("/")
def health_check():
    return {"status": "ok", "message" : "NoteWave backend is running"}

@app.post("/upload")
def upload_audio(file: UploadFile):
    #Add Logic to process the uploaded audio file here
    return{
        "filename": file.filename,
        "content_type": file.content_type,
    }