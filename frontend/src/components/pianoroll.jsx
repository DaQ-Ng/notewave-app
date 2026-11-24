
import "./PianoRoll.css";

const ROW_HEIGHT = 30;
const AXIS_HEIGHT = 34;

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B"
];

function pitchName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function formatTime(seconds) {
  const rounded = Math.floor(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}

function tickSpacing(duration) {
  if (duration <= 20) return 2;
  if (duration <= 60) return 5;
  if (duration <= 180) return 15;
  return 30;
}

export default function PianoRoll({
  notes,
  currentTime,
  duration,
  onSeek
}) {
  const validNotes = notes.filter(
    (note) =>
      Number.isInteger(note.pitch) &&
      Number.isFinite(note.start) &&
      Number.isFinite(note.end) &&
      note.end > note.start
  );

  if (validNotes.length === 0) return null;

  const minPitch = Math.min(
    ...validNotes.map((note) => note.pitch)
  );

  const maxPitch = Math.max(
    ...validNotes.map((note) => note.pitch)
  );

  const pitches = Array.from(
    { length: maxPitch - minPitch + 1 },
    (_, index) => maxPitch - index
  );

  const noteEnd = validNotes.reduce(
    (max, note) => Math.max(max, note.end),
    0
  );

  const totalDuration = Math.max(
    Number.isFinite(duration) ? duration : 0,
    noteEnd,
    1
  );

  const timelineWidth = Math.max(
    740,
    Math.min(12000, Math.ceil(totalDuration * 70))
  );

  const noteAreaHeight = pitches.length * ROW_HEIGHT;

  const displayedTime = Number.isFinite(currentTime)
    ? Math.max(0, Math.min(currentTime, totalDuration))
    : totalDuration;

  const spacing = tickSpacing(totalDuration);

  const ticks = Array.from(
    { length: Math.floor(totalDuration / spacing) + 1 },
    (_, index) => index * spacing
  );

  function seekFromClick(event) {
    const { left, width } =
      event.currentTarget.getBoundingClientRect();

    const ratio = Math.max(
      0,
      Math.min(1, (event.clientX - left) / width)
    );

    onSeek(ratio * totalDuration);
  }

  return (
    <section
      className="piano-roll"
      aria-label="Detected note piano roll"
    >
      <div className="piano-roll-heading">
        <div>
          <h2>Piano Roll</h2>
          <p>
            Pitch vertically · Time horizontally ·
            Click a note to seek
          </p>
        </div>

        <span>{validNotes.length} note events</span>
      </div>

      <div className="piano-roll-scroll">
        <div className="piano-roll-layout">

          {/* Pitch labels on the left */}
          <div
            className="piano-roll-labels"
            aria-hidden="true"
          >
            <div className="piano-roll-axis-label">
              PITCH
            </div>

            {pitches.map((pitch) => (
              <div
                key={pitch}
                className={`piano-roll-key${
                  pitch % 12 === 0 ? " piano-roll-c" : ""
                }`}
                style={{ height: ROW_HEIGHT }}
              >
                {pitchName(pitch)}
              </div>
            ))}
          </div>

          {/* Timeline and note bars */}
          <div
            className="piano-roll-track"
            style={{
              width: timelineWidth,
              height: noteAreaHeight + AXIS_HEIGHT
            }}
            onClick={seekFromClick}
            title="Click to seek"
          >
            {/* Timeline labels */}
            <div
              className="piano-roll-axis"
              style={{ height: AXIS_HEIGHT }}
            >
              {ticks.map((second) => (
                <span
                  key={second}
                  style={{
                    left:
                      (second / totalDuration) *
                      timelineWidth
                  }}
                >
                  {formatTime(second)}
                </span>
              ))}
            </div>

            <div
              className="piano-roll-lanes"
              style={{ height: noteAreaHeight }}
            >
              {/* Horizontal piano rows */}
              {pitches.map((pitch, index) => (
                <div
                  key={pitch}
                  className={`piano-roll-lane${
                    pitch % 12 === 0
                      ? " piano-roll-c"
                      : ""
                  }`}
                  style={{
                    top: index * ROW_HEIGHT,
                    height: ROW_HEIGHT
                  }}
                />
              ))}

              {/* Vertical grid lines */}
              {ticks.map((second) => (
                <div
                  key={second}
                  className="piano-roll-gridline"
                  style={{
                    left:
                      (second / totalDuration) *
                      timelineWidth
                  }}
                />
              ))}

              {/* Detected notes */}
              {validNotes.map((note, index) => {
                const x =
                  (note.start / totalDuration) *
                  timelineWidth;

                const width = Math.min(
                  timelineWidth - x,
                  Math.max(
                    5,
                    ((note.end - note.start) /
                      totalDuration) *
                      timelineWidth
                  )
                );

                const active =
                  currentTime >= note.start &&
                  currentTime < note.end;

                return (
                  <button
                    key={`${note.pitch}-${note.start}-${index}`}
                    type="button"
                    className={`piano-roll-note${
                      active ? " active" : ""
                    }`}
                    style={{
                      left: x,
                      top:
                        (maxPitch - note.pitch) *
                          ROW_HEIGHT +
                        4,
                      width,
                      height: ROW_HEIGHT - 8
                    }}
                    title={`${note.note}: ${note.start.toFixed(2)}s – ${note.end.toFixed(2)}s`}
                    aria-label={`Seek to ${note.note} at ${note.start.toFixed(2)} seconds`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSeek(note.start);
                    }}
                  >
                    {width > 42 ? note.note : ""}
                  </button>
                );
              })}

              {/* Moving playback indicator */}
              <div
                className="piano-roll-playhead"
                style={{
                  left:
                    (displayedTime / totalDuration) *
                    timelineWidth
                }}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
