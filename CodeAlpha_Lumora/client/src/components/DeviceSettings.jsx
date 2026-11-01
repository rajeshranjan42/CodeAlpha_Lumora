import { useEffect, useState } from 'react';
import { BellIcon, InstallIcon } from './Icons.jsx';
import { currentSubscription, disablePush, enablePush, pushSupported } from '../push.js';
import { useInstall } from '../pwa.js';

/** Notifications page card: turn on alerts for this device, and install Lumora as an app. */
export default function DeviceSettings() {
  const { canInstall, installed, ios, install } = useInstall();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const supported = pushSupported();
  const blocked = supported && Notification.permission === 'denied';

  useEffect(() => {
    let live = true;
    currentSubscription().then((s) => live && setOn(!!s && Notification.permission === 'granted'));
    return () => {
      live = false;
    };
  }, []);

  const toggle = async () => {
    setError('');
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setOn(false);
      } else {
        await enablePush();
        setOn(true);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // nothing useful to show: already installed + alerts can't change (unsupported)
  if (!supported && !canInstall && !ios) return null;

  return (
    <div className="card device-card">
      <div className="device-row">
        <BellIcon width={26} height={26} />
        <div className="device-text">
          <strong>Alerts on this device</strong>
          {!supported ? (
            <small>
              {ios ? 'On iPhone / iPad, first add Lumora to your Home Screen (below), then open it from there.' : 'This browser can’t show device notifications.'}
            </small>
          ) : blocked ? (
            <small>Blocked in your browser. Allow notifications for this site in the site settings, then come back.</small>
          ) : (
            <small>{on ? 'On: you’ll get glows, comments, follows and messages even when Lumora is closed.' : 'Get glows, comments, follows and messages even when Lumora is closed.'}</small>
          )}
        </div>
        {supported && !blocked && (
          <button className={`btn ${on ? 'btn-ghost' : 'btn-primary'} btn-sm`} onClick={toggle} disabled={busy}>
            {busy ? '…' : on ? 'Turn off' : 'Turn on'}
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}

      {(canInstall || ios) && !installed && (
        <div className="device-row">
          <InstallIcon width={26} height={26} />
          <div className="device-text">
            <strong>Install Lumora</strong>
            <small>
              {canInstall ? 'Add Lumora to your phone or computer like a normal app.' : 'In Safari tap Share, then “Add to Home Screen”.'}
            </small>
          </div>
          {canInstall && (
            <button className="btn btn-primary btn-sm" onClick={install}>
              Install
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function InstallNavButton({ className = 'nav-item' }) {
  const { canInstall, install } = useInstall();
  if (!canInstall) return null;
  return (
    <button className={className} onClick={install}>
      <InstallIcon /> <span>Install app</span>
    </button>
  );
}