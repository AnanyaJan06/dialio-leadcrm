import CallLog from '../model/CallLog.js';
import MessageLog from '../model/MessageLog.js';
import { consolidateAdminCallLogs } from '../utils/consolidateCallLogs.js';
import { buildPhoneOrFilter } from '../utils/phoneMatch.js';
import { buildPaginatedResponse, parseBeforeDate, parseLimit } from '../utils/pagination.js';
import { buildCallAccessQuery } from '../utils/callAccess.js';
import { buildMessageAccessQuery } from '../utils/messageAccess.js';

const formatCallItem = (log) => {
  const item = log.toObject ? log.toObject() : log;

  return {
    id: String(item._id || item.callSid || ''),
    type: 'call',
    direction: item.callType || 'call',
    status: item.status || 'completed',
    duration: Number(item.duration) || 0,
    localNumber: item.localNumber || '',
    phoneNumber: item.phoneNumber,
    date: item.startedAt || item.createdAt,
    userName: item.userName || item.user?.name || '',
    handledByName: item.handledByName || item.answeredByName || '',
    answeredByName: item.answeredByName || item.answeredBy?.name || '',
    isConsolidated: Boolean(item.isConsolidated),
    alsoNotifiedUsers: item.alsoNotifiedUsers || [],
    missedByUsers: item.missedByUsers || [],
    callSid: item.callSid || ''
  };
};

const formatMessageItem = (message) => {
  const item = message.toObject ? message.toObject() : message;

  return {
    id: String(item._id || item.messageSid || ''),
    type: 'sms',
    direction: item.direction,
    status: item.status,
    errorCode: item.errorCode,
    deliveredAt: item.deliveredAt,
    from: item.from,
    to: item.to,
    body: item.body,
    mediaUrls: item.mediaUrls || [],
    date: item.createdAt,
    userName: item.userName || item.user?.name || ''
  };
};

export const getConversationTimeline = async (req, res) => {
  try {
    const phoneNumber = String(req.query.phoneNumber || '').trim();
    if (!phoneNumber) {
      return res.status(400).json({ message: 'phoneNumber is required' });
    }

    const limit = parseLimit(req.query.limit);
    const before = parseBeforeDate(req.query.before);
    const phoneFilter = buildPhoneOrFilter(phoneNumber, ['phoneNumber', 'from', 'to']);
    const callAccessQuery = await buildCallAccessQuery(req.user);

    const callQuery = Object.keys(callAccessQuery).length > 0
      ? { $and: [phoneFilter, callAccessQuery] }
      : phoneFilter;

    const messageAccessQuery = await buildMessageAccessQuery(req.user);
    const messageQuery = Object.keys(messageAccessQuery).length > 0
      ? { $and: [phoneFilter, messageAccessQuery] }
      : phoneFilter;

    const pipeline = [
      { $match: messageQuery },
      {
        $project: {
          itemType: { $literal: 'sms' },
          sortDate: '$createdAt',
          payload: '$$ROOT'
        }
      },
      {
        $unionWith: {
          coll: CallLog.collection.name,
          pipeline: [
            { $match: callQuery },
            {
              $project: {
                itemType: { $literal: 'call' },
                sortDate: '$startedAt',
                payload: '$$ROOT'
              }
            }
          ]
        }
      },
      { $sort: { sortDate: -1, 'payload._id': -1 } }
    ];

    if (before) {
      pipeline.push({ $match: { sortDate: { $lt: before } } });
    }

    pipeline.push({ $limit: limit + 1 });

    const rows = await MessageLog.aggregate(pipeline);
    const callRows = rows.filter((row) => row.itemType === 'call');
    const messageRows = rows.filter((row) => row.itemType === 'sms');

    let formattedCalls = callRows.map((row) => {
      const item = row.payload;
      return {
        ...item,
        userName: item.user?.name || '',
        answeredByName: item.answeredBy?.name || ''
      };
    });

    if (req.user.role === 'admin' && formattedCalls.length > 0) {
      const callIds = formattedCalls.map((call) => call._id);
      const populatedCalls = await CallLog.find({ _id: { $in: callIds } })
        .populate('user', 'name email role')
        .populate('answeredBy', 'name email');
      const populatedMap = new Map(populatedCalls.map((call) => [String(call._id), call]));
      formattedCalls = formattedCalls.map((call) => {
        const populated = populatedMap.get(String(call._id));
        if (!populated) return call;
        const item = populated.toObject();
        return {
          ...item,
          userName: item.user?.name || '',
          answeredByName: item.answeredBy?.name || ''
        };
      });
      formattedCalls = consolidateAdminCallLogs(formattedCalls);
    }

    const consolidatedCallItems = formattedCalls.map(formatCallItem);
    const messageItems = messageRows
      .map((row) => formatMessageItem(row.payload))
      .filter((item) => item.id);

    const timelineDesc = [...consolidatedCallItems, ...messageItems]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, limit + 1);

    const page = buildPaginatedResponse(timelineDesc, limit, (item) => new Date(item.date).toISOString());
    page.hasMore = page.hasMore || rows.length > limit;
    page.items.sort((a, b) => new Date(a.date) - new Date(b.date));

    res.json(page);
  } catch (error) {
    console.error('Get Conversation Timeline Error:', error);
    res.status(500).json({ message: error.message });
  }
};
