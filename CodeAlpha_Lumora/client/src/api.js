const BASE = import.meta.env.VITE_API_URL || '/api';
const ASSET_BASE = import.meta.env.VITE_ASSET_URL || '';

export const getToken = () => localStorage.getItem('lumora_token');
export const setToken = (t) =>
  t ? localStorage.setItem('lumora_token', t) : localStorage.removeItem('lumora_token');

export const assetUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  return ASSET_BASE + path;
};

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (form) {
    payload = form; // browser sets multipart boundary
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const err = new Error(data?.message || 'Something went wrong');
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Multipart upload with a progress callback (0..1), used for videos of any size. */
function upload(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE}${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* empty body */
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      const err = new Error(data?.message || 'Upload failed');
      err.status = xhr.status;
      reject(err);
    };
    xhr.onerror = () => reject(new Error('Network error while uploading. Please try again.'));
    xhr.send(form);
  });
}

export const api = {
  // auth
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  verifyEmail: (body) => request('/auth/verify-email', { method: 'POST', body }),
  resendOtp: (body) => request('/auth/resend-otp', { method: 'POST', body }),
  me: () => request('/auth/me'),
  setKeys: (body) => request('/auth/keys', { method: 'PUT', body }),

  // users
  profile: (username) => request(`/users/${username}`),
  updateProfile: (form) => request('/users/me', { method: 'PUT', form }),
  toggleFollow: (id) => request(`/users/${id}/follow`, { method: 'POST' }),
  suggestions: () => request('/users/suggestions'),
  searchUsers: (q) => request(`/users/search?q=${encodeURIComponent(q)}`),
  followers: (username) => request(`/users/${username}/followers`),
  following: (username) => request(`/users/${username}/following`),

  // posts
  feed: (page = 1) => request(`/posts/feed?page=${page}`),
  explore: (page = 1) => request(`/posts/explore?page=${page}`),
  userPosts: (username) => request(`/posts/user/${username}`),
  createPost: (form) => request('/posts', { method: 'POST', form }),
  deletePost: (id) => request(`/posts/${id}`, { method: 'DELETE' }),
  toggleLike: (id) => request(`/posts/${id}/like`, { method: 'POST' }),

  // messages
  conversations: () => request('/messages/conversations'),
  openConversation: (userId) =>
    request('/messages/conversations', { method: 'POST', body: { userId } }),
  messages: (id, before) =>
    request(`/messages/conversations/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`),
  // text = base64 ciphertext, iv = base64 nonce (see e2ee.js); the server never sees plaintext
  sendMessage: (id, text, iv) =>
    request(`/messages/conversations/${id}/messages`, { method: 'POST', body: { text, iv } }),
  markSeen: (id) => request(`/messages/conversations/${id}/seen`, { method: 'POST' }),
  deleteMessage: (id) => request(`/messages/${id}`, { method: 'DELETE' }),
  unreadCount: () => request('/messages/unread-count'),

  // stories
  createStory: (form, onProgress) => upload('/stories', form, onProgress),
  storyFeed: () => request('/stories/feed'),
  viewStory: (id) => request(`/stories/${id}/view`, { method: 'POST' }),
  storyViewers: (id) => request(`/stories/${id}/viewers`),
  deleteStory: (id) => request(`/stories/${id}`, { method: 'DELETE' }),

  // reels
  reels: (page = 1) => request(`/reels?page=${page}`),
  userReels: (username) => request(`/reels/user/${username}`),
  createReel: (form, onProgress) => upload('/reels', form, onProgress),
  post: (id) => request(`/posts/${id}`),

  // comments
  comments: (postId) => request(`/posts/${postId}/comments`),
  addComment: (postId, text) =>
    request(`/posts/${postId}/comments`, { method: 'POST', body: { text } }),
  deleteComment: (id) => request(`/comments/${id}`, { method: 'DELETE' }),
};