import { useId } from 'react';

export function LogoMark({ size = 36 }) {
  // unique id per instance: the sidebar copy is hidden on phones, which made a shared id unusable
  const gid = `lm-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFB03A" />
          <stop offset=".55" stopColor="#FF4D8D" />
          <stop offset="1" stopColor="#7B4DFF" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill={`url(#${gid})`} />
      <circle cx="20" cy="20" r="7" fill="#fff" opacity=".95" />
      <path
        d="M20 5v5M20 30v5M5 20h5M30 20h5"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity=".85"
      />
    </svg>
  );
}

/** Brand lockup:  Lumora / CODEALPHA / by Rajesh Ranjan */
export default function Logo({ compact = false }) {
  return (
    <div className="logo">
      <LogoMark />
      {!compact && (
        <div className="logo-text">
          <span className="logo-name">Lumora</span>
          <span className="logo-sub">CodeAlpha</span>
          <span className="logo-by">by Rajesh Ranjan</span>
        </div>
      )}
    </div>
  );
}