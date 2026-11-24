
import { useEffect, useRef, useState } from "react";
import PianoRoll from "./components/pianoroll";
import Waveform from "./components/waveform";
import "./App.css";

// Where the backend lives. Set VITE_API_URL when building for production (e.g. on Vercel);
// local development falls back to the API on port 8000.
const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");
const POLL_INTERVAL_MS = 1000;

// Wait `ms` milliseconds, but stop early (with an AbortError) if the upload is cancelled
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

// Read a JSON response, turning a non-2xx status into an Error with the backend's message
async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : `Request failed (${response.status}).`
    );
  }
  return data;
}

// Upload the file, then poll /jobs/{id} until the background worker finishes.
// A file analyzed before comes back "done" straight from the cache, with no polling.
async function analyzeFile(file, signal) {
  const formData = new FormData();
  formData.append("file", file);

  let job = await readJson(
    await fetch(`${API_URL}/upload`, { method: "POST", body: formData, signal })
  );

  while (job.status === "processing") {
    await wait(POLL_INTERVAL_MS, signal);
    job = await readJson(
      await fetch(`${API_URL}/jobs/${job.job_id}`, { signal })
    );
  }

  if (job.status === "failed") {
    throw new Error("Analysis failed on the server. Try a shorter song, or try again in a moment.");
  }

  return job.notes;
}

function formatTime(value) {
  if (!Number.isFinite(value) || value < 0) return "0:00";

  const seconds = Math.floor(value);

  return `${Math.floor(seconds / 60)}:${String(
    seconds % 60
  ).padStart(2, "0")}`;
}

function App() {
  const [audioUrl, setAudioUrl] = useState(null);
  const [fileName, setFileName] = useState("");
  const [notes, setNotes] = useState([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const audioRef = useRef(null);
  const requestRef = useRef(null);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => requestRef.current?.abort();
  }, []);

  async function loadFile(file) {
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".mp3")) {
      setError("Please choose an MP3 file.");
      return;
    }

    requestRef.current?.abort();

    const controller = new AbortController();
    requestRef.current = controller;

    audioRef.current?.pause();

    setAudioUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setNotes([]);
    setCurrentTime(0);
    setDuration(0);
    setLoading(true);
    setAnalyzed(false);
    setError("");

    try {
      const detected = await analyzeFile(file, controller.signal);

      if (!Array.isArray(detected)) {
        throw new Error(
          "The backend returned an unexpected response."
        );
      }

      if (controller.signal.aborted) return;

      setNotes(
        [...detected].sort((a, b) => a.start - b.start)
      );
      setAnalyzed(true);
    } catch (err) {
      if (controller.signal.aborted) return;

      setError(
        err instanceof TypeError
          ? "Cannot reach the NoteWave server. If it was asleep, it may take a minute to wake up. Try again shortly."
          : err.message || "Could not analyze this recording."
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    loadFile(event.dataTransfer.files[0]);
  }

  function seekAndPlay(seconds) {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, seconds);
    setCurrentTime(audio.currentTime);

    audio.play().catch((err) => {
      console.error("Playback failed:", err);
    });
  }

  const activeNotes = [
    ...new Set(
      notes
        .filter(
          (note) =>
            currentTime >= note.start &&
            currentTime < note.end
        )
        .map((note) => note.note)
    ),
  ];

  return (
    <div className="studio-app">
      {/* Navigation */}
      <header className="studio-topbar">
        <div className="studio-brand">
          <span
            className="studio-brand-icon"
            aria-hidden="true"
          >
            ◢
          </span>

          <span>
            Note
            <span className="studio-brand-accent">
              Wave
            </span>
          </span>
        </div>

        <span className="studio-topbar-tag">
          AUDIO ANALYSIS STUDIO
        </span>
      </header>

      <main className="studio-main">
        {/* Upload screen */}
        {!audioUrl ? (
          <section className="studio-welcome">
            <span className="studio-eyebrow">
              YOUR MUSIC, VISUALIZED
            </span>

            <h1>
              Discover the notes behind the sound.
            </h1>

            <p>
              Upload a recording to explore its waveform
              and detected notes in an interactive piano
              roll.
            </p>

            <div
              className={`studio-dropzone${
                dragging ? " is-dragging" : ""
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <span
                className="studio-upload-icon"
                aria-hidden="true"
              >
                ♫
              </span>

              <label className="studio-button">
                Upload an MP3

                <input
                  type="file"
                  accept=".mp3,audio/mpeg"
                  hidden
                  onChange={(event) => {
                    loadFile(event.target.files[0]);
                    event.target.value = "";
                  }}
                />
              </label>

              <p>
                or drag and drop your audio here
              </p>
            </div>
          </section>
        ) : (
          /* Compact track header */
          <section className="studio-trackbar">
            <div className="studio-track-info">
              <span
                className="studio-track-icon"
                aria-hidden="true"
              >
                ♫
              </span>

              <div>
                <p className="studio-eyebrow">
                  CURRENT TRACK
                </p>
                <h1 title={fileName}>
                  {fileName}
                </h1>
              </div>
            </div>

            <label className="studio-button studio-button-secondary">
              Change track

              <input
                type="file"
                accept=".mp3,audio/mpeg"
                hidden
                onChange={(event) => {
                  loadFile(event.target.files[0]);
                  event.target.value = "";
                }}
              />
            </label>
          </section>
        )}

        {error && (
          <p className="studio-error" role="alert">
            {error}
          </p>
        )}

        {audioUrl && (
          <>
            {/* Audio workspace and live notes */}
            <div className="studio-workspace-grid">
              <section className="studio-panel studio-player-panel">
                <div className="studio-panel-heading">
                  <div>
                    <span className="studio-eyebrow">
                      PLAYBACK
                    </span>
                    <h2>Audio workspace</h2>
                  </div>

                  <span className="studio-time">
                    {formatTime(currentTime)} /{" "}
                    {formatTime(duration)}
                  </span>
                </div>

                <audio
                  key={audioUrl}
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  onLoadedMetadata={(event) =>
                    setDuration(
                      event.currentTarget.duration
                    )
                  }
                  onTimeUpdate={(event) =>
                    setCurrentTime(
                      event.currentTarget.currentTime
                    )
                  }
                  onSeeked={(event) =>
                    setCurrentTime(
                      event.currentTarget.currentTime
                    )
                  }
                  onEnded={(event) =>
                    setCurrentTime(
                      event.currentTarget.duration
                    )
                  }
                  onError={() =>
                    setError(
                      "The browser could not play this file."
                    )
                  }
                />

                <Waveform
                  audioUrl={audioUrl}
                  currentTime={currentTime}
                  duration={duration}
                  onSeek={seekAndPlay}
                />
              </section>

              {/* Active-note side panel */}
              <aside className="studio-panel studio-insights-panel">
                <div className="studio-panel-heading">
                  <div>
                    <span className="studio-eyebrow">
                      LIVE ANALYSIS
                    </span>
                    <h2>Active notes</h2>
                  </div>

                  <span
                    className={`studio-indicator${
                      loading ? " is-loading" : ""
                    }`}
                  >
                    {loading
                      ? "Processing"
                      : analyzed
                      ? "Ready"
                      : error
                      ? "Error"
                      : "Waiting"}
                  </span>
                </div>

                <div className="studio-active-notes">
                  {activeNotes.length
                    ? activeNotes.join(" · ")
                    : "—"}
                </div>

                <p className="studio-helper">
                  {loading
                    ? "Basic Pitch is analyzing your recording. You can play the audio now."
                    : analyzed
                    ? "These pitches update as the track plays."
                    : "Note detection is not available yet."}
                </p>

                <div className="studio-stat-grid">
                  <div>
                    <span>Note events</span>
                    <strong>{notes.length}</strong>
                  </div>

                  <div>
                    <span>Active now</span>
                    <strong>{activeNotes.length}</strong>
                  </div>

                  <div>
                    <span>Duration</span>
                    <strong>
                      {formatTime(duration)}
                    </strong>
                  </div>
                </div>
              </aside>
            </div>

            {/* Piano roll */}
            {loading ? (
              <section
                className="studio-panel studio-analysis-loading"
                role="status"
              >
                <div className="studio-panel-heading">
                  <div>
                    <span className="studio-eyebrow">
                      NOTE VISUALIZATION
                    </span>
                    <h2>Piano roll</h2>
                  </div>

                  <span className="studio-indicator is-loading">
                    Analyzing
                  </span>
                </div>

                <div className="studio-loader" />
                <p>
                  Detecting pitches and timestamps…
                </p>
              </section>
            ) : notes.length > 0 ? (
              <PianoRoll
                notes={notes}
                currentTime={currentTime}
                duration={duration}
                onSeek={seekAndPlay}
              />
            ) : analyzed ? (
              <section className="studio-panel studio-empty-result">
                No note events were detected in this recording.
              </section>
            ) : null}

            {/* Collapsible note details */}
            {notes.length > 0 && (
              <details className="studio-note-details">
                <summary>
                  View all {notes.length} note events
                </summary>

                <div className="studio-table-scroll">
                  <table>
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
                          key={`${note.pitch}-${note.start}-${index}`}
                          className={
                            currentTime >= note.start &&
                            currentTime < note.end
                              ? "is-active"
                              : ""
                          }
                        >
                          <td>{note.note}</td>
                          <td>
                            {note.start.toFixed(2)}
                          </td>
                          <td>
                            {note.end.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        )}
      </main>

      <footer className="studio-footer">
        NoteWave · Audio-to-note visualization
      </footer>
    </div>
  );
}

export default App;
