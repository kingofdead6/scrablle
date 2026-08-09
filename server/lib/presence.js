// Who is connected right now, and where. In-memory on purpose: presence is
// per-process and worthless after a restart, so it never belongs in Mongo.
// (A multi-instance deployment would back this with the Socket.io Redis adapter.)

const online = new Map(); // userId -> { sockets: Set<socketId>, room: string|null, name, since }

export function markOnline(userId, socketId, name) {
  const id = String(userId);
  const entry = online.get(id) || { sockets: new Set(), room: null, name, since: Date.now() };
  entry.sockets.add(socketId);
  entry.name = name || entry.name;
  online.set(id, entry);
  return entry;
}

/** Returns true when that was the user's last connection. */
export function markOffline(userId, socketId) {
  const id = String(userId);
  const entry = online.get(id);
  if (!entry) return false;
  entry.sockets.delete(socketId);
  if (entry.sockets.size > 0) return false;
  online.delete(id);
  return true;
}

export function setRoom(userId, room) {
  const entry = online.get(String(userId));
  if (entry) entry.room = room;
}

export const isOnline = (userId) => online.has(String(userId));
export const roomOf = (userId) => online.get(String(userId))?.room || null;
export const socketsOf = (userId) => [...(online.get(String(userId))?.sockets || [])];

/** { online, room } for a batch of ids — what a friend list needs. */
export function presenceFor(userIds) {
  const map = new Map();
  for (const id of userIds) {
    const entry = online.get(String(id));
    map.set(String(id), { online: !!entry, room: entry?.room || null });
  }
  return map;
}

export const onlineCount = () => online.size;
