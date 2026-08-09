import { Router } from 'express';
import authRoutes from './auth.js';
import userRoutes from './users.js';
import friendRoutes from './friends.js';
import messageRoutes from './messages.js';
import gameRoutes from './games.js';
import dictionaryRoutes from './dictionary.js';
import { attachUser, errorHandler } from './middleware.js';
import { describeConfig } from '../config.js';
import { dbUp } from '../db/connect.js';
import { onlineCount } from '../lib/presence.js';

const api = Router();

api.use(attachUser);

/** What this deployment can actually do — the client adapts its UI to this. */
api.get('/health', (_req, res) => {
  const config = describeConfig();
  res.json({
    ok: true,
    database: dbUp(),
    accounts: config.accounts && dbUp(),
    uploads: config.uploads,
    missingEnv: config.missing,
    online: onlineCount(),
  });
});

api.use('/auth', authRoutes);
api.use('/users', userRoutes);
api.use('/friends', friendRoutes);
api.use('/messages', messageRoutes);
api.use('/games', gameRoutes);
api.use('/dictionary', dictionaryRoutes);

api.use((_req, res) => res.status(404).json({ error: 'No such endpoint.' }));
api.use(errorHandler);

export default api;
