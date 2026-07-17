import mongoose from 'mongoose';

const internalMessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  body: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  readAt: {
    type: Date
  }
}, {
  timestamps: true
});

internalMessageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
internalMessageSchema.index({ recipient: 1, readAt: 1 });

export default mongoose.model('InternalMessage', internalMessageSchema);
