import mongoose from 'mongoose';

const twilioNumberSchema = new mongoose.Schema({
  sid: {
    type: String,
    required: true,
    unique: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  friendlyName: {
    type: String,
    default: ''
  },
  isoCountry: {
    type: String,
    default: 'US'
  },
  capabilities: {
    voice: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    mms: { type: Boolean, default: false }
  },
  assignedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  }]
}, {
  timestamps: true
});

export default mongoose.model('TwilioNumber', twilioNumberSchema);