import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Lead from '../model/Lead.js';
import MessageLog from '../model/MessageLog.js';
import CallLog from '../model/CallLog.js';
import FollowUp from '../model/FollowUp.js';
import { toStandardE164 } from '../utils/phoneMatch.js';

dotenv.config();

const runMigration = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/crm-voip';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    // 1. Normalize Leads
    const leads = await Lead.find({});
    let updatedLeads = 0;
    for (const lead of leads) {
      const normalized = toStandardE164(lead.phone);
      if (normalized && normalized !== lead.phone) {
        lead.phone = normalized;
        await lead.save();
        updatedLeads++;
      }
    }
    console.log(`Leads normalized: ${updatedLeads} / ${leads.length}`);

    // 2. Normalize MessageLogs
    const messages = await MessageLog.find({});
    let updatedMessages = 0;
    for (const msg of messages) {
      let changed = false;
      const normalizedPhone = toStandardE164(msg.phoneNumber);
      const normalizedFrom = toStandardE164(msg.from);
      const normalizedTo = toStandardE164(msg.to);

      if (normalizedPhone && normalizedPhone !== msg.phoneNumber) {
        msg.phoneNumber = normalizedPhone;
        changed = true;
      }
      if (normalizedFrom && normalizedFrom !== msg.from) {
        msg.from = normalizedFrom;
        changed = true;
      }
      if (normalizedTo && normalizedTo !== msg.to) {
        msg.to = normalizedTo;
        changed = true;
      }

      if (changed) {
        await msg.save();
        updatedMessages++;
      }
    }
    console.log(`Message logs normalized: ${updatedMessages} / ${messages.length}`);

    // 3. Normalize CallLogs
    const calls = await CallLog.find({});
    let updatedCalls = 0;
    for (const call of calls) {
      const normalized = toStandardE164(call.phoneNumber);
      if (normalized && normalized !== call.phoneNumber) {
        call.phoneNumber = normalized;
        await call.save();
        updatedCalls++;
      }
    }
    console.log(`Call logs normalized: ${updatedCalls} / ${calls.length}`);

    // 4. Normalize FollowUps
    const followUps = await FollowUp.find({});
    let updatedFollowUps = 0;
    for (const item of followUps) {
      const normalized = toStandardE164(item.phone);
      if (normalized && normalized !== item.phone) {
        item.phone = normalized;
        await item.save();
        updatedFollowUps++;
      }
    }
    console.log(`Follow-ups normalized: ${updatedFollowUps} / ${followUps.length}`);

    console.log('Phone number normalization migration complete!');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
};

runMigration();
