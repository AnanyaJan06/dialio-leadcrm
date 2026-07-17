import mongoose from 'mongoose';

const inboundCallSessionSchema = new mongoose.Schema({
  callSid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  phoneNumber: {
    type: String,
    required: true
  },
  localNumber: {
    type: String,
    default: ''
  },
  assignedUserIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['ringing', 'answered', 'missed', 'rejected'],
    default: 'ringing'
  },
  answeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  answeredAt: {
    type: Date
  }
}, {
  timestamps: true
});

export default mongoose.model('InboundCallSession', inboundCallSessionSchema);