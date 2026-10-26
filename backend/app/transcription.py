from fastapi import APIRouter, UploadFile, File, HTTPException
from basic_pitch.inference import predict
import pretty_midi
import tempfile
import os

router = APIRouter(prefix="/api", tags=["Transcription"])

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    # Validate file extension
    if not file.filename or not file.filename.lower().endswith((".mp3", ".wav", ".m4a")):
        raise HTTPException(status_code=400, detail="Only audio files (.mp3, .wav, .m4a) are allowed")
    
    tmp_input_path = None
    
    try:
        # 1. Save the uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as tmp_input:
            content = await file.read()
            tmp_input.write(content)
            tmp_input_path = tmp_input.name

        # 2. Run basic-pitch prediction
        _, midi_data, _ = predict(tmp_input_path)

        # 3. Extract readable note names, timings, and velocities
        notes_list = []
        for instrument in midi_data.instruments:
            for note in instrument.notes:
                note_name = pretty_midi.note_number_to_name(note.pitch)  # e.g., "C4", "A#3"
                notes_list.append({
                    "note": note_name,                # Human-readable note name
                    "pitch": int(note.pitch),         # Keep raw number just in case
                    "start": float(note.start),       # Start time in seconds
                    "end": float(note.end),           # End time in seconds
                    "velocity": int(note.velocity)    # Volume/intensity
                })

        # 4. Return pure JSON data (no MIDI file saved or returned)
        return {
            "filename": file.filename,
            "total_notes": len(notes_list),
            "notes": notes_list
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    
    finally:
        # Clean up the temporary input file
        if tmp_input_path and os.path.exists(tmp_input_path):
            try:
                os.remove(tmp_input_path)
            except Exception:
                pass