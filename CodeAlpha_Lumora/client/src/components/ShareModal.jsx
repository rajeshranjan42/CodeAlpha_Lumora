import { useState } from 'react';
import Modal from './Modal.jsx';
import { CheckIcon, LinkIcon, ShareIcon } from './Icons.jsx';
import SendPicker from './SendPicker.jsx';
import { packCard } from '../e2ee.js';

/** Share a post or reel: copy the link, use the phone's share sheet, or open WhatsApp / Telegram. */
export default function ShareModal({ post, onClose }) {
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState(0);
  const thumb = post.images?.[0] || post.image || '';
  const card = { i: post._id, v: post.video ? 1 : 0, t: post.video ? '' : thumb, m: post.video || '', a: post.author.username, av: post.author.avatar || '', c: (post.caption || '').slice(0, 100) };
  const path = post.video ? `/reels/${post._id}` : `/post/${post._id}`;
  const link = `${window.location.origin}${path}`;
  const text = `${post.author.username} on Lumora: ${post.caption ? post.caption.slice(0, 80) : 'check this out'}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const t = document.createElement('textarea');
      t.value = link;
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const native = () => navigator.share({ title: 'Lumora', text, url: link }).catch(() => {});

  return (
    <Modal title={post.video ? 'Share reel' : 'Share post'} onClose={onClose}>
      <h4 className="share-sub">Send to people</h4>
      {done ? (
        <p className="share-done"><CheckIcon width={16} height={16} /> Sent to {done} {done > 1 ? 'people' : 'person'}. They can open it from your chat.</p>
      ) : (
        <SendPicker makePlain={(note) => packCard(note, card)} onDone={setDone} />
      )}
      <h4 className="share-sub">Or share outside Lumora</h4>
      <div className="share-link">
        <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Link" />
        <button type="button" className="btn btn-primary btn-sm" onClick={copy}>
          {copied ? <><CheckIcon width={16} height={16} /> Copied</> : <><LinkIcon width={16} height={16} /> Copy</>}
        </button>
      </div>
      <div className="share-grid">
        {typeof navigator.share === 'function' && (
          <button type="button" className="share-opt" onClick={native}>
            <ShareIcon width={22} height={22} /> More apps…
          </button>
        )}
        <a className="share-opt" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`}>
          WhatsApp
        </a>
        <a className="share-opt" target="_blank" rel="noreferrer" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`}>
          Telegram
        </a>
        <a className="share-opt" href={`mailto:?subject=${encodeURIComponent('Check this out on Lumora')}&body=${encodeURIComponent(`${text}\n${link}`)}`}>
          Email
        </a>
      </div>
    </Modal>
  );
}