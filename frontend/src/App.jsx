import { useState, useRef, useEffect } from "react";
import "./App.css";

const API_URL = "http://127.0.0.1:8000";

function App() {
  const [audioUrl, setAudioUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [notes, setNotes] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [error, setError] = useState("");

  const audioRef = useRef(null);
  const requestRef = useRef(null);

  // Release the previous audio URL when another file is selected.
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  // Cancel an outstanding request when this component closes.
  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  async function loadFile(file) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".mp3")) {
      setError("Please choose an MP3 file.");
      return;
    }

    // Stop the previous request so its result cannot replace the new one.
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;

    audioRef.current?.pause();

    setAudioUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setNotes([]);
    setCurrentTime(0);
    setError("");
    setAnalyzed(false);
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Call the endpoint that uses the real Basic Pitch model.
      const response = await fetch(`${API_URL}/api/transcribe`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Analysis failed (${response.status}).`
        );
      }

      if (!Array.isArray(data.notes)) {
        throw new Error("The backend returned an unexpected response.");
      }

      // Ignore results belonging to a previously selected file.
      if (controller.signal.aborted) return;

      // Sort the detected notes by their starting time.
      setNotes([...data.notes].sort((a, b) => a.start - b.start));
      setAnalyzed(true);
    } catch (err) {
      if (controller.signal.aborted) return;

      setError(
        err instanceof TypeError
          ? "Cannot reach the backend. Check that it is running on port 8000."
          : err.message || "Could not analyze this file."
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    loadFile(event.dataTransfer.files[0]);
  }

  // Several notes can be active at once, such as guitar chord notes.
  function isActive(note) {
    return currentTime >= note.start && currentTime < note.end;
  }

  const activeNames = [
    ...new Set(notes.filter(isActive).map((note) => note.note)),
  ];

  return (
    <div
      className="app"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <h1>NoteWave</h1>

      <div className="upload-row">
        <label className="upload-button">
          Upload a track
          <input
            type="file"
            accept=".mp3,audio/mpeg"
            onChange={(event) => {
              loadFile(event.target.files[0]);

              // Allow selecting the same file again to retry.
              event.target.value = "";
            }}
            hidden
          />
        </label>
        <span>or drag an MP3 file here</span>
      </div>

      <div className="file-name">
        {fileName || "No track loaded"}
      </div>

      {loading && (
        <p role="status">Analyzing audio… Please wait.</p>
      )}

      {error && <p role="alert">{error}</p>}

      {analyzed && (
        <p>
          {notes.length > 0
            ? `${notes.length} note events detected. Press play below.`
            : "No notes were detected in this recording."}
        </p>
      )}

      {/* Native controls provide play, pause, volume, and seeking. */}
      {audioUrl && (
        <audio
          key={audioUrl}
          ref={audioRef}
          src={audioUrl}
          controls
          onTimeUpdate={(event) =>
            setCurrentTime(event.currentTarget.currentTime)
          }
          onSeeked={(event) =>
            setCurrentTime(event.currentTarget.currentTime)
          }
          onEnded={() => setCurrentTime(Infinity)}
          onError={() => setError("The browser could not play this file.")}
        />
      )}

      <div className="note-display">
        {activeNames.length > 0 ? activeNames.join(" · ") : "—"}
      </div>

      <div className="note-row">
        {notes.map((note, index) => (
          <span
            key={index}
            className={
              isActive(note) ? "note-chip active" : "note-chip"
            }
            title={`${note.start.toFixed(2)}s – ${note.end.toFixed(2)}s`}
          >
            {note.note}
          </span>
        ))}
      </div>

      {/* Show the actual timings returned by the backend. */}
      {notes.length > 0 && (
        <table style={{ margin: "20px auto", borderSpacing: "16px 8px" }}>
          <thead>
            <tr>
              <th>Note</th>
              <th>Start (s)</th>
              <th>End (s)</th>
            </tr>
          </thead>
          <tbody>
            {notes.map((note, index) => (
              <tr
                key={index}
                style={{
                  backgroundColor: isActive(note)
                    ? "rgba(80, 180, 120, 0.25)"
                    : "transparent",
                }}
              >
                <td>{note.note}</td>
                <td>{note.start.toFixed(2)}</td>
                <td>{note.end.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default App;