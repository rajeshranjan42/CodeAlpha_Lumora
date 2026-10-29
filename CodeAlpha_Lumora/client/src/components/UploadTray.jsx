import { Link } from 'react-router-dom';
import { useUploads } from '../context/UploadContext.jsx';
import { CheckIcon, CloseIcon } from './Icons.jsx';

const NOUN = { post: 'post', story: 'story', reel: 'reel' };

/** Floating progress cards for uploads that run in the background. */
export default function UploadTray() {
  const { jobs, retry, dismiss } = useUploads();
  if (!jobs.length) return null;

  return (
    <div className="upload-tray" role="status" aria-live="polite">
      {jobs.map((j) => {
        const pct = Math.round(j.progress * 100);
        const done = j.status === 'done';
        const failed = j.status === 'error';
        const link = done && j.item ? (j.kind === 'reel' ? `/reels/${j.item._id}` : j.kind === 'post' ? `/u/${j.item.author?.username}` : '/') : null;
        return (
          <div key={j.id} className={`upload-card ${failed ? 'bad' : ''} ${done ? 'ok' : ''}`}>
            <div className="upload-main">
              <strong>
                {done && <CheckIcon width={16} height={16} />}{' '}
                {failed
                  ? `Couldn’t upload your ${NOUN[j.kind]}`
                  : done
                    ? `Your ${NOUN[j.kind]} is live`
                    : j.status === 'processing'
                      ? `Finishing your ${NOUN[j.kind]}…`
                      : `Uploading your ${NOUN[j.kind]} · ${pct}%`}
              </strong>
              {failed ? <span className="upload-err">{j.error}</span> : <span className="muted tiny">{j.label}</span>}
              {!done && !failed && (
                <div className="upload-bar slim">
                  <i style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
            <div className="upload-actions">
              {failed && (
                <button className="btn btn-primary btn-sm" onClick={() => retry(j.id)}>
                  Retry
                </button>
              )}
              {link && (
                <Link className="btn btn-ghost btn-sm" to={link} onClick={() => dismiss(j.id)}>
                  View
                </Link>
              )}
              {(failed || done) && (
                <button className="icon-btn" onClick={() => dismiss(j.id)} aria-label="Dismiss">
                  <CloseIcon width={18} height={18} />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}