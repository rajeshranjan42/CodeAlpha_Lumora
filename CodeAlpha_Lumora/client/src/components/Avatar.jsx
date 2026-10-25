import { assetUrl } from '../api.js';

const PALETTE = [
  ['#FFB03A', '#FF4D8D'],
  ['#FF4D8D', '#7B4DFF'],
  ['#7B4DFF', '#22C3E6'],
  ['#22C3E6', '#3DDC97'],
  ['#3DDC97', '#FFB03A'],
];

export default function Avatar({ user, size = 40, ring = false }) {
  const name = user?.name || user?.username || '?';
  const seed = (user?.username || name).charCodeAt(0) % PALETTE.length;
  const [a, b] = PALETTE[seed];
  const style = { width: size, height: size, fontSize: size * 0.4 };

  const inner = user?.avatar ? (
    <img className="avatar-img" src={assetUrl(user.avatar)} alt={name} style={style} />
  ) : (
    <span
      className="avatar-fallback"
      style={{ ...style, background: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );

  return ring ? <span className="avatar-ring">{inner}</span> : inner;
}
