import { useEffect, useRef, useState } from 'react';
import { ScissorsIcon } from './Icons.jsx';
import { useTrim } from '../hooks/useTrim.js';
import { fmtTime } from '../mediaUtils.js';

const MIN = 1; // shortest allowed clip, seconds

/**
 * Pick the part of a long video to share. The whole file is uploaded, but only [start, end] is played.
 * value = { start, end }.
 */
export default function TrimEditor({ src, duration, max, value, onChange, muted = true }) {
  const video = useRef(null);
  const [playing, setPlaying] = useState(true);
  const { start, end } = value;
  const length = end - start;
  const needsTrim = duration > max + 0.75;

  useTrim(video, start, end);

  // jump to the new start whenever a handle moves
  useEffect(() => {
    const v = video.current;
    if (v && v.readyState >= 1) v.currentTime = start;
  }, [start]);

  const setStart = (raw) => {
    const s = Math.min(Math.max(0, raw), end - MIN);
    onChange({ start: s, end: end - s > max ? s + max : end });
  };
  const setEnd = (raw) => {
    const e = Math.max(Math.min(duration, raw), start + MIN);
    onChange({ start: e - start > max ? e - max : start, end: e });
  };

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  const pct = (x) => `${(x / duration) * 100}%`;

  return (
    <div className="trim">
      <video
        ref={video}
        src={src}
        muted={muted}
        loop
        autoPlay
        playsInline
        onClick={toggle}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      {!playing && <span className="trim-paused">Tap to play</span>}

      <div className="trim-head">
        <span>
          <ScissorsIcon width={16} height={16} /> {needsTrim ? 'Trim your video' : 'Trim (optional)'}
        </span>
        <strong className={length > max + 0.75 ? 'bad' : ''}>
          {fmtTime(length)} <small>/ {fmtTime(max)} max</small>
        </strong>
      </div>

      <div className="trim-track">
        <i className="trim-window" style={{ left: pct(start), width: pct(length) }} />
        <input type="range" min={0} max={duration} step={0.1} value={start} onChange={(e) => setStart(parseFloat(e.target.value))} aria-label="Start of clip" />
        <input type="range" min={0} max={duration} step={0.1} value={end} onChange={(e) => setEnd(parseFloat(e.target.value))} aria-label="End of clip" />
      </div>
      <div className="trim-times">
        <span>{fmtTime(start)}</span>
        <span className="muted tiny">Video is {fmtTime(duration)} long</span>
        <span>{fmtTime(end)}</span>
      </div>
    </div>
  );
}