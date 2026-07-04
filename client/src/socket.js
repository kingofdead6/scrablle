import { io } from 'socket.io-client';

// Dev: client runs on :5173 (Vite), server on :3001 — reuse whatever hostname
// the browser used, so phones on the LAN connect to the right machine.
// Prod: the server serves the built client, so same-origin works.
const URL =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV ? `http://${window.location.hostname}:3001` : window.location.origin);

export const socket = io(URL, { transports: ['websocket', 'polling'] });
