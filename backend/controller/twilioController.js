import twilio from 'twilio';
import dotenv from 'dotenv';
import CallLog from '../model/CallLog.js';
import CallTranscript from '../model/CallTranscript.js';
import InboundCallSession from '../model/InboundCallSession.js';
import TwilioNumber from '../model/TwilioNumber.js';
import { findInboundSession } from '../utils/inboundCallSession.js';
import {
  ensureVoiceIdentity,
  getAssignedNumberByIdentity,
  getAssignedNumberForUser,
  getPublicBaseUrl,
  getTwilioClient,
  normalizeClientIdentity
} from '../utils/twilioNumbers.js';

dotenv.config();

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const BROWSER_CLIENT_IDENTITY = process.env.TWILIO_CLIENT_IDENTITY || 'browser-client';
const MISSED_DIAL_STATUSES = new Set(['busy', 'canceled', 'failed', 'no-answer']);

const addTranscription = (twiml, labels = { inbound: 'caller', outbound: 'agent' }) => {
  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) {
    console.warn('BASE_URL is missing; call transcription webhook was not added.');
    return;
  }

  const start = twiml.start();
  start.transcription({
    statusCallbackUrl: `${baseUrl}/api/twilio/transcription`,
    track: 'both_tracks',
    inboundTrackLabel: labels.inbound,
    outboundTrackLabel: labels.outbound,
    transcriptionEngine: process.env.TWILIO_TRANSCRIPTION_ENGINE || 'google',
    enableAutomaticPunctuation: true,
    partialResults: false
  });
};

const parseJsonField = (value) => {
  if (!value) return {};

  try {
    return typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    return {};
  }
};

const rebuildTranscriptText = (segments) => [...segments]
  .sort((a, b) => (a.sequenceId || 0) - (b.sequenceId || 0))
  .map((segment) => segment.text)
  .filter(Boolean)
  .join('\n');

const syncTranscriptToCallLog = async (transcript) => {
  if (!transcript?.callSid) return;

  const transcriptUpdate = {
    transcriptionText: transcript.text,
    transcriptionStatus: transcript.status,
    transcriptionSid: transcript.transcriptionSid,
    transcriptionSegments: transcript.segments,
    transcriptionError: transcript.error || ''
  };

  if (transcript.localNumber) {
    transcriptUpdate.localNumber = transcript.localNumber;
  }

  const exactResult = await CallLog.updateMany(
    { callSid: transcript.callSid },
    transcriptUpdate
  );

  if (exactResult.modifiedCount > 0 || !transcript.phoneNumber || !transcript.callType) return;

  await CallLog.findOneAndUpdate(
    {
      phoneNumber: transcript.phoneNumber,
      callType: transcript.callType,
      status: { $nin: ['missed', 'answered-by-teammate', 'rejected', 'failed', 'busy', 'no-answer'] },
      startedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    },
    transcriptUpdate,
    { sort: { startedAt: -1 } }
  );
};

const buildWebhookUrl = (path, params = {}) => {
  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) return '';

  const url = new URL(path, baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};

const getLastCallerContext = async ({ from, to }) => {
  if (!from || !to) return null;

  const recentLogs = await CallLog.find({
    phoneNumber: from,
    localNumber: to,
    status: { $in: ['completed', 'answered-by-teammate'] }
  })
    .populate('user', 'name email')
    .populate('answeredBy', 'name email')
    .sort({ startedAt: -1, createdAt: -1 })
    .limit(10);

  const lastLog = recentLogs.find((log) => log.status === 'completed') || recentLogs[0];
  if (!lastLog) return null;

  const handler = lastLog.answeredBy || lastLog.user;
  const handledAt = lastLog.endedAt || lastLog.startedAt || lastLog.createdAt;

  return {
    lastHandledBy: handler?._id || handler || '',
    lastHandledByName: handler?.name || '',
    lastHandledByEmail: handler?.email || '',
    lastHandledAt: handledAt ? new Date(handledAt).toISOString() : '',
    lastCallType: lastLog.callType || '',
    lastCallStatus: lastLog.status || '',
    lastCallSid: lastLog.callSid || ''
  };
};

const sendEmptyVoiceResponse = (res) => {
  const twiml = new twilio.twiml.VoiceResponse();
  res.type('text/xml');
  res.send(twiml.toString());
};

// getToken
export const getToken = async (req, res) => {
  try {
    const identity = await ensureVoiceIdentity(req.user);

    const token = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY_SID,
      process.env.TWILIO_API_KEY_SECRET,
      { identity }
    );

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: process.env.TWIML_APP_SID,
      incomingAllow: true
    });

    token.addGrant(voiceGrant);

    res.json({
      token: token.toJwt(),
      identity
    });
  } catch (error) {
    console.error('Token Error:', error);
    res.status(500).json({ message: error.message });
  }
};

// ====================== MAKE OUTGOING CALL ======================
export const makeCall = async (req, res) => {
  try {
    const { to } = req.body;
    const userId = req.user?.id;
    const client = getTwilioClient();
    const from = await getAssignedNumberForUser(userId);

    if (!from) {
      return res.status(400).json({ message: 'No Twilio number is assigned to this user' });
    }

    const call = await client.calls.create({
      url: `${process.env.BASE_URL}/api/twilio/voice`,
      to: to,
      from,
    });

    res.json({ message: 'Call initiated', callSid: call.sid });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// voiceResponse (TwiML)
export const voiceResponse = async (req, res) => {
  try {
    console.log("Twilio webhook body:", req.body); // <-- Added log

    const to = req.body.To;
    const callSid = req.body.CallSid;
    const fromIdentity = normalizeClientIdentity(req.body.From || '');
    const callerId = await getAssignedNumberByIdentity(fromIdentity);

    if (!to) {
      console.log("No destination number received");
      return res.status(400).send("Missing destination number");
    }

    if (callSid) {
      CallTranscript.findOneAndUpdate(
        { callSid },
        { $set: { phoneNumber: to, localNumber: callerId, callType: 'outbound' } },
        { upsert: true, setDefaultsOnInsert: true }
      ).catch((error) => console.error('Failed to seed outbound transcript:', error));
    }

    const twiml = new twilio.twiml.VoiceResponse();
    addTranscription(twiml, { inbound: 'agent', outbound: 'customer' });

    const dial = twiml.dial({
      callerId: callerId || process.env.TWILIO_PHONE_NUMBER,
      answerOnBridge: true
    });

    dial.number(to);

    console.log("Calling number:", to);
    console.log("Generated TwiML:", twiml.toString());

    res.type("text/xml");
    res.send(twiml.toString());

  } catch (error) {
    console.error("Voice Response Error:", error);
    res.status(500).send("Internal Server Error");
  }
};

// Handle Incoming Calls
export const incomingVoice = async (req, res) => {
  try {
    const from = req.body.From || 'Unknown';
    const to = req.body.To || '';
    const callSid = req.body.CallSid;
    const assignedNumber = to
      ? await TwilioNumber.findOne({ phoneNumber: to }).populate('assignedUsers', 'twilioIdentity assignedPhoneNumber')
      : null;
    const assignedUsers = assignedNumber?.assignedUsers || [];
    const callerContext = await getLastCallerContext({ from, to });

    console.log(`📲 Incoming call from: ${from} | SID: ${callSid}`);

    const io = req.app.get('io');
    if (io) {
      io.emit('incoming-call', {
        from: from,
        to,
        assignedTo: assignedUsers.map((user) => user._id),
        callSid: callSid,
        timestamp: new Date().toISOString(),
        callerContext
      });
    }

    if (callSid) {
      CallTranscript.findOneAndUpdate(
        { callSid },
        { $set: { phoneNumber: from, localNumber: to, callType: 'inbound' } },
        { upsert: true, setDefaultsOnInsert: true }
      ).catch((error) => console.error('Failed to seed inbound transcript:', error));

      InboundCallSession.findOneAndUpdate(
        { callSid },
        {
          $setOnInsert: {
            callSid,
            phoneNumber: from,
            localNumber: to,
            assignedUserIds: assignedUsers.map((user) => user._id),
            status: 'ringing'
          }
        },
        { upsert: true, setDefaultsOnInsert: true }
      ).catch((error) => console.error('Failed to seed inbound call session:', error));
    }

    const twiml = new twilio.twiml.VoiceResponse();
    addTranscription(twiml, { inbound: 'customer', outbound: 'agent' });

    const dialOptions = {
      answerOnBridge: true,
      callerId: to || process.env.TWILIO_PHONE_NUMBER
    };

    const statusUrl = buildWebhookUrl('/api/twilio/incoming-status', {
      userIds: assignedUsers.map((user) => user._id).join(','),
      from,
      to
    });

    if (statusUrl) {
      dialOptions.action = statusUrl;
      dialOptions.method = 'POST';
    }

    const dial = twiml.dial(dialOptions);
    const addClientParameters = (client) => {
      client.parameter({ name: 'originalFrom', value: from });
      client.parameter({ name: 'originalTo', value: to });
      if (callSid) {
        client.parameter({ name: 'parentCallSid', value: callSid });
      }
      if (callerContext?.lastHandledByName) {
        client.parameter({ name: 'lastHandledByName', value: callerContext.lastHandledByName });
        client.parameter({ name: 'lastHandledBy', value: String(callerContext.lastHandledBy || '') });
        client.parameter({ name: 'lastHandledAt', value: callerContext.lastHandledAt || '' });
        client.parameter({ name: 'lastCallType', value: callerContext.lastCallType || '' });
        client.parameter({ name: 'lastCallStatus', value: callerContext.lastCallStatus || '' });
      }
    };

    if (assignedUsers.length > 0) {
      const seenIdentities = new Set();

      for (const assignedUser of assignedUsers) {
        const identity = await ensureVoiceIdentity(assignedUser);
        if (!identity || seenIdentities.has(identity)) continue;

        seenIdentities.add(identity);
        const client = dial.client(identity);
        addClientParameters(client);
      }

      if (seenIdentities.size === 0) {
        const client = dial.client(BROWSER_CLIENT_IDENTITY);
        addClientParameters(client);
        console.warn(`📲 No valid client identities for ${to}; using fallback client ${BROWSER_CLIENT_IDENTITY}`);
      } else {
        console.log(`📲 Ringing ${seenIdentities.size} client(s) for ${to}:`, [...seenIdentities]);
      }
    } else {
      const client = dial.client(BROWSER_CLIENT_IDENTITY);
      addClientParameters(client);
      console.log(`📲 No assignees found for ${to}; ringing fallback client ${BROWSER_CLIENT_IDENTITY}`);
    }

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    console.error("Incoming Voice Error:", error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Sorry, we are unable to connect the call right now.");
    res.type('text/xml');
    res.send(twiml.toString());
  }
};

export const incomingCallStatus = async (req, res) => {
  try {
    const dialStatus = String(req.body.DialCallStatus || '').toLowerCase();
    const userIds = String(req.query.userIds || req.body.userIds || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const legacyUserId = req.query.userId || req.body.userId;
    const targetUserIds = userIds.length > 0
      ? userIds
      : (legacyUserId ? [String(legacyUserId)] : []);

    const phoneNumber = req.query.from || req.body.From || 'Unknown';
    const localNumber = req.query.to || req.body.To || '';
    const parentCallSid = req.body.CallSid || '';
    const sessionCallSid = parentCallSid || req.body.DialCallSid || '';

    if (sessionCallSid) {
      const session = await findInboundSession({
        callSid: sessionCallSid,
        phoneNumber,
        localNumber
      });

      if (session?.status === 'answered' || session?.answeredBy) {
        return sendEmptyVoiceResponse(res);
      }

      if (MISSED_DIAL_STATUSES.has(dialStatus)) {
        await InboundCallSession.findOneAndUpdate(
          { callSid: session?.callSid || sessionCallSid, status: 'ringing' },
          { $set: { status: 'missed' } }
        );
      }
    }

    if (targetUserIds.length === 0 || !MISSED_DIAL_STATUSES.has(dialStatus)) {
      return sendEmptyVoiceResponse(res);
    }

    const missedCallSid = parentCallSid || req.body.DialCallSid || '';

    await Promise.all(targetUserIds.map((userId) => CallLog.findOneAndUpdate(
      {
        $or: [
          ...(missedCallSid ? [{ callSid: missedCallSid, user: userId }] : []),
          {
            user: userId,
            phoneNumber,
            localNumber,
            callType: 'inbound',
            startedAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) }
          }
        ]
      },
      {
        $setOnInsert: {
          user: userId,
          phoneNumber,
          localNumber,
          callType: 'inbound',
          duration: 0,
          status: 'missed',
          callSid: missedCallSid,
          startedAt: new Date(),
          endedAt: new Date()
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )));

    const io = req.app.get('io');
    if (io) {
      io.emit('refresh-call-history');
    }

    sendEmptyVoiceResponse(res);
  } catch (error) {
    console.error('Incoming Call Status Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const transcriptionStatus = async (req, res) => {
  try {
    console.log('Twilio transcription webhook body:', req.body);

    const {
      CallSid,
      TranscriptionSid,
      TranscriptionEvent,
      TranscriptionData,
      TranscriptionErrorCode,
      TranscriptionError,
      TranscriptionErrorMessage,
      SequenceId,
      Track,
      Timestamp,
      Final
    } = req.body;

    if (!CallSid) {
      return res.status(400).json({ message: 'CallSid is required' });
    }

    const eventAt = Timestamp ? new Date(Timestamp) : new Date();
    const update = {
      callSid: CallSid,
      transcriptionSid: TranscriptionSid,
      lastEventAt: Number.isNaN(eventAt.getTime()) ? new Date() : eventAt
    };

    let transcript = await CallTranscript.findOneAndUpdate(
      { callSid: CallSid },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    if (TranscriptionEvent === 'transcription-started') {
      transcript.status = 'started';
    }

    if (TranscriptionEvent === 'transcription-content') {
      const data = parseJsonField(TranscriptionData);
      const text = String(data.transcript || '').trim();
      const sequenceId = Number(SequenceId) || 0;
      const isFinal = String(Final).toLowerCase() !== 'false';

      transcript.status = 'in-progress';

      if (text && isFinal) {
        const nextSegment = {
          sequenceId,
          track: Track,
          text,
          confidence: Number.isFinite(Number(data.confidence)) ? Number(data.confidence) : undefined,
          final: isFinal,
          timestamp: Number.isNaN(eventAt.getTime()) ? new Date() : eventAt
        };

        const existingIndex = transcript.segments.findIndex((segment) => (
          segment.sequenceId === sequenceId && segment.track === Track
        ));

        if (existingIndex >= 0) {
          transcript.segments[existingIndex] = nextSegment;
        } else {
          transcript.segments.push(nextSegment);
        }

        transcript.text = rebuildTranscriptText(transcript.segments);
      }
    }

    if (TranscriptionEvent === 'transcription-stopped') {
      transcript.status = 'completed';
      transcript.text = rebuildTranscriptText(transcript.segments);
    }

    if (TranscriptionEvent === 'transcription-error') {
      transcript.status = 'failed';
      transcript.error = TranscriptionError || TranscriptionErrorMessage || TranscriptionErrorCode || 'Transcription failed';
    }

    transcript = await transcript.save();
    await syncTranscriptToCallLog(transcript);

    const io = req.app.get('io');
    if (io) {
      io.emit('call-transcription-updated', {
        callSid: transcript.callSid,
        status: transcript.status
      });
    }

    res.sendStatus(204);
  } catch (error) {
    console.error('Transcription Webhook Error:', error);
    res.status(500).json({ message: error.message });
  }
};
