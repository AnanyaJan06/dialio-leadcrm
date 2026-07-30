import mongoose from 'mongoose';

const leadSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    zip: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    partRequested: {
      type: String,
      required: false,
      trim: true,
    },
    make: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    model: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    year: {
      type: String,
      required: false,
      trim: true,
    },
    yearMakeModel: {
      type: String,
      required: false,
      trim: true,
      default: '',
    },
    disposition: {
      type: String,
      enum: [
        'Quoted',
        'No Response',
        'Wrong Number',
        'Not Interested',
        'Price too high',
        'Part not available',
        'Ordered',
        'Already ordered',
      ],
      default: 'Quoted',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    source: {
      type: String,
      enum: ['manual', 'website', 'facebook', 'other'],
      default: 'manual',
    },
    followUpAt: {
      type: Date,
      default: null,
    },
    followUp: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FollowUp',
      default: null,
    },
    followUpNote: {
      type: String,
      trim: true,
      default: '',
    },
    followUpSetBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    followUpRemindedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

export default mongoose.model('Lead', leadSchema);
