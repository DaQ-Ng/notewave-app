from fastapi import APIRouter, UploadFile, File, HTTPException
from basic_pitch.inference import predict
from collections import defaultdict
import pretty_midi
import tempfile
import os
import re

router = APIRouter(prefix="/api", tags=["Transcription"])

# Tune this threshold: 0.40 removes notes >= 40% away from the note-class mean
DEVIATION_THRESHOLD = 0.40

def get_pitch_class(note_name: str) -> str:
    """Extracts the note letter/accidental without the octave (e.g., 'E4' -> 'E', 'C#3' -> 'C#')."""
    return re.sub(r'-?\d+$', '', note_name)

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

        # 3. Extract raw notes and group velocities by pitch class (A, A#, B, C, etc.)
        raw_notes = []
        velocities_by_class = defaultdict(list)

        for instrument in midi_data.instruments:
            for note in instrument.notes:
                note_name = pretty_midi.note_number_to_name(note.pitch)  # e.g., "C4", "A#3"
                pitch_class = get_pitch_class(note_name)                # e.g., "C", "A#"
                velocity = int(note.velocity)

                raw_notes.append({
                    "note": note_name,
                    "pitch": int(note.pitch),
                    "start": float(note.start),
                    "end": float(note.end),
                    "velocity": velocity,
                    "_pitch_class": pitch_class
                })
                velocities_by_class[pitch_class].append(velocity)

        # 4. Calculate the mean velocity for each pitch class
        mean_velocities = {
            pitch_class: sum(vels) / len(vels)
            for pitch_class, vels in velocities_by_class.items()
        }

        # 5. Filter out notes that are >= 40% away from their pitch class's mean velocity
        filtered_notes = []
        for n in raw_notes:
            mean_vel = mean_velocities[n["_pitch_class"]]
            if mean_vel > 0:
                percent_diff = abs(n["velocity"] - mean_vel) / mean_vel
                if percent_diff >= DEVIATION_THRESHOLD:
                    continue  # Skip overtone / outlier note

            # Remove temporary helper key before returning
            del n["_pitch_class"]
            filtered_notes.append(n)

        # 6. Return pure JSON data
        return {
            "filename": file.filename,
            "total_notes": len(filtered_notes),
            "notes": filtered_notes
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