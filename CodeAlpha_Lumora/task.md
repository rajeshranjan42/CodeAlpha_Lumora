# ✅ TASK 2: Social Media Platform

**Project folder:** `CodeAlpha_Lumora`
**App name:** **Lumora** · **CodeAlpha** · *by Rajesh Ranjan*
**Tagline:** *Share your light.*
**Stack:** MongoDB · Express.js · React (Vite) · Node.js (MERN)

---

## 1. Task Brief

Create a **mini social media app** with:

- **User profiles**
- **Posts & comments**
- **Like / follow system**

| Layer    | Requirement                              | Used in Lumora                      |
| -------- | ---------------------------------------- | ----------------------------------- |
| Frontend | HTML, CSS, JavaScript                    | React 18 + Vite, hand-written CSS   |
| Backend  | Django **or** Express.js                 | Express.js (Node) + Socket.io       |
| Database | users, posts, comments, followers        | MongoDB + Mongoose                  |

---

## 2. Brand — Lumora · CodeAlpha · by Rajesh Ranjan

**Idea:** Lumora is a calmer, kinder corner of the internet. People don't "like" a post — they send it a **Glow** ☀️. The whole identity is built around light, which keeps it clearly distinct from other photo-sharing apps.

**Brand values**

- ✦ **Meaningful over mindless** — quality moments, not endless scrolling
- ✦ **Kind conversations** — comments that add warmth
- ✦ **Yours to shape** — you own your profile, your posts, your circle

**Design language**

| Item        | Choice                                                                 |
| ----------- | ---------------------------------------------------------------------- |
| Palette     | "Dawn" gradient — amber `#FFB03A` → rose `#FF4D8D` → violet `#7B4DFF`  |
| Background  | Warm cream (light) / deep plum (dark) with a built-in theme toggle     |
| Typography  | **Fraunces** (display) + **Plus Jakarta Sans** (UI)                    |
| Interaction | Glow = sun-spark icon; double-tap a post to glow; "Glow" burst animation |
| Layout      | Sidebar + feed + suggestions on desktop; floating bottom nav on mobile |
| Text posts  | Posts without a photo render as bold gradient quote cards              |

---

## 3. Features

### Users & profiles
- [x] Register / login with JWT (passwords hashed with bcrypt)
- [x] Persistent session, protected routes
- [x] Profile page: avatar, name, @username, bio, post / follower / following counts
- [x] Edit profile (name, bio, avatar upload)
- [x] Search people by name or username
- [x] "People to follow" suggestions

### Posts
- [x] Create a post with photo and/or caption (image ≤ 5 MB, JPG/PNG/WEBP/GIF)
- [x] Home feed — your posts + people you follow, with "Load more" pagination
- [x] Explore — discover everyone's latest posts in a grid
- [x] Open any post in a modal; delete your own posts

### Comments
- [x] Add / view comments on any post
- [x] Delete a comment (comment author **or** post owner)

### Like (Glow) / Follow
- [x] Glow toggle with optimistic UI and live count
- [x] Follow / unfollow with optimistic UI
- [x] Followers and following lists on every profile

### Messaging (direct messages)
- [x] Instagram-style inbox with last message, time, unread dot and online indicator
- [x] Real-time 1-to-1 chat over Socket.io (messages appear instantly, no refresh)
- [x] Typing indicator, "Active now" presence, Seen / Sent receipts
- [x] Unsend your own messages; load earlier messages; day separators
- [x] Message button on every profile, "New message" search, unread badge in the nav

### End-to-end encrypted messaging
- [x] Messages are encrypted **in the browser** (Web Crypto: ECDH P-256 → HKDF → AES-256-GCM); the server stores and relays ciphertext only
- [x] Private key never leaves the device in readable form; a password-wrapped backup (PBKDF2, 310k iterations) lets you log in on another device
- [x] Fresh random IV per message, messages bound to their conversation id, tampering is detected
- [x] "Verify encryption" safety number in every chat; logging out removes the key from the device
- [x] Existing accounts get keys automatically the next time they log in

> **Limits:** no password-reset flow exists, so a forgotten password means old encrypted chats cannot be recovered. Story replies are encrypted too. Post comments are public and are not encrypted.

### Stories
- [x] Share a photo or video story from Create → Story (video up to **45 seconds**); it disappears after 24 hours
- [x] Stories strip on Home: your story first, then people you follow (unseen = gradient ring, seen = grey)
- [x] Full-screen viewer: segmented progress bars, tap left/right, hold to pause, keyboard arrows
- [x] Reply to a story → arrives as a direct message
- [x] Owner sees the viewers list and can delete a story; expired stories and files are purged automatically

### Reels
- [x] Share a short video from Create → Reel (MP4 / WEBM / MOV, up to **1 min 30 sec**, no file-size limit) with an upload progress bar
- [x] Full-screen vertical feed: snap scrolling, only the visible reel plays, tap to pause, mute toggle
- [x] Glow (double-tap), comments drawer, follow button, delete your own reel
- [x] Reels tab on every profile; infinite scroll

### Navigation & reels in the feed
- [x] Small screens: avatar menu in the top bar (profile, dark mode, **Log out**) and a Log out button on your own profile
- [x] Login / Sign up tabs on the auth screen
- [x] Reels also appear in the Home feed and Explore as videos (muted autoplay); **clicking one opens the full-screen scrolling Reels viewer**, double-click glows it

### Home & profile polish
- [x] "Your circle" strip, greeting, square post media, Messages and suggestions in the side rail
- [x] Redesigned profile header with cover, avatar, stats and Follow / Message buttons

### Quality
- [x] Responsive (desktop, tablet, mobile) · dark mode · keyboard focus states
- [x] Helmet, CORS, rate-limited auth routes, upload validation, centralized error handling

---

> **Video length limits:** reels ≤ 1:30 and story videos ≤ 0:45 are enforced in the browser *and* on the server (`server/utils/videoDuration.js` reads the length from the MP4/MOV/WebM header, no ffmpeg needed). There is no per-video MB limit; only a 2 GB safety ceiling protects the server disk.

## 4. Project Structure

```
CodeAlpha_Lumora/
├── task.md
├── package.json              # root scripts (run client + server together)
├── .gitignore
├── client/                   # ── FRONTEND (built first) ──
│   ├── index.html
│   ├── vite.config.js        # proxies /api and /uploads to :5000
│   └── src/
│       ├── main.jsx
│       ├── App.jsx           # routes + guards
│       ├── api.js            # fetch wrapper + endpoints
│       ├── e2ee.js           # end-to-end encryption (Web Crypto)
│       ├── utils.js
│       ├── styles.css        # complete design system
│       ├── context/AuthContext.jsx
│       ├── components/       # StoriesBar, StoryViewer, Layout, PostCard, Comments, Modal, Avatar,
│       │                     # FollowButton, UserRow, Suggestions, CircleRow,
│       │                     # RecentChats, Logo, Icons, CreatePostModal, EditProfileModal
│       ├── context/          # AuthContext, SocketContext (real-time + unread badge)
│       └── pages/            # AuthPage, Feed, Explore, Profile, Messages, Reels
└── server/                   # ── BACKEND (built second) ──
    ├── server.js
    ├── .env.example
    ├── seed.js               # demo users, posts and chats (npm run seed)
    ├── socket.js             # Socket.io: auth, presence, typing, delivery
    ├── config/db.js
    ├── models/               # User, Post, Comment, Conversation, Message, Story
    ├── controllers/          # auth, user, post, comment, message, story, reel
    ├── routes/index.js
    ├── middleware/           # auth (JWT), upload (multer), error
    ├── utils/helpers.js
    └── uploads/              # user images (git-ignored)
```

---

## 5. Setup & Run

**Prerequisites:** Node.js 18+ and MongoDB (local) or a free MongoDB Atlas cluster.

```bash
cd CodeAlpha_Lumora

# 1. install everything (root + client + server)
npm run install:all

# 2. configure the backend
cp server/.env.example server/.env
#    → edit server/.env: set MONGO_URI and a long random JWT_SECRET

# 3. start both apps together
npm run dev
```

- Frontend → http://localhost:5173
- API → http://localhost:5000/api/health

**Production-style run** (Express serves the built React app):

```bash
npm run build
npm start        # → http://localhost:5000
```

**Environment variables (`server/.env`)**

| Variable         | Example                              | Purpose                          |
| ---------------- | ------------------------------------ | -------------------------------- |
| `PORT`           | `5000`                               | API port                         |
| `MONGO_URI`      | `mongodb://127.0.0.1:27017/lumora`   | MongoDB connection string        |
| `JWT_SECRET`     | *(long random string)*               | Signs login tokens               |
| `JWT_EXPIRES_IN` | `7d`                                 | Token lifetime                   |
| `CLIENT_ORIGIN`  | `http://localhost:5173`              | Allowed CORS origin              |

---

## 6. Database Schema (MongoDB)

**users**

| Field                  | Type       | Notes                              |
| ---------------------- | ---------- | ---------------------------------- |
| `name`                 | String     | required, ≤ 50                     |
| `username`             | String     | unique, lowercase, 3–20 `[a-z0-9_.]` |
| `email`                | String     | unique, lowercase                  |
| `password`             | String     | bcrypt hash, `select: false`       |
| `bio`                  | String     | ≤ 160                              |
| `avatar`               | String     | `/uploads/...`                     |
| `publicKey`            | String     | ECDH P-256 public key (JWK)        |
| `keyBackup`            | Object     | password-wrapped private key (`select: false`) |
| `followers`            | [ObjectId] | → users                            |
| `following`            | [ObjectId] | → users                            |
| `createdAt/updatedAt`  | Date       | timestamps                         |

**posts**

| Field           | Type       | Notes                  |
| --------------- | ---------- | ---------------------- |
| `author`        | ObjectId   | → users (indexed)      |
| `caption`       | String     | ≤ 1000                 |
| `image`         | String     | `/uploads/...` or empty |
| `likes`         | [ObjectId] | → users (Glows)        |
| `commentsCount` | Number     | denormalized counter   |
| timestamps      | Date       | `createdAt` indexed    |

**comments**

| Field      | Type     | Notes             |
| ---------- | -------- | ----------------- |
| `post`     | ObjectId | → posts (indexed) |
| `author`   | ObjectId | → users           |
| `text`     | String   | required, ≤ 500   |
| timestamps | Date     |                   |

**conversations**

| Field         | Type       | Notes                                              |
| ------------- | ---------- | -------------------------------------------------- |
| `participants`| [ObjectId] | the two users                                      |
| `pairKey`     | String     | unique sorted `idA_idB` → one chat per pair        |
| `lastMessage` | Object     | `{ text, sender, createdAt }` for the inbox preview |

**messages**

| Field          | Type     | Notes                    |
| -------------- | -------- | ------------------------ |
| `conversation` | ObjectId | → conversations (indexed)|
| `sender`       | ObjectId | → users                  |
| `text`         | String   | base64 **ciphertext** (≤ 4000) |
| `iv`           | String   | AES-GCM nonce            |
| `encrypted`    | Boolean  | false only for legacy messages |
| `seen`         | Boolean  | read receipt             |
| timestamps     | Date     |                          |

**stories**

| Field       | Type       | Notes                                   |
| ----------- | ---------- | --------------------------------------- |
| `author`    | ObjectId   | → users (indexed)                       |
| `media`     | String     | `/uploads/...`                          |
| `mediaType` | String     | `image` or `video`                      |
| `caption`   | String     | ≤ 200                                   |
| `viewers`   | [ObjectId] | → users who have seen it                |
| `expiresAt` | Date       | createdAt + 24 h (indexed, auto-purged) |

**Reels** are stored in `posts` with `kind: 'reel'` and a `video` path, so likes and comments are reused.

**Relationships:** a user has many posts · a post has many comments · users follow users (many-to-many via `followers` / `following`) · users like posts (many-to-many via `likes`).

---

## 7. REST API Reference

All routes are prefixed with `/api`. 🔒 = requires header `Authorization: Bearer <token>`.

### Auth
| Method | Endpoint          | Body                                   | Description        |
| ------ | ----------------- | -------------------------------------- | ------------------ |
| POST   | `/auth/register`  | `name, username, email, password`      | Create account     |
| POST   | `/auth/login`     | `email, password`                      | Log in → `token`   |
| GET    | `/auth/me` 🔒     | —                                      | Current user       |
| PUT    | `/auth/keys` 🔒   | `publicKey, keyBackup`                 | One-time E2EE key setup for older accounts |

### Users
| Method | Endpoint                       | Description                                  |
| ------ | ------------------------------ | -------------------------------------------- |
| GET    | `/users/suggestions` 🔒        | Up to 5 people you don't follow yet          |
| GET    | `/users/search?q=` 🔒          | Search by name / username                    |
| PUT    | `/users/me` 🔒                 | Update `name`, `bio`, `avatar` (multipart)   |
| POST   | `/users/:id/follow` 🔒         | Follow / unfollow toggle                     |
| GET    | `/users/:username` 🔒          | Public profile + counts + `isFollowing`      |
| GET    | `/users/:username/followers` 🔒 | Followers list                              |
| GET    | `/users/:username/following` 🔒 | Following list                              |

### Posts
| Method | Endpoint                    | Description                                     |
| ------ | --------------------------- | ----------------------------------------------- |
| POST   | `/posts` 🔒                 | Create (multipart: `caption`, `image`)          |
| GET    | `/posts/feed?page=` 🔒      | Posts from you + people you follow              |
| GET    | `/posts/explore?page=` 🔒   | Latest posts from everyone                      |
| GET    | `/posts/user/:username` 🔒  | A user's posts                                  |
| GET    | `/posts/:id` 🔒             | Single post                                     |
| DELETE | `/posts/:id` 🔒             | Delete own post (+ its comments & image)        |
| POST   | `/posts/:id/like` 🔒        | Glow / un-glow toggle → `{ liked, likesCount }` |

### Comments
| Method | Endpoint                    | Body   | Description                              |
| ------ | --------------------------- | ------ | ---------------------------------------- |
| GET    | `/posts/:postId/comments` 🔒 | —      | List comments (oldest first)             |
| POST   | `/posts/:postId/comments` 🔒 | `text` | Add a comment                            |
| DELETE | `/comments/:id` 🔒          | —      | Delete (comment author or post owner)    |

### Stories
| Method | Endpoint                  | Description                                          |
| ------ | ------------------------- | ---------------------------------------------------- |
| POST   | `/stories` 🔒             | Create (multipart: `media` image/video, `caption`)   |
| GET    | `/stories/feed` 🔒        | Active stories from you + people you follow, grouped |
| POST   | `/stories/:id/view` 🔒    | Mark as viewed                                       |
| GET    | `/stories/:id/viewers` 🔒 | Viewers list (owner only)                            |
| DELETE | `/stories/:id` 🔒         | Delete own story                                     |

### Reels
| Method | Endpoint                    | Description                                              |
| ------ | --------------------------- | -------------------------------------------------------- |
| POST   | `/reels` 🔒                 | Create (multipart: `video`, `caption`)                   |
| GET    | `/reels?page=` 🔒           | Reels feed (adds `isFollowing` per author)               |
| GET    | `/reels/user/:username` 🔒  | A user's reels                                           |
| —      | `/posts/:id/like`, `/posts/:postId/comments`, `DELETE /posts/:id` | Reused for reels |

### Messages
| Method | Endpoint                                  | Description                                      |
| ------ | ----------------------------------------- | ------------------------------------------------ |
| GET    | `/messages/conversations` 🔒              | Inbox (with `unread` count per chat)             |
| POST   | `/messages/conversations` 🔒              | Body `{ userId }` → find or create a chat        |
| GET    | `/messages/conversations/:id/messages` 🔒 | Messages (`?before=` for older); marks as seen   |
| POST   | `/messages/conversations/:id/messages` 🔒 | Body `{ text, iv }` (ciphertext + nonce) → send  |
| POST   | `/messages/conversations/:id/seen` 🔒     | Mark the other person's messages as seen         |
| DELETE | `/messages/:id` 🔒                        | Unsend your own message                          |
| GET    | `/messages/unread-count` 🔒               | Total unread (nav badge)                         |

### Socket.io events (connect with `auth: { token }`)
| Direction       | Event             | Payload                         |
| --------------- | ----------------- | ------------------------------- |
| server → client | `message:new`     | `{ conversation, message }`     |
| server → client | `message:deleted` | `{ conversation, messageId }`   |
| server → client | `messages:seen`   | `{ conversation }`              |
| server → client | `presence`        | `{ userId, online }`            |
| client ↔ server | `typing`          | send `{ to, typing }` / receive `{ from, typing }` |
| client → server | `presence:list`   | ack callback with online user ids |

**Errors** are always JSON: `{ "message": "Human-readable reason" }` with a proper status (400 / 401 / 403 / 404 / 409 / 500).

---

## 8. Build Order (as delivered)

1. **Frontend first** — design system (`styles.css`), auth screens, layout, feed, explore, profile, post card, comments, modals.
2. **Backend second** — models → auth/JWT → users & follow → posts & likes → comments → uploads → error handling.
3. **Integration** — Vite dev proxy, `api.js` client, optimistic UI for glow/follow.

---

## 9. Manual Test Checklist

- [ ] Register two accounts (use two browsers / one incognito)
- [ ] Log in, refresh the page — session persists
- [ ] Create a post with a photo, and a text-only post
- [ ] Glow a post; un-glow; count updates; double-click also glows
- [ ] Comment on a post; delete your comment; post owner deletes someone else's comment
- [ ] Follow the other account — their posts appear in your Home feed
- [ ] Unfollow — their posts disappear from Home but remain in Explore
- [ ] Edit profile (name, bio, avatar)
- [ ] Open followers / following lists from a profile
- [ ] Search for a user in Explore
- [ ] Open two browsers, message each other: text appears instantly, typing dots show, "Seen" updates
- [ ] Unsend a message; check the unread badge on the Messages nav item
- [ ] Create a story (photo, then a video); view it from Home, check the viewer count from a second account
- [ ] Reply to someone's story; the reply shows up in Messages
- [ ] Create a reel; scroll the Reels feed, double-tap to glow, open comments, follow the author
- [ ] Open a profile's Reels tab and click a reel
- [ ] Register / log in: keys are created automatically; open a chat and tap the lock note to compare safety numbers
- [ ] In MongoDB, a message's `text` is unreadable base64 (the server cannot read it)
- [ ] On a phone-width screen: tap your avatar in the top bar → Log out; also try Profile → Log out
- [ ] Post a reel: it appears in the Home feed and in Explore
- [ ] Delete a post — it disappears and its image is removed from `server/uploads`
- [ ] Toggle dark mode; resize to mobile width and check the bottom navigation

---

## 10. Submission Notes (CodeAlpha)

- Created by **Rajesh Ranjan**. Push the project to a **public GitHub repo** named `CodeAlpha_Lumora` (never commit `.env` — already git-ignored).
- Record a short demo video (register → post → glow → comment → follow) and share it on LinkedIn, tagging **CodeAlpha**.
- Suggested hashtags: `#CodeAlpha #MERN #FullStack #Internship #Lumora`

## 11. Ideas to Extend

- Notification centre for glows, comments and new followers
- Push notifications for glows, comments and new followers via the existing Socket.io connection
- Cloud image storage (Cloudinary / S3) instead of local disk
- Hashtags, saved posts, direct messages
- Unit/API tests with Jest + Supertest

## Update — media, music, notifications (Oct 2026)
- **Storage:** photos/videos go to Cloudinary when `CLOUDINARY_*` is set (required on Render — its disk is wiped on restart). Without it files stay in `server/uploads`.
- **Music library:** Jamendo (royalty-free) via `GET /api/music`; attach a song to posts, stories and reels (`JAMENDO_CLIENT_ID`).
- **Multi-photo posts:** up to 10 photos per post, swipeable carousel.
- **Save & share:** bookmark (`POST /posts/:id/save`, `GET /posts/saved`, "Saved" tab on own profile); share sheet with link / WhatsApp / Telegram / email; `/post/:id` opens a single post.
- **Trim & background upload:** long videos can be trimmed (reel ≤ 1:30, story ≤ 0:45); the chosen window is played back. Uploads continue in a floating tray while you browse.
- **Chat media:** photos/videos are encrypted in the browser (AES-256-GCM, key inside the E2EE message) before upload (`POST /messages/media`).
- **Notifications:** like / comment / follow (`/notifications`), live over Socket.io (`notification:new`), bell badge + toast + page.
- **Speed:** in-memory client cache (Home, Explore, Reels, Profile, Messages) so switching pages doesn't reload.