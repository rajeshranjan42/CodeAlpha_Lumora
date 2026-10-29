import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, assetUrl } from '../api.js';
import Avatar from '../components/Avatar.jsx';
import FollowButton from '../components/FollowButton.jsx';
import EditProfileModal from '../components/EditProfileModal.jsx';
import Modal from '../components/Modal.jsx';
import PostCard from '../components/PostCard.jsx';
import UserRow from '../components/UserRow.jsx';
import { BookmarkIcon, GlowIcon, MessageIcon, PlayIcon } from '../components/Icons.jsx';
import { PostGrid } from './Explore.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { cache } from '../cache.js';
import { thumbHash } from '../hooks/useTrim.js';
import { compact } from '../utils.js';

function ReelGrid({ reels, onOpen }) {
  return (
    <div className="grid reel-grid">
      {reels.map((r) => (
        <button key={r._id} className="tile reel-tile" onClick={() => onOpen(r)} aria-label="Open reel">
          <video src={`${assetUrl(r.video)}${thumbHash(r.trimStart)}`} preload="metadata" muted playsInline />
          <span className="reel-badge">
            <PlayIcon width={16} height={16} />
          </span>
          <span className="tile-over">
            <span>
              <GlowIcon width={18} height={18} filled /> {compact(r.likesCount)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const first = cache.get(`profile:${username}`);
  const [profile, setProfile] = useState(first?.profile || null);
  const [posts, setPosts] = useState(first?.posts || []);
  const [reels, setReels] = useState(null); // null = not loaded yet
  const [saved, setSaved] = useState(null); // my saved posts + reels (own profile only)
  const [tab, setTab] = useState('posts');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!first);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(null);
  const [list, setList] = useState(null); // { title, users }

  useEffect(() => {
    let alive = true;
    const hit = cache.get(`profile:${username}`);
    setError('');
    setTab('posts');
    setReels(null);
    setSaved(null);
    if (hit) {
      // seen before: show it right away and refresh quietly
      setProfile(hit.profile);
      setPosts(hit.posts);
      setLoading(false);
    } else {
      setLoading(true);
      setProfile(null);
      setPosts([]);
    }
    Promise.all([api.profile(username), api.userPosts(username)])
      .then(([p, po]) => {
        if (!alive) return;
        setProfile(p.user);
        setPosts(po.posts);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [username]);

  useEffect(() => {
    if (profile && !loading && profile.username === username) cache.set(`profile:${username}`, { profile, posts });
  }, [profile, posts, loading, username]);

  useEffect(() => {
    const onCreated = (e) => {
      const item = e.detail;
      if (!profile?.isMe || !item || item.video) return; // reels live in the Reels tab (and count below)
      setPosts((l) => (l.some((x) => x._id === item._id) ? l : [item, ...l]));
      setProfile((p) => ({ ...p, postsCount: p.postsCount + 1 }));
    };
    window.addEventListener('lumora:post-created', onCreated);
    return () => window.removeEventListener('lumora:post-created', onCreated);
  }, [profile?.isMe]);

  const showTab = (t) => {
    setTab(t);
    if (t === 'saved' && saved === null) {
      api
        .saved()
        .then((d) => setSaved(d.posts))
        .catch(() => setSaved([]));
    }
    if (t === 'reels' && reels === null) {
      api
        .userReels(username)
        .then((d) => setReels(d.reels))
        .catch(() => setReels([]));
    }
  };

  const showList = async (kind) => {
    const d = kind === 'followers' ? await api.followers(username) : await api.following(username);
    setList({ title: kind === 'followers' ? 'Followers' : 'Following', users: d.users });
  };

  const startChat = async () => {
    try {
      const d = await api.openConversation(profile._id);
      navigate(`/messages/${d.conversation._id}`);
    } catch (e) {
      alert(e.message);
    }
  };

  if (loading) return <p className="muted center">Loading profile…</p>;
  if (error)
    return (
      <div className="card empty">
        <h3>Profile unavailable</h3>
        <p className="muted">{error}</p>
      </div>
    );

  return (
    <div className="page">
      <section className="card profile-head">
        <div className="profile-cover" />

        <div className="profile-top">
          <Avatar user={profile} size={116} ring />
        </div>

        <div className="profile-main">
          <h2>{profile.name}</h2>
          <span className="handle">@{profile.username}</span>
          {profile.bio && <p className="bio">{profile.bio}</p>}

          <div className="stats">
            <div>
              <strong>{compact(profile.postsCount)}</strong>
              <span>Posts</span>
            </div>
            <button onClick={() => showList('followers')}>
              <strong>{compact(profile.followersCount)}</strong>
              <span>Followers</span>
            </button>
            <button onClick={() => showList('following')}>
              <strong>{compact(profile.followingCount)}</strong>
              <span>Following</span>
            </button>
          </div>
        </div>

        {/* top-right on desktop, a tidy full-width row under the stats on phones */}
        <div className="profile-actions">
          {profile.isMe ? (
            <>
              <button className="btn btn-ghost" onClick={() => setEditing(true)}>
                Edit profile
              </button>
              <button
                className="btn btn-ghost btn-logout only-mobile"
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <FollowButton
                userId={profile._id}
                isFollowing={profile.isFollowing}
                onChange={(r) =>
                  setProfile((p) => ({ ...p, followersCount: r.followersCount, isFollowing: r.following }))
                }
              />
              <button className="btn btn-ghost" onClick={startChat}>
                <MessageIcon width={18} height={18} /> Message
              </button>
            </>
          )}
        </div>
      </section>

      <div className="profile-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'posts'} className={tab === 'posts' ? 'on' : ''} onClick={() => showTab('posts')}>
          Glows
        </button>
        <button role="tab" aria-selected={tab === 'reels'} className={tab === 'reels' ? 'on' : ''} onClick={() => showTab('reels')}>
          Reels
        </button>
        {profile.isMe && (
          <button role="tab" aria-selected={tab === 'saved'} className={tab === 'saved' ? 'on' : ''} onClick={() => showTab('saved')}>
            <BookmarkIcon width={16} height={16} /> Saved
          </button>
        )}
      </div>

      {tab === 'posts' ? (
        <>
          <PostGrid posts={posts} onOpen={setOpen} />
          {posts.length === 0 && (
            <div className="card empty">
              <h3>No posts yet</h3>
              <p className="muted">{profile.isMe ? 'Share your first glow with the world.' : 'Nothing shared yet.'}</p>
            </div>
          )}
        </>
      ) : tab === 'saved' ? (
        <>
          {saved === null && <p className="muted center">Loading saved…</p>}
          {saved && <PostGrid posts={saved} onOpen={(p) => (p.video ? navigate(`/reels/${p._id}`) : setOpen(p))} />}
          {saved?.length === 0 && (
            <div className="card empty">
              <h3>Nothing saved yet</h3>
              <p className="muted">Tap the bookmark under a post or reel to keep it here. Only you can see this.</p>
            </div>
          )}
        </>
      ) : (
        <>
          {reels === null && <p className="muted center">Loading reels…</p>}
          {reels && <ReelGrid reels={reels} onOpen={(r) => navigate(`/reels/${r._id}`)} />}
          {reels?.length === 0 && (
            <div className="card empty">
              <h3>No reels yet</h3>
              <p className="muted">{profile.isMe ? 'Tap Create → Reel to share your first video.' : 'Nothing shared yet.'}</p>
            </div>
          )}
        </>
      )}

      {open && (
        <Modal title="Post" onClose={() => setOpen(null)} wide>
          <PostCard
            post={open}
            startOpen
            onDelete={(id) => {
              setPosts((l) => l.filter((x) => x._id !== id));
              setProfile((p) => ({ ...p, postsCount: p.postsCount - 1 }));
              setOpen(null);
            }}
          />
        </Modal>
      )}

      {editing && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditing(false)}
          onSaved={(u) => setProfile((p) => ({ ...p, ...u }))}
        />
      )}

      {list && (
        <Modal title={list.title} onClose={() => setList(null)}>
          {list.users.length === 0 && <p className="muted">No one here yet.</p>}
          {list.users.map((u) => (
            <UserRow key={u._id} person={u} onNavigate={() => setList(null)} />
          ))}
        </Modal>
      )}
    </div>
  );
}