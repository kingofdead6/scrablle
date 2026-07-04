import { io } from 'socket.io-client';

const URL = "https://scrablle.onrender.com"

export const socket = io(URL, { transports: ['websocket', 'polling'] });
