import mongoose from 'mongoose';

const partSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      trim: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    part: {
      type: String,
      required: true,
      trim: true,
    },
    make: {
      type: String,
      required: true,
      trim: true,
    },
    model: {
      type: String,
      required: true,
      trim: true,
    },
    year: {
      type: String,
      required: true,
      trim: true,
    },
    trim: {
      type: String,
      default: '',
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'USD',
      uppercase: true,
      trim: true,
    },
    availability: {
      type: String,
      enum: ['in stock', 'out of stock'],
      default: 'in stock',
      trim: true,
    },
    condition: {
      type: String,
      default: '',
      trim: true,
    },
    productType: {
      type: String,
      default: '',
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    imageUrls: {
      type: [String],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  { timestamps: true }
);

partSchema.index({ externalId: 1 }, { unique: true, sparse: true });
partSchema.index({ make: 1, model: 1, year: 1, part: 1, trim: 1 });
partSchema.index({ title: 'text', make: 'text', model: 'text', part: 'text', trim: 'text' });

export default mongoose.model('Part', partSchema);
