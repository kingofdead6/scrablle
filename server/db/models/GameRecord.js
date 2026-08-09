import mongoose from 'mongoose';

const { Schema } = mongoose;

const wordSchema = new Schema(
  { word: String, score: Number },
  { _id: false }
);

// One turn, exactly as the engine logged it (see recordTurn in game.js).
const turnSchema = new Schema(
  {
    n: Number,
    type: { type: String, enum: ['play', 'pass', 'swap', 'leave', 'final'] },
    playerName: String,
    words: [wordSchema],
    score: Number,
    total: Number,
    bingo: Boolean,
    count: Number,                 // swap only: how many tiles
    wentOut: String,               // final only
    adjustments: [                 // final only
      { _id: false, playerName: String, delta: Number, total: Number },
    ],
  },
  { _id: false }
);

const seatSchema = new Schema(
  {
    // Null for guests and bots — the name is still kept so history reads right.
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    name: String,
    score: { type: Number, default: 0 },
    isBot: { type: Boolean, default: false },
    difficulty: String,
    left: { type: Boolean, default: false },
    won: { type: Boolean, default: false },
  },
  { _id: false }
);

const gameRecordSchema = new Schema(
  {
    code: { type: String, index: true },
    seats: [seatSchema],
    // Denormalised so "my games" is one indexed query instead of a seat scan.
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    winners: [String],
    turns: [turnSchema],
    turnSeconds: Number,
    startedAt: Date,
    endedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

gameRecordSchema.index({ participants: 1, endedAt: -1 });

/** List view — everything the history page shows without the full turn log. */
gameRecordSchema.methods.summary = function summary(viewerId) {
  const me = viewerId
    ? this.seats.find((s) => s.user && String(s.user) === String(viewerId))
    : null;
  return {
    id: String(this._id),
    code: this.code,
    endedAt: this.endedAt,
    startedAt: this.startedAt,
    turnCount: this.turns.length,
    winners: this.winners,
    you: me ? { score: me.score, won: me.won } : null,
    seats: this.seats.map((s) => ({
      userId: s.user ? String(s.user) : null,
      name: s.name,
      score: s.score,
      isBot: s.isBot,
      difficulty: s.difficulty,
      left: s.left,
      won: s.won,
    })),
  };
};

export const GameRecord =
  mongoose.models.GameRecord || mongoose.model('GameRecord', gameRecordSchema);
