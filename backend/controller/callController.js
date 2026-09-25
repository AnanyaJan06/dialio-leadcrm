import CallLog from '../model/CallLog.js';
import CallTranscript from '../model/CallTranscript.js';
import Contact from '../model/Contact.js';
import InboundCallSession from '../model/InboundCallSession.js';
import Lead from '../model/Lead.js';
import User from '../model/User.js';
import { buildCallAccessQuery } from '../utils/callAccess.js';
import { consolidateAdminCallLogs } from '../utils/consolidateCallLogs.js';
import { findInboundSession } from '../utils/inboundCallSession.js';
import { buildPaginatedResponse, parseBeforeDate, parseLimit } from '../utils/pagination.js';
import { buildPhoneOrFilter, buildPhonePatterns, to10Digits } from '../utils/phoneMatch.js';
import { getAssignedNumberForUser } from '../utils/twilioNumbers.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const createTeammateCallLogs = async (session, answererId) => {
  const otherUserIds = (session.assignedUserIds || [])
    .map((userId) => String(userId))
    .filter((userId) => userId && userId !== String(answererId));

  if (otherUserIds.length === 0) return;

  const now = new Date();
  await Promise.all(otherUserIds.map((userId) => CallLog.findOneAndUpdate(
    { callSid: session.callSid, user: userId },
    {
      $setOnInsert: {
        user: userId,
        phoneNumber: session.phoneNumber,
        localNumber: session.localNumber,
        callType: 'inbound',
        duration: 0,
        status: 'answered-by-teammate',
        answeredBy: answererId,
        callSid: session.callSid,
        startedAt: now,
        endedAt: now
      }
    },
    { upsert: true, setDefaultsOnInsert: true }
  )));
};

const resolveContactsForLogs = async (logs = []) => {
  const phones = [...new Set(logs.map((log) => log.phoneNumber).filter(Boolean))];
  if (phones.length === 0) return new Map();

  const phonePatterns = [...new Set(phones.flatMap((p) => buildPhonePatterns(p)))];

  const [contacts, leads] = await Promise.all([
    Contact.find({ phone: { $in: phonePatterns } }).select('_id name phone company').lean(),
    Lead.find({ phone: { $in: phonePatterns } }).select('_id name phone').lean()
  ]);

  const map = new Map();

  // Populate from leads first
  for (const lead of leads) {
    if (!lead.phone) continue;
    const info = { name: lead.name, company: '', leadId: lead._id };
    const p10 = to10Digits(lead.phone);
    if (p10) map.set(p10, info);
    map.set(lead.phone, info);
    for (const pat of buildPhonePatterns(lead.phone)) {
      if (!map.has(pat)) map.set(pat, info);
    }
  }

  // Populate from contacts second (higher priority than leads)
  for (const contact of contacts) {
    if (!contact.phone) continue;
    const info = { name: contact.name, company: contact.company || '', contactId: contact._id };
    const p10 = to10Digits(contact.phone);
    if (p10) map.set(p10, info);
    map.set(contact.phone, info);
    for (const pat of buildPhonePatterns(contact.phone)) {
      map.set(pat, info);
    }
  }

  return map;
};

const formatCallLog = (log, contactMap = new Map()) => {
  const item = log.toObject ? log.toObject() : log;
  const directContact = item.contact && typeof item.contact === 'object' ? item.contact : null;
  const digits10 = to10Digits(item.phoneNumber);
  const matchedContact = directContact || contactMap.get(digits10) || contactMap.get(item.phoneNumber);

  return {
    ...item,
    userName: item.user?.name || 'Unknown User',
    userEmail: item.user?.email || '',
    answeredByName: item.answeredBy?.name || '',
    contactName: matchedContact?.name || item.contactName || '',
    contactCompany: matchedContact?.company || item.contactCompany || ''
  };
};

export const saveCallLog = async (req, res) => {
  try {
    const { phoneNumber, callType, duration = 0, status, callSid, localNumber, answeredBy } = req.body;
    const resolvedCallType = callType || 'outbound';
    const startedAt = new Date();
    const transcriptQuery = {
      $or: [
        ...(callSid ? [{ callSid }] : []),
        {
          phoneNumber,
          callType: resolvedCallType,
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      ]
    };
    const transcript = await CallTranscript.findOne(transcriptQuery).sort({ updatedAt: -1 });
    const resolvedLocalNumber = String(localNumber || transcript?.localNumber || '').trim()
      || (resolvedCallType === 'outbound' ? await getAssignedNumberForUser(req.user.id) : '');

    let resolvedAnsweredBy = answeredBy || undefined;
    if (status === 'answered-by-teammate' && !resolvedAnsweredBy) {
      const session = await findInboundSession({ callSid, phoneNumber, localNumber: resolvedLocalNumber });
      resolvedAnsweredBy = session?.answeredBy || undefined;
    }

    const phonePatterns = buildPhonePatterns(phoneNumber);
    const existingContact = await Contact.findOne({
      phone: { $in: phonePatterns }
    }).select('_id');

    const callLogData = {
      user: req.user.id,
      contact: existingContact?._id || undefined,
      phoneNumber,
      localNumber: resolvedLocalNumber,
      callType: resolvedCallType,
      duration: Number(duration) || 0,
      status: status || 'completed',
      callSid,
      answeredBy: resolvedAnsweredBy,
      transcriptionText: transcript?.text || '',
      transcriptionStatus: transcript?.status || 'not-started',
      transcriptionSid: transcript?.transcriptionSid || '',
      transcriptionSegments: transcript?.segments || [],
      transcriptionError: transcript?.error || '',
      startedAt,
      endedAt: startedAt
    };

    const duplicateQuery = callSid
      ? { callSid, user: req.user.id }
      : {
          user: req.user.id,
          phoneNumber,
          localNumber: resolvedLocalNumber,
          callType: resolvedCallType,
          status: status || 'completed',
          startedAt: { $gte: new Date(Date.now() - 2 * 60 * 1000) }
        };

    const callLog = callSid || resolvedCallType === 'inbound'
      ? await CallLog.findOneAndUpdate(
          duplicateQuery,
          { $set: callLogData },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        )
      : await CallLog.create(callLogData);

    console.log('Call Log', callLog);

    res.status(201).json({ message: 'Call logged successfully', callLog });
  } catch (error) {
    console.error('Save Call Log Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const markCallAnswered = async (req, res) => {
  try {
    const { callSid, phoneNumber, localNumber } = req.body;
    const session = await findInboundSession({ callSid, phoneNumber, localNumber });

    if (!session) {
      return res.status(404).json({ message: 'Inbound call session not found' });
    }

    if (session.status === 'answered' && session.answeredBy) {
      const answerer = await User.findById(session.answeredBy).select('name email');
      return res.json({
        alreadyAnswered: true,
        session,
        parentCallSid: session.callSid,
        answeredBy: session.answeredBy,
        answeredByName: answerer?.name || 'Teammate'
      });
    }

    const updatedSession = await InboundCallSession.findOneAndUpdate(
      { callSid: session.callSid, status: 'ringing' },
      {
        $set: {
          status: 'answered',
          answeredBy: req.user.id,
          answeredAt: new Date()
        }
      },
      { new: true }
    );

    if (!updatedSession) {
      const current = await findInboundSession({ callSid: session.callSid });
      const answerer = current?.answeredBy
        ? await User.findById(current.answeredBy).select('name email')
        : null;

      return res.json({
        alreadyAnswered: true,
        session: current,
        parentCallSid: current?.callSid,
        answeredBy: current?.answeredBy,
        answeredByName: answerer?.name || 'Teammate'
      });
    }

    await createTeammateCallLogs(updatedSession, req.user.id);

    const answerer = await User.findById(req.user.id).select('name email');
    const io = req.app.get('io');
    if (io) {
      io.emit('call-answered-by-teammate', {
        callSid: updatedSession.callSid,
        parentCallSid: updatedSession.callSid,
        phoneNumber: updatedSession.phoneNumber,
        localNumber: updatedSession.localNumber,
        answeredBy: req.user.id,
        answeredByName: answerer?.name || 'Teammate',
        assignedUserIds: updatedSession.assignedUserIds.map((id) => String(id))
      });
      io.emit('refresh-call-history');
    }

    res.json({
      session: updatedSession,
      parentCallSid: updatedSession.callSid,
      answeredBy: req.user.id,
      answeredByName: answerer?.name || 'Teammate'
    });
  } catch (error) {
    console.error('Mark Call Answered Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getInboundSession = async (req, res) => {
  try {
    const { callSid } = req.params;
    if (!callSid) {
      return res.status(400).json({ message: 'callSid is required' });
    }

    const { phoneNumber, localNumber } = req.query;
    const session = await findInboundSession({
      callSid,
      phoneNumber,
      localNumber
    });

    if (!session) {
      return res.status(404).json({ message: 'Inbound call session not found' });
    }

    await session.populate('answeredBy', 'name email');

    res.json({
      callSid: session.callSid,
      parentCallSid: session.callSid,
      phoneNumber: session.phoneNumber,
      localNumber: session.localNumber,
      status: session.status,
      answeredBy: session.answeredBy?._id || session.answeredBy || null,
      answeredByName: session.answeredBy?.name || '',
      assignedUserIds: session.assignedUserIds.map((id) => String(id))
    });
  } catch (error) {
    console.error('Get Inbound Session Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getCallLogs = async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const before = parseBeforeDate(req.query.before);
    const phoneNumber = String(req.query.phoneNumber || '').trim();
    const search = String(req.query.search || '').trim();
    const filters = [];

    if (phoneNumber) {
      filters.push(buildPhoneOrFilter(phoneNumber, ['phoneNumber']));
    } else {
      const accessQuery = await buildCallAccessQuery(req.user);
      if (Object.keys(accessQuery).length > 0) {
        filters.push(accessQuery);
      }
    }

    if (search) {
      const searchRegex = { $regex: escapeRegex(search), $options: 'i' };
      const rawDigits = search.replace(/\D/g, '');
      const searchPatterns = buildPhonePatterns(search);

      // Search contacts and leads matching the name, company, or email
      const [matchedContacts, matchedLeads] = await Promise.all([
        Contact.find({
          $or: [
            { name: searchRegex },
            { company: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id phone').lean(),
        Lead.find({
          $or: [
            { name: searchRegex },
            { email: searchRegex }
          ]
        }).select('_id phone').lean()
      ]);

      const contactPhones = [
        ...matchedContacts.map((c) => c.phone),
        ...matchedLeads.map((l) => l.phone)
      ].filter(Boolean);

      const contactPhonePatterns = [...new Set(contactPhones.flatMap((p) => buildPhonePatterns(p)))];
      const contactIds = matchedContacts.map((c) => c._id);

      const searchConditions = [
        { phoneNumber: searchRegex },
        { localNumber: searchRegex },
        ...(searchPatterns.length > 0 ? [{ phoneNumber: { $in: searchPatterns } }] : []),
        ...(contactPhonePatterns.length > 0 ? [{ phoneNumber: { $in: contactPhonePatterns } }] : []),
        ...(contactIds.length > 0 ? [{ contact: { $in: contactIds } }] : [])
      ];

      if (rawDigits.length >= 3) {
        searchConditions.push(
          { phoneNumber: { $regex: escapeRegex(rawDigits), $options: 'i' } },
          { localNumber: { $regex: escapeRegex(rawDigits), $options: 'i' } }
        );
      }

      filters.push({ $or: searchConditions });
    }

    const query = filters.length > 1
      ? { $and: filters }
      : (filters[0] || {});

    if (before) {
      query.startedAt = { $lt: before };
    }

    const logs = await CallLog.find(query)
      .populate('user', 'name email role')
      .populate('answeredBy', 'name email')
      .populate('contact', 'name phone company')
      .sort({ startedAt: -1, _id: -1 })
      .limit(limit + 1);

    const contactMap = await resolveContactsForLogs(logs);
    const formattedLogs = logs.map((log) => formatCallLog(log, contactMap));
    const page = buildPaginatedResponse(
      formattedLogs,
      limit,
      (log) => new Date(log.startedAt || log.createdAt || 0).toISOString()
    );
    page.items = req.user.role === 'admin'
      ? consolidateAdminCallLogs(page.items)
      : page.items;

    res.json(page);
  } catch (error) {
    console.error('Get Call Logs Error:', error);
    res.status(500).json({ message: error.message });
  }
};
