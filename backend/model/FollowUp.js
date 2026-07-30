import mongoose from 'mongoose';

const followUpSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    default: null
  },
  contact: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null
  },
  callLog: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CallLog',
    default: null
  },
  source: {
    type: String,
    enum: ['lead', 'voip', 'manual'],
    default: 'manual'
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  note: {
    type: String,
    required: true,
    trim: true
  },
  followUpDate: {
    type: Date,
    required: true
  },
  completed: {
    type: Boolean,
    default: false
  },
  completedAt: {
    type: Date
  }
}, {
  timestamps: true
});

followUpSchema.index({ user: 1, completed: 1, followUpDate: 1 });
followUpSchema.index({ lead: 1, completed: 1 });
followUpSchema.index({ callLog: 1 });

export default mongoose.model('FollowUp', followUpSchema);
