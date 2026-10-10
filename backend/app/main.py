from fastapi import FastAPI

app = FastAPI(title="NoteWave API")

@app.get("/")
def health_check():
    return {"status": "ok", "message" : "NoteWave backend is running"}