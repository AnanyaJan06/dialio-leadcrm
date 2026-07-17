import mongoose from 'mongoose';

const transcriptSegmentSchema = new mongoose.Schema({
  sequenceId: { type: Number, required: true },
  track: { type: String },
  text: { type: String, required: true },
  confidence: { type: Number },
  final: { type: Boolean, default: true },
  timestamp: { type: Date }
}, {
  _id: false
});

const callTranscriptSchema = new mongoose.Schema({
  callSid: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  transcriptionSid: {
    type: String,
    index: true
  },
  phoneNumber: {
    type: String,
    index: true
  },
  localNumber: {
    type: String,
    default: ''
  },
  callType: {
    type: String,
    enum: ['outbound', 'inbound']
  },
  status: {
    type: String,
    enum: ['started', 'in-progress', 'completed', 'failed'],
    default: 'started'
  },
  text: {
    type: String,
    default: ''
  },
  segments: {
    type: [transcriptSegmentSchema],
    default: []
  },
  error: {
    type: String
  },
  lastEventAt: {
    type: Date
  }
}, {
  timestamps: true
});

export default mongoose.model('CallTranscript', callTranscriptSchema);
