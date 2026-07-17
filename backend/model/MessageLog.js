import mongoose from 'mongoose';

const messageLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  phoneNumber: {
    type: String,
    required: true
  },
  from: {
    type: String,
    required: true
  },
  to: {
    type: String,
    required: true
  },
  body: {
    type: String,
    default: ''
  },
  mediaUrls: {
    type: [String],
    default: []
  },
  direction: {
    type: String,
    enum: ['outbound', 'inbound'],
    required: true
  },
  status: {
    type: String,
    default: 'queued'
  },
  errorCode: {
    type: String
  },
  errorMessage: {
    type: String
  },
  deliveredAt: {
    type: Date
  },
  messageSid: {
    type: String,
    index: true
  }
}, {
  timestamps: true
});

export default mongoose.model('MessageLog', messageLogSchema);
