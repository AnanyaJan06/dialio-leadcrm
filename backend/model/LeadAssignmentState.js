import mongoose from 'mongoose';

const leadAssignmentStateSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'default',
    },
    currentIndex: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model('LeadAssignmentState', leadAssignmentStateSchema);
