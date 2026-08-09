import mongoose from 'mongoose';

const { Schema } = mongoose;

// Running totals, updated once per finished game (see lib/stats.js).
const statsSchema = new Schema(
  {
    games: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    ties: { type: Number, default: 0 },
    totalScore: { type: Number, default: 0 },
    bestScore: { type: Number, default: 0 },      // best final score in one game
    bingos: { type: Number, default: 0 },
    tilesPlayed: { type: Number, default: 0 },
    wordsPlayed: { type: Number, default: 0 },
    bestWord: {
      word: { type: String, default: '' },
      score: { type: Number, default: 0 },
      at: Date,
    },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    // Public handle. Unique case-insensitively — see the collation index below.
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 16 },
    // Short shareable id friends can search by, e.g. "SCR-7QK4".
    tag: { type: String, required: true, unique: true, uppercase: true, index: true },

    email: { type: String, lowercase: true, trim: true, sparse: true, unique: true },
    passwordHash: { type: String, select: false },

    isGuest: { type: Boolean, default: false },
    avatarUrl: { type: String, default: '' },
    avatarPublicId: { type: String, default: '' }, // kept so we can delete the old one
    bio: { type: String, default: '', maxlength: 160 },

    stats: { type: statsSchema, default: () => ({}) },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Case-insensitive uniqueness on the handle, so "Youcef" and "youcef" collide.
userSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
// Backs the friend search box.
userSchema.index({ name: 'text', tag: 'text' });

userSchema.methods.publicProfile = function publicProfile() {
  return {
    id: String(this._id),
    name: this.name,
    tag: this.tag,
    avatarUrl: this.avatarUrl,
    bio: this.bio,
    isGuest: this.isGuest,
    stats: summariseStats(this.stats),
    joinedAt: this.createdAt,
    lastSeenAt: this.lastSeenAt,
  };
};

/** The private view — same as public plus the email, which nobody else sees. */
userSchema.methods.privateProfile = function privateProfile() {
  return { ...this.publicProfile(), email: this.email || null };
};

/** Adds the derived numbers people actually want to read. */
export function summariseStats(stats = {}) {
  const games = stats.games || 0;
  return {
    games,
    wins: stats.wins || 0,
    losses: stats.losses || 0,
    ties: stats.ties || 0,
    winRate: games > 0 ? Math.round(((stats.wins || 0) / games) * 100) : 0,
    totalScore: stats.totalScore || 0,
    averageScore: games > 0 ? Math.round((stats.totalScore || 0) / games) : 0,
    bestScore: stats.bestScore || 0,
    bingos: stats.bingos || 0,
    tilesPlayed: stats.tilesPlayed || 0,
    wordsPlayed: stats.wordsPlayed || 0,
    bestWord: stats.bestWord?.word
      ? { word: stats.bestWord.word, score: stats.bestWord.score, at: stats.bestWord.at }
      : null,
  };
}

export const User = mongoose.models.User || mongoose.model('User', userSchema);
