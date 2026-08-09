import mongoose from 'mongoose';
import { pairKey } from './Friendship.js';

const { Schema } = mongoose;

/**
 * Friend-to-friend chat, outside any game room. `thread` is the sorted id pair
 * so one indexed lookup pulls a whole conversation in order.
 */
const directMessageSchema = new Schema(
  {
    thread: { type: String, required: true, index: true },
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    text: { type: String, required: true, maxlength: 1000 },
    readAt: { type: Date, default: null },
  },
  { timestamps: true }
);

directMessageSchema.index({ thread: 1, createdAt: -1 });
directMessageSchema.index({ to: 1, readAt: 1 });

directMessageSchema.pre('validate', function setThread(next) {
  this.thread = pairKey(this.from, this.to);
  next();
});

directMessageSchema.methods.toJson = function toJson() {
  return {
    id: String(this._id),
    from: String(this.from),
    to: String(this.to),
    text: this.text,
    readAt: this.readAt,
    createdAt: this.createdAt,
  };
};

export const DirectMessage =
  mongoose.models.DirectMessage || mongoose.model('DirectMessage', directMessageSchema);
