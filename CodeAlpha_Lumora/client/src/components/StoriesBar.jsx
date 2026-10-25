import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';
import StoryViewer from './StoryViewer.jsx';
import { PlusIcon } from './Icons.jsx';
import { useAuth } from '../context/AuthContext.jsx';

/** Horizontal stories strip: your story first, then people you follow (unseen first). */
export default function StoriesBar() {
  const { user } = useAuth();
  const [groups, setGroups] = useState(null);
  const [viewing, setViewing] = useState(null); // index into `ordered`

  const load = useCallback(() => {
    api
      .storyFeed()
      .then((d) => setGroups(d.groups))
      .catch(() => setGroups([]));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('lumora:story-created', load);
    return () => window.removeEventListener('lumora:story-created', load);
  }, [load]);

  const mine = groups?.find((g) => g.isMe);
  const others = groups?.filter((g) => !g.isMe) || [];
  const ordered = [...(mine ? [mine] : []), ...others];

  const addStory = () =>
    window.dispatchEvent(new CustomEvent('lumora:open-create', { detail: { tab: 'story' } }));

  return (
    <>
      <div className="circle" aria-label="Stories">
        <div className="circle-item">
          <button
            className="story-btn"
            onClick={() => (mine ? setViewing(0) : addStory())}
            aria-label={mine ? 'View your story' : 'Add to your story'}
          >
            <span className={`story-ring ${mine ? '' : 'empty'}`}>
              <Avatar user={user} size={58} />
            </span>
          </button>
          <button className="story-plus" onClick={addStory} aria-label="Add story">
            <PlusIcon width={14} height={14} />
          </button>
          <span className="circle-name">Your story</span>
        </div>

        {others.map((g) => (
          <button
            key={g.user._id}
            className="circle-item story-btn"
            onClick={() => setViewing(ordered.indexOf(g))}
            aria-label={`View ${g.user.username}'s story`}
          >
            <span className={`story-ring ${g.allSeen ? 'seen' : ''}`}>
              <Avatar user={g.user} size={58} />
            </span>
            <span className="circle-name">{g.user.username}</span>
          </button>
        ))}

        {groups && others.length === 0 && !mine && (
          <p className="muted small circle-hint">Stories from people you follow appear here.</p>
        )}
      </div>

      {viewing !== null && (
        <StoryViewer
          groups={ordered}
          startGroup={viewing}
          onClose={() => {
            setViewing(null);
            load();
          }}
        />
      )}
    </>
  );
}