import InboundCallSession from '../model/InboundCallSession.js';

const RECENT_SESSION_WINDOW_MS = 10 * 60 * 1000;

export const findInboundSession = async ({
  callSid,
  phoneNumber,
  localNumber
} = {}) => {
  if (callSid) {
    const bySid = await InboundCallSession.findOne({ callSid });
    if (bySid) return bySid;
  }

  if (!phoneNumber || !localNumber) {
    return null;
  }

  return InboundCallSession.findOne({
    phoneNumber,
    localNumber,
    status: { $in: ['ringing', 'answered'] },
    createdAt: { $gte: new Date(Date.now() - RECENT_SESSION_WINDOW_MS) }
  }).sort({ createdAt: -1 });
};