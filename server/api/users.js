import { Router } from 'express';
import multer from 'multer';
import mongoose from 'mongoose';
import { User } from '../db/models/User.js';
import { Friendship } from '../db/models/Friendship.js';
import { checkName, checkBio, classifySearch, escapeRegex } from '../lib/validate.js';
import { uploadAvatar, deleteAvatar, MAX_AVATAR_BYTES, ALLOWED_AVATAR_TYPES } from '../lib/cloudinary.js';
import { uploadsEnabled } from '../config.js';
import { requireAccounts, requireUser, requireFullAccount, route, rateLimit } from './middleware.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_AVATAR_TYPES.has(file.mimetype))
      return cb(Object.assign(new Error('Use a PNG, JPEG, WebP or GIF image.'), { status: 400 }));
    cb(null, true);
  },
});

/** How the viewer is related to each person in a list. */
async function relationsFor(viewerId, userIds) {
  if (!viewerId || userIds.length === 0) return new Map();
  const links = await Friendship.find({
    $or: [
      { requester: viewerId, recipient: { $in: userIds } },
      { recipient: viewerId, requester: { $in: userIds } },
    ],
  });

  const map = new Map();
  for (const link of links) {
    const otherId = String(link.requester) === String(viewerId) ? link.recipient : link.requester;
    map.set(String(otherId), {
      status: link.status,
      // Only the recipient of a pending request can accept it.
      direction: String(link.requester) === String(viewerId) ? 'outgoing' : 'incoming',
    });
  }
  return map;
}

/**
 * Find people by name, tag, email or raw id. Exact identifiers win outright;
 * a plain name does a prefix-then-substring match.
 */
router.get(
  '/search',
  requireAccounts,
  requireUser,
  rateLimit({ key: 'search', max: 90 }),
  route(async (req, res) => {
    const { kind, q } = classifySearch(req.query.q);
    if (kind === 'empty') return res.json({ query: '', results: [] });

    const limit = Math.min(Number(req.query.limit) || 20, 40);
    let users = [];

    if (kind === 'id') {
      if (mongoose.isValidObjectId(q)) {
        const hit = await User.findById(q);
        if (hit) users = [hit];
      }
    } else if (kind === 'tag') {
      const hit = await User.findOne({ tag: q });
      if (hit) users = [hit];
    } else if (kind === 'email') {
      // Exact only. Substring email search would be a directory of addresses.
      const hit = await User.findOne({ email: q });
      if (hit) users = [hit];
    } else {
      const safe = escapeRegex(q);
      users = await User.find({ name: new RegExp(safe, 'i'), isGuest: false })
        .collation({ locale: 'en', strength: 2 })
        .limit(limit);
      // Names that start with the query are the likelier match.
      const startsWith = new RegExp(`^${safe}`, 'i');
      users.sort((a, b) => Number(startsWith.test(b.name)) - Number(startsWith.test(a.name)));
    }

    const mine = String(req.user._id);
    users = users.filter((u) => String(u._id) !== mine);
    const relations = await relationsFor(mine, users.map((u) => u._id));

    res.json({
      query: q,
      matchedOn: kind,
      results: users.map((u) => ({
        ...u.publicProfile(),
        relation: relations.get(String(u._id)) || null,
      })),
    });
  })
);

/** Public profile of anyone, by id or tag. */
router.get(
  '/:idOrTag',
  requireAccounts,
  requireUser,
  route(async (req, res) => {
    const key = String(req.params.idOrTag);
    const user = mongoose.isValidObjectId(key)
      ? await User.findById(key)
      : await User.findOne({ tag: key.toUpperCase() });
    if (!user) return res.status(404).json({ error: 'No such player.' });

    const relations = await relationsFor(String(req.user._id), [user._id]);
    const isMe = String(user._id) === String(req.user._id);
    res.json({
      user: isMe ? user.privateProfile() : user.publicProfile(),
      relation: relations.get(String(user._id)) || null,
    });
  })
);

/** Edit your own name and bio. */
router.patch(
  '/me/profile',
  requireAccounts,
  requireFullAccount,
  rateLimit({ key: 'profile', max: 30 }),
  route(async (req, res) => {
    if (req.body?.name !== undefined) {
      const name = checkName(req.body.name);
      if (!name.ok) return res.status(400).json({ error: name.error });
      if (
        name.value.toLowerCase() !== req.user.name.toLowerCase() &&
        (await User.exists({ name: name.value }).collation({ locale: 'en', strength: 2 }))
      )
        return res.status(409).json({ error: 'That name is taken.' });
      req.user.name = name.value;
    }

    if (req.body?.bio !== undefined) {
      const bio = checkBio(req.body.bio);
      if (!bio.ok) return res.status(400).json({ error: bio.error });
      req.user.bio = bio.value;
    }

    await req.user.save();
    res.json({ user: req.user.privateProfile() });
  })
);

/** Profile picture. Cloudinary does the cropping; we keep only the URL. */
router.post(
  '/me/avatar',
  requireAccounts,
  requireFullAccount,
  rateLimit({ key: 'avatar', max: 12 }),
  upload.single('avatar'),
  route(async (req, res) => {
    if (!uploadsEnabled())
      return res.status(503).json({
        error: 'Image uploads are not configured on this server.',
        detail: 'Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
      });
    if (!req.file) return res.status(400).json({ error: 'Attach an image called "avatar".' });

    const previous = req.user.avatarPublicId;
    const { url, publicId } = await uploadAvatar(req.file.buffer, { userId: req.user._id });

    req.user.avatarUrl = url;
    req.user.avatarPublicId = publicId;
    await req.user.save();
    if (previous && previous !== publicId) deleteAvatar(previous);

    res.json({ user: req.user.privateProfile() });
  })
);

router.delete(
  '/me/avatar',
  requireAccounts,
  requireFullAccount,
  route(async (req, res) => {
    const previous = req.user.avatarPublicId;
    req.user.avatarUrl = '';
    req.user.avatarPublicId = '';
    await req.user.save();
    if (previous) deleteAvatar(previous);
    res.json({ user: req.user.privateProfile() });
  })
);

export default router;
