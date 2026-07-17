import mongoose from 'mongoose';

const callLogSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  answeredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  contact: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Contact' 
  },
  phoneNumber: { 
    type: String, 
    required: true 
  },
  localNumber: {
    type: String,
    default: ''
  },
  callType: { 
    type: String, 
    enum: ['outbound', 'inbound', 'missed'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['completed', 'missed', 'answered-by-teammate', 'rejected', 'failed', 'busy', 'no-answer'], 
    default: 'completed' 
  },
  duration: { 
    type: Number, 
    default: 0  
  },
  recordingUrl: { type: String },
  transcriptionText: { type: String, default: '' },
  transcriptionStatus: {
    type: String,
    enum: ['not-started', 'started', 'in-progress', 'completed', 'failed'],
    default: 'not-started'
  },
  transcriptionSid: { type: String },
  transcriptionSegments: {
    type: [{
      sequenceId: Number,
      track: String,
      text: String,
      confidence: Number,
      final: Boolean,
      timestamp: Date
    }],
    default: []
  },
  transcriptionError: { type: String },
  callSid: { type: String },           // Important for Twilio
  startedAt: { 
    type: Date, 
    default: Date.now 
  },
  endedAt: { type: Date }
}, {
  timestamps: true   // Automatically adds createdAt & updatedAt
});

export default mongoose.model('CallLog', callLogSchema);
