import { useState, useRef, useEffect } from "react";
import "./App.css";
const API_URL = "http://127.0.0.1:8000";

// Our test constants: edit these to try different notes
const MOCK_NOTES = ["C4", "E4", "G4", "C5", "G4", "E4", "C4"];
const NOTE_MS = 500; // how long each note shows

function App() {
  const [audioUrl, setAudioUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [noteIndex, setNoteIndex] = useState(null); // which constant is active
  const [testing, setTesting] = useState(false);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);
  const timerRef = useRef(null);

  async function uploadToBackend(file) {
    const formData = new FormData();
    formData.append("file",file);
    const res = await fetch("http://127.0.0.1:8000/upload", {
      method:"POST",
      body:formData,
    });
    const data = await res.json();
    console.log(data);
  }

  function loadFile(file) {
    if (file && file.name.toLowerCase().endsWith(".mp3")) {
      setAudioUrl(URL.createObjectURL(file));
      setFileName(file.name);
      setIsPlaying(false);
      uploadToBackend(file);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    loadFile(e.dataTransfer.files[0]);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  }

  function stopTest() {
    clearInterval(timerRef.current);
    setTesting(false);
    setNoteIndex(null);
  }

  function testNotes() {
    if (testing) {
      stopTest();
      return;
    }
    setTesting(true);
    let i = 0;
    setNoteIndex(0);
    timerRef.current = setInterval(() => {
      i++;
      if (i >= MOCK_NOTES.length) {
        stopTest();
      } else {
        setNoteIndex(i);
      }
    }, NOTE_MS);
  }

  // Stop the timer if the component ever goes away
  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <h1>Notewave</h1>

      <div className="upload-row">
        <label className="upload-button">
          Upload a track
          <input
            type="file"
            accept=".mp3,audio/mpeg"
            onChange={(e) => loadFile(e.target.files[0])}
            hidden
          />
        </label>
        <span>or drag an mp3 file here</span>
      </div>

      <div className="file-name">{fileName || "No track loaded"}</div>

      <button onClick={togglePlay} disabled={!audioUrl}>
        {isPlaying ? "Pause" : "Play"}
      </button>

      <div className="note-display">
        {noteIndex === null ? "—" : MOCK_NOTES[noteIndex]}
      </div>

      <div className="note-row">
        {MOCK_NOTES.map((n, i) => (
          <span
            key={i}
            className={i === noteIndex ? "note-chip active" : "note-chip"}
          >
            {n}
          </span>
        ))}
      </div>

      <button onClick={testNotes}>
        {testing ? "Stop test" : "Test music notes"}
      </button>

      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => setIsPlaying(false)}
        />
      )}
    </div>
  );
}

export default App;