import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  role: { 
    type: String, 
    enum: ['admin', 'agent'], 
    default: 'agent' 
  },
  twilioIdentity: {
    type: String,
    unique: true,
    sparse: true
  },
  assignedPhoneNumber: {
    type: String,
    default: ''
  },
  assignedPhoneNumberSid: {
    type: String,
    default: ''
  },
  lastLoginIp: {
    type: String,
    default: ''
  },
  lastLoginAt: {
    type: Date
  },
  lastLogoutIp: {
    type: String,
    default: ''
  },
  lastLogoutAt: {
    type: Date
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

const User = mongoose.model('User', userSchema);

export default User;
