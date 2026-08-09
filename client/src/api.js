// Thin wrapper over the account API. Everything returns parsed JSON and throws
// an Error carrying the server's message, so callers can just try/catch.

const BASE = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
const url = (path) => `${BASE}/api${path}`;

const TOKEN_KEY = 'scrabble-live-token';

export const readToken = () => {
  try { return localStorage.getItem(TOKEN_KEY) || null; } catch { return null; }
};
export const writeToken = (token) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode — the session just won't survive a reload */ }
};

class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function request(method, path, { body, form, signal } = {}) {
  const headers = {};
  const token = readToken();
  if (token) headers.authorization = `Bearer ${token}`;
  if (body) headers['content-type'] = 'application/json';

  let res;
  try {
    res = await fetch(url(path), {
      method,
      headers,
      body: form ?? (body ? JSON.stringify(body) : undefined),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Could not reach the server.', 0);
  }

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not JSON */ }

  if (!res.ok)
    throw new ApiError(data?.error || `Request failed (${res.status}).`, res.status, data?.detail);
  return data;
}

export const api = {
  get: (path, opts) => request('GET', path, opts),
  post: (path, body, opts) => request('POST', path, { ...opts, body }),
  patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
  del: (path, opts) => request('DELETE', path, opts),
  upload: (path, formData) => request('POST', path, { form: formData }),
};

export { ApiError };

// ── Endpoints, named so pages read like prose ────────────────────────────────
export const health = () => api.get('/health');

export const auth = {
  register: (payload) => api.post('/auth/register', payload),
  login: (payload) => api.post('/auth/login', payload),
  guest: (name) => api.post('/auth/guest', { name }),
  claim: (payload) => api.post('/auth/claim', payload),
  me: () => api.get('/auth/me'),
};

export const users = {
  search: (q, signal) => api.get(`/users/search?q=${encodeURIComponent(q)}`, { signal }),
  profile: (idOrTag) => api.get(`/users/${encodeURIComponent(idOrTag)}`),
  edit: (payload) => api.patch('/users/me/profile', payload),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.upload('/users/me/avatar', form);
  },
  removeAvatar: () => api.del('/users/me/avatar'),
};

export const friends = {
  list: () => api.get('/friends'),
  requests: () => api.get('/friends/requests'),
  add: (to) => api.post('/friends/requests', { to }),
  accept: (id) => api.post(`/friends/requests/${id}/accept`),
  decline: (id) => api.post(`/friends/requests/${id}/decline`),
  remove: (userId) => api.del(`/friends/${userId}`),
  block: (userId) => api.post(`/friends/${userId}/block`),
  unblock: (userId) => api.del(`/friends/${userId}/block`),
};

export const messages = {
  threads: () => api.get('/messages'),
  with: (userId) => api.get(`/messages/${userId}`),
  send: (userId, text) => api.post(`/messages/${userId}`, { text }),
  unread: () => api.get('/messages/unread/count'),
};

export const games = {
  list: (params = '') => api.get(`/games${params}`),
  one: (id) => api.get(`/games/${id}`),
  opponents: () => api.get('/games/opponents/list'),
};

export const dictionary = {
  lookup: (q, signal) => api.get(`/dictionary/lookup?q=${encodeURIComponent(q)}`, { signal }),
  startsWith: (q, signal) => api.get(`/dictionary/starts-with?q=${encodeURIComponent(q)}`, { signal }),
  fromLetters: (q, signal) => api.get(`/dictionary/from-letters?q=${encodeURIComponent(q)}`, { signal }),
};
