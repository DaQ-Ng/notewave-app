
import { useEffect, useState } from "react";
import "./Waveform.css";

const BAR_COUNT = 100;

function formatTime(time) {
  if (!Number.isFinite(time)) return "0:00";
  const seconds = Math.max(0, Math.floor(time));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function Waveform({
  audioUrl,
  currentTime,
  duration,
  onSeek,
}) {
  const [peaks, setPeaks] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    setPeaks([]);
    setError("");

    if (!audioUrl) return;

    let active = true;
    const controller = new AbortController();
    const audioContext = new AudioContext();

    async function generateWaveform() {
      try {
        const response = await fetch(audioUrl, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Could not read audio");
        }

        const bytes = await response.arrayBuffer();
        const buffer = await audioContext.decodeAudioData(bytes);
        const samples = buffer.getChannelData(0);

        const values = [];

        for (let i = 0; i < BAR_COUNT; i++) {
          const start = Math.floor(
            (i / BAR_COUNT) * samples.length
          );
          const end = Math.floor(
            ((i + 1) / BAR_COUNT) * samples.length
          );

          let peak = 0;
          const step = Math.max(
            1,
            Math.floor((end - start) / 200)
          );

          for (let j = start; j < end; j += step) {
            peak = Math.max(peak, Math.abs(samples[j]));
          }

          values.push(peak);
        }

        const maximum = Math.max(...values, 0.001);

        if (active) {
          setPeaks(
            values.map((value) =>
              Math.max(0.08, value / maximum)
            )
          );
        }
      } catch (err) {
        if (active && err.name !== "AbortError") {
          setError("Waveform unavailable for this file.");
        }
      }
    }

    generateWaveform();

    return () => {
      active = false;
      controller.abort();
      audioContext.close().catch(() => {});
    };
  }, [audioUrl]);

  if (!audioUrl) return null;

  const total = Number.isFinite(duration) && duration > 0
    ? duration
    : 0;

  const position = Number.isFinite(currentTime)
    ? Math.max(0, Math.min(currentTime, total))
    : total;

  const progress = total > 0 ? position / total : 0;

  function seek(ratio) {
    if (total <= 0) return;
    onSeek(Math.max(0, Math.min(1, ratio)) * total);
  }

  function handleClick(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    seek((event.clientX - rect.left) / rect.width);
  }

  function handleKeyDown(event) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      seek((position + 1) / total);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seek((position - 1) / total);
    }
  }

  return (
    <section className="waveform-card">
      <div className="waveform-header">
        <h2>Audio Waveform</h2>
        <span>
          {formatTime(position)} / {formatTime(total)}
        </span>
      </div>

      {error ? (
        <p>{error}</p>
      ) : peaks.length === 0 ? (
        <p>Generating waveform...</p>
      ) : (
        <div
          className="waveform-visual"
          role="slider"
          tabIndex={0}
          aria-label="Audio playback position"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={position}
          aria-valuetext={formatTime(position)}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
        >
          <svg
            viewBox={`0 0 ${BAR_COUNT * 8} 108`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {peaks.map((peak, index) => {
              const height = Math.max(4, peak * 88);

              return (
                <rect
                  key={index}
                  x={index * 8 + 1}
                  y={(108 - height) / 2}
                  width="5"
                  height={height}
                  rx="2.5"
                  fill={
                    index / BAR_COUNT <= progress
                      ? "#aa97ff"
                      : "#53658b"
                  }
                />
              );
            })}

            <line
              x1={progress * BAR_COUNT * 8}
              x2={progress * BAR_COUNT * 8}
              y1="0"
              y2="108"
              stroke="#ffffff"
              strokeWidth="2"
            />
          </svg>
        </div>
      )}

      <p className="waveform-hint">
        Click the waveform to jump to that part of the audio.
      </p>
    </section>
  );
}
