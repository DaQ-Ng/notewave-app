# Import librosa, the library we use to load and analyze audio.
import librosa


# Accept an audio file's path and return its information as a dictionary.
# ": str" and "-> dict" are type hints for the input and output.
def load_audio_info(file_path: str) -> dict:

    # Decode the audio file into samples and get its sample rate.
    # audio: an array of numbers representing the sound wave.
    # sample_rate: the number of audio samples per second.
    audio, sample_rate = librosa.load(
        file_path,   # Location of the audio file.
        sr=None,     # Keep the file's original sample rate.
        mono=True,   # Combine channels into a single audio channel.
    )

    # Reject an audio file if decoding produces no samples.
    if len(audio) == 0:
        raise ValueError("The audio file contains no samples")

    # Duration = number of samples / samples per second.
    duration = len(audio) / sample_rate

    # Return basic audio information to the code that called this function.
    return {
        "sample_rate": int(sample_rate),         # Samples per second, in Hz.
        "duration_seconds": round(duration, 2),  # Duration rounded to 2 decimals.
        "sample_count": int(len(audio)),         # Total samples in the mono audio.
    }