import twilio from 'twilio';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import MessageLog from '../model/MessageLog.js';
import TwilioNumber from '../model/TwilioNumber.js';
import { buildMessageAccessQuery } from '../utils/messageAccess.js';
import { buildPaginatedResponse, parseBeforeDate, parseLimit } from '../utils/pagination.js';
import { buildPhoneOrFilter } from '../utils/phoneMatch.js';
import { getAssignedNumberForUser } from '../utils/twilioNumbers.js';
import '../model/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
const messageUploadsDir = path.join(uploadsRoot, 'messages');
const allowedImageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp']
]);
const maxImageBytes = 5 * 1024 * 1024;

const getTwilioClient = () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio SMS credentials are not configured');
  }

  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
};

const getSenderConfig = async (userId) => {
  const assignedNumber = await getAssignedNumberForUser(userId);
  if (assignedNumber) {
    return { from: assignedNumber };
  }

  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    return { messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID };
  }

  if (!process.env.TWILIO_PHONE_NUMBER) {
    throw new Error('Twilio sender number is not configured');
  }

  return { from: process.env.TWILIO_PHONE_NUMBER };
};

const getPublicBaseUrl = () => (process.env.BASE_URL || '').replace(/\/$/, '');

const normalizeMediaUrls = (mediaUrls) => {
  if (!Array.isArray(mediaUrls)) return [];

  return mediaUrls
    .map((url) => String(url || '').trim())
    .filter(Boolean)
    .slice(0, 10);
};

export const uploadMessageImage = async (req, res) => {
  try {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    const extension = allowedImageTypes.get(contentType);
    const baseUrl = getPublicBaseUrl();

    if (!extension) {
      return res.status(400).json({ message: 'Upload a JPG, PNG, GIF, or WebP image.' });
    }

    if (!baseUrl) {
      return res.status(500).json({ message: 'BASE_URL is required before image messages can be sent.' });
    }

    if (!req.body?.length) {
      return res.status(400).json({ message: 'Image file is required.' });
    }

    if (req.body.length > maxImageBytes) {
      return res.status(400).json({ message: 'Image must be 5MB or smaller.' });
    }

    await fs.mkdir(messageUploadsDir, { recursive: true });

    const fileName = `${Date.now()}-${req.user.id}-${Math.random().toString(36).slice(2)}.${extension}`;
    const filePath = path.join(messageUploadsDir, fileName);
    await fs.writeFile(filePath, req.body);

    res.status(201).json({
      mediaUrl: `${baseUrl}/uploads/messages/${fileName}`
    });
  } catch (error) {
    console.error('Upload Message Image Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { to, body } = req.body;
    const trimmedTo = String(to || '').trim();
    const trimmedBody = String(body || '').trim();
    const mediaUrls = normalizeMediaUrls(req.body.mediaUrls);

    if (!trimmedTo || trimmedTo.replace(/\D/g, '').length < 7) {
      return res.status(400).json({ message: 'A valid recipient phone number is required' });
    }

    if (!trimmedBody && mediaUrls.length === 0) {
      return res.status(400).json({ message: 'Message body or image is required' });
    }

    if (trimmedBody.length > 1600) {
      return res.status(400).json({ message: 'Message body cannot exceed 1600 characters' });
    }

    const client = getTwilioClient();
    const senderConfig = await getSenderConfig(req.user.id);
    const baseUrl = getPublicBaseUrl();

    const twilioMessage = await client.messages.create({
      ...senderConfig,
      to: trimmedTo,
      ...(trimmedBody ? { body: trimmedBody } : {}),
      ...(mediaUrls.length > 0 ? { mediaUrl: mediaUrls } : {}),
      ...(baseUrl ? { statusCallback: `${baseUrl}/api/messages/status` } : {})
    });

    const sender = senderConfig.from || process.env.TWILIO_MESSAGING_SERVICE_SID;
    const messageLog = await MessageLog.create({
      user: req.user.id,
      phoneNumber: trimmedTo,
      from: sender,
      to: trimmedTo,
      body: trimmedBody,
      mediaUrls,
      direction: 'outbound',
      status: twilioMessage.status,
      messageSid: twilioMessage.sid
    });

    res.status(201).json({ message: 'Message sent', messageLog });
  } catch (error) {
    console.error('Send Message Error:', error);
    res.status(500).json({
      message: error.message,
      code: error.code
    });
  }
};

export const updateMessageStatus = async (req, res) => {
  try {
    console.log('Twilio message status webhook body:', req.body);

    const messageSid = req.body.MessageSid || req.body.SmsSid;
    const status = req.body.MessageStatus || req.body.SmsStatus;

    if (!messageSid || !status) {
      return res.status(400).json({ message: 'MessageSid and status are required' });
    }

    const update = {
      status,
      errorCode: req.body.ErrorCode || '',
      errorMessage: req.body.ErrorMessage || ''
    };

    if (status === 'delivered') {
      update.deliveredAt = new Date();
    }

    const messageLog = await MessageLog.findOneAndUpdate(
      { messageSid },
      update,
      { returnDocument: 'after' }
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('message-status-updated', {
        messageSid,
        status,
        errorCode: update.errorCode,
        deliveredAt: messageLog?.deliveredAt
      });
    }

    res.sendStatus(204);
  } catch (error) {
    console.error('Message Status Error:', error);
    res.status(500).json({ message: error.message });
  }
};

const formatMessage = (message) => {
  const item = message.toObject ? message.toObject() : message;
  return {
    ...item,
    userName: item.user?.name || ''
  };
};

export const getMessages = async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const before = parseBeforeDate(req.query.before);
    const phoneNumber = String(req.query.phoneNumber || '').trim();
    const accessQuery = await buildMessageAccessQuery(req.user);
    const filters = [];

    if (phoneNumber) {
      filters.push(buildPhoneOrFilter(phoneNumber, ['phoneNumber', 'from', 'to']));
    }

    if (Object.keys(accessQuery).length > 0) {
      filters.push(accessQuery);
    }

    const query = filters.length > 1
      ? { $and: filters }
      : (filters[0] || {});

    if (before) {
      query.createdAt = { $lt: before };
    }

    const messages = await MessageLog.find(query)
      .populate('user', 'name email role')
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);

    const page = buildPaginatedResponse(
      messages.map(formatMessage),
      limit,
      (message) => new Date(message.createdAt || 0).toISOString()
    );

    res.json(page);
  } catch (error) {
    console.error('Get Messages Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getMessageThreads = async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const before = parseBeforeDate(req.query.before);
    const accessQuery = await buildMessageAccessQuery(req.user);
    const pipeline = [];

    if (Object.keys(accessQuery).length > 0) {
      pipeline.push({ $match: accessQuery });
    }

    pipeline.push(
      {
        $addFields: {
          threadPhone: {
            $cond: [
              { $eq: ['$direction', 'outbound'] },
              '$to',
              '$from'
            ]
          }
        }
      },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: '$threadPhone',
          latestMessage: { $first: '$$ROOT' },
          latestCreatedAt: { $first: '$createdAt' }
        }
      },
      { $sort: { latestCreatedAt: -1, _id: -1 } }
    );

    if (before) {
      pipeline.push({ $match: { latestCreatedAt: { $lt: before } } });
    }

    pipeline.push({ $limit: limit + 1 });

    const groupedThreads = await MessageLog.aggregate(pipeline);
    const page = buildPaginatedResponse(
      groupedThreads.map((thread) => {
        const message = formatMessage(thread.latestMessage);
        return {
          ...message,
          phoneNumber: thread._id,
          threadKey: thread._id
        };
      }),
      limit,
      (thread) => new Date(thread.createdAt || 0).toISOString()
    );

    res.json(page);
  } catch (error) {
    console.error('Get Message Threads Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const receiveMessage = async (req, res) => {
  try {
    const from = req.body.From || 'Unknown';
    const to = req.body.To || process.env.TWILIO_PHONE_NUMBER || 'Unknown';
    const body = req.body.Body || '';
    const messageSid = req.body.MessageSid || req.body.SmsSid || '';
    const mediaCount = Number(req.body.NumMedia) || 0;
    const mediaUrls = Array.from({ length: mediaCount }, (_, index) => req.body[`MediaUrl${index}`])
      .filter(Boolean);
    const assignedNumber = await TwilioNumber.findOne({ phoneNumber: to });
    const assignedUserIds = (assignedNumber?.assignedUsers || []).map((userId) => String(userId));

    const messageLog = await MessageLog.create({
      user: assignedUserIds[0] || undefined,
      phoneNumber: from,
      from,
      to,
      body,
      mediaUrls,
      direction: 'inbound',
      status: req.body.SmsStatus || 'received',
      messageSid
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('incoming-message', {
        from,
        to,
        body,
        mediaUrls,
        messageSid,
        assignedTo: assignedUserIds,
        createdAt: messageLog.createdAt
      });
    }

    const twiml = new twilio.twiml.MessagingResponse();
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Receive Message Error:', error);
    res.status(500).send('Internal Server Error');
  }
};
