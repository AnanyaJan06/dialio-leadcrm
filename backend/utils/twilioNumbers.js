import twilio from 'twilio';
import User from '../model/User.js';
import TwilioNumber from '../model/TwilioNumber.js';

export const getTwilioClient = () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio credentials are not configured');
  }

  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
};

export const getPublicBaseUrl = () => (process.env.BASE_URL || '').replace(/\/$/, '');

export const toVoiceIdentity = (user) => {
  const id = user?._id || user?.id;
  if (!id) return '';
  return user.twilioIdentity || `user_${id.toString()}`;
};

export const ensureVoiceIdentity = async (user) => {
  const identity = toVoiceIdentity(user);

  if (user && !user.twilioIdentity) {
    user.twilioIdentity = identity;
    await user.save();
  }

  return identity;
};

export const normalizeClientIdentity = (value = '') => String(value).replace(/^client:/i, '');

export const normalizePhoneNumber = (value = '') => String(value).trim();

export const userIsAssignedToNumber = (number, userId) => {
  if (!number || !userId) return false;

  return (number.assignedUsers || []).some((assignedUser) => {
    const assignedId = assignedUser?._id || assignedUser?.id || assignedUser;
    return String(assignedId) === String(userId);
  });
};

export const getAssignedNumbersForUser = async (userId) => {
  if (!userId) return [];

  const numbers = await TwilioNumber.find({ assignedUsers: userId }).sort({ phoneNumber: 1 });
  return numbers.map((number) => number.phoneNumber).filter(Boolean);
};

export const getAssignedNumberForUser = async (userId) => {
  if (!userId) return process.env.TWILIO_PHONE_NUMBER || '';

  const user = await User.findById(userId).select('assignedPhoneNumber assignedPhoneNumberSid');

  if (user?.assignedPhoneNumberSid) {
    const defaultBySid = await TwilioNumber.findOne({
      sid: user.assignedPhoneNumberSid,
      assignedUsers: userId
    });
    if (defaultBySid?.phoneNumber) return defaultBySid.phoneNumber;
  }

  if (user?.assignedPhoneNumber) {
    const defaultByNumber = await TwilioNumber.findOne({
      phoneNumber: user.assignedPhoneNumber,
      assignedUsers: userId
    });
    if (defaultByNumber?.phoneNumber) return defaultByNumber.phoneNumber;
  }

  const assigned = await TwilioNumber.findOne({ assignedUsers: userId }).sort({ phoneNumber: 1 });
  if (assigned?.phoneNumber) {
    if (user) {
      user.assignedPhoneNumber = assigned.phoneNumber;
      user.assignedPhoneNumberSid = assigned.sid;
      await user.save();
    }

    return assigned.phoneNumber;
  }

  return user?.assignedPhoneNumber || process.env.TWILIO_PHONE_NUMBER || '';
};

export const getAssignedNumberByIdentity = async (identity) => {
  if (!identity) return process.env.TWILIO_PHONE_NUMBER || '';

  const user = await User.findOne({ twilioIdentity: normalizeClientIdentity(identity) });
  if (!user) return process.env.TWILIO_PHONE_NUMBER || '';

  return getAssignedNumberForUser(user._id);
};

export const upsertTwilioNumber = async (number) => TwilioNumber.findOneAndUpdate(
  { sid: number.sid },
  {
    sid: number.sid,
    phoneNumber: number.phoneNumber,
    friendlyName: number.friendlyName || '',
    isoCountry: number.isoCountry || 'US',
    capabilities: {
      voice: Boolean(number.capabilities?.voice),
      sms: Boolean(number.capabilities?.sms),
      mms: Boolean(number.capabilities?.mms)
    }
  },
  { new: true, upsert: true, setDefaultsOnInsert: true }
);