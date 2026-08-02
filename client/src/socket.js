import { io } from 'socket.io-client';

// Defaults to the deployed server; set VITE_SERVER_URL to point at a local one.
const URL = import.meta.env.VITE_SERVER_URL || 'https://scrablle.onrender.com';

export const socket = io(URL, { transports: ['websocket', 'polling'] });
