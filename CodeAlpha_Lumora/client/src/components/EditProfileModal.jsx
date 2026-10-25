import { useRef, useState } from 'react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import Avatar from './Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function EditProfileModal({ profile, onClose, onSaved }) {
  const { setUser } = useAuth();
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio || '');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(profile.avatar);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef();

  const pick = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return setError('Please choose an image file.');
    if (f.size > 5 * 1024 * 1024) return setError('Image must be under 5 MB.');
    setError('');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('bio', bio.trim());
      if (file) form.append('avatar', file);
      const d = await api.updateProfile(form);
      setUser((u) => ({ ...u, ...d.user }));
      onSaved(d.user);
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const shown = preview?.startsWith('blob:') ? { ...profile, avatar: preview } : { ...profile, avatar: preview };

  return (
    <Modal title="Edit profile" onClose={onClose}>
      <form onSubmit={submit} className="create-form">
        <div className="edit-avatar">
          <Avatar user={shown} size={84} ring />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => input.current.click()}>
            Change photo
          </button>
          <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
        </div>
        <label className="field">
          <span>Name</span>
          <input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Bio</span>
          <textarea value={bio} maxLength={160} rows={3} onChange={(e) => setBio(e.target.value)} />
          <small className="muted tiny">{bio.length}/160</small>
        </label>
        {error && <p className="error small">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </Modal>
  );
}
