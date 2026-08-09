import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One document per pair, in both directions of intent:
 *   requester → recipient, status pending | accepted | declined | blocked
 * `pair` is the two ids sorted and joined, so a unique index on it stops the
 * same two people ending up with two rows no matter who asked first.
 */
const friendshipSchema = new Schema(
  {
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    pair: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'declined', 'blocked'],
      default: 'pending',
      index: true,
    },
    respondedAt: Date,
  },
  { timestamps: true }
);

export const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

friendshipSchema.pre('validate', function setPair(next) {
  this.pair = pairKey(this.requester, this.recipient);
  next();
});

export const Friendship =
  mongoose.models.Friendship || mongoose.model('Friendship', friendshipSchema);
