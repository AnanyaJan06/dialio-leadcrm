import User from '../model/User.js';
import TwilioNumber from '../model/TwilioNumber.js';
import {
  ensureVoiceIdentity,
  getPublicBaseUrl,
  getTwilioClient,
  upsertTwilioNumber,
  userIsAssignedToNumber
} from '../utils/twilioNumbers.js';

const setUserDefaultNumber = async (userId, number = null) => {
  if (!userId) return;

  const fallback = number || await TwilioNumber.findOne({ assignedUsers: userId }).sort({ phoneNumber: 1 });

  await User.findByIdAndUpdate(userId, {
    assignedPhoneNumber: fallback?.phoneNumber || '',
    assignedPhoneNumberSid: fallback?.sid || ''
  });
};

const serializeNumber = (number) => ({
  id: number._id,
  sid: number.sid,
  phoneNumber: number.phoneNumber,
  friendlyName: number.friendlyName,
  isoCountry: number.isoCountry,
  capabilities: number.capabilities,
  assignedUsers: number.assignedUsers,
  createdAt: number.createdAt,
  updatedAt: number.updatedAt
});

const populateNumber = (query) => query
  .populate('assignedUsers', 'name email role assignedPhoneNumber assignedPhoneNumberSid');

const normalizeUserIds = (value) => {
  if (Array.isArray(value)) {
    return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))];
  }

  if (value) {
    return [String(value).trim()];
  }

  return [];
};

const buildWebhookConfig = () => {
  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) return {};

  return {
    voiceUrl: `${baseUrl}/api/twilio/incoming`,
    voiceMethod: 'POST',
    smsUrl: `${baseUrl}/api/messages/incoming`,
    smsMethod: 'POST'
  };
};

const updateNumberWebhooks = async (client, number) => {
  const webhookConfig = buildWebhookConfig();
  if (Object.keys(webhookConfig).length === 0) return number;

  return client.incomingPhoneNumbers(number.sid).update(webhookConfig);
};

export const listOwnedNumbers = async (req, res) => {
  try {
    const numbers = await populateNumber(TwilioNumber.find())
      .sort({ phoneNumber: 1 });

    res.json(numbers.map(serializeNumber));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const listMyAssignedNumbers = async (req, res) => {
  try {
    const numbers = await populateNumber(TwilioNumber.find({ assignedUsers: req.user.id }))
      .sort({ phoneNumber: 1 });

    res.json(numbers.map(serializeNumber));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const syncPurchasedNumbers = async (req, res) => {
  try {
    const client = getTwilioClient();
    console.log("Client",client);

    console.log('[Twilio Sync] Starting purchased number sync...');

    const incomingNumbers = await client.incomingPhoneNumbers.list({ limit: 100 });
    const importedSids = incomingNumbers.map((number) => number.sid);
    const importedPhoneNumbers = incomingNumbers.map((number) => number.phoneNumber);

    console.log(`[Twilio Sync] Fetched ${incomingNumbers.length} purchased number(s) from Twilio.`);
    console.log('[Twilio Sync] Purchased numbers:', importedPhoneNumbers);

    await Promise.all(incomingNumbers.map((number) => updateNumberWebhooks(client, number)));
    console.log('[Twilio Sync] Webhook URLs updated for fetched numbers.');

    const staleNumbers = await TwilioNumber.find({
      sid: { $nin: importedSids }
    });

    if (staleNumbers.length > 0) {
      console.log('[Twilio Sync] Removing stale numbers:', staleNumbers.map((number) => number.phoneNumber));
      const affectedUserIds = [...new Set(staleNumbers
        .flatMap((number) => (number.assignedUsers || []).map((userId) => userId.toString()))
        .filter(Boolean))];

      await User.updateMany(
        { assignedPhoneNumberSid: { $in: staleNumbers.map((number) => number.sid) } },
        { assignedPhoneNumber: '', assignedPhoneNumberSid: '' }
      );

      await TwilioNumber.deleteMany({
        _id: { $in: staleNumbers.map((number) => number._id) }
      });

      await Promise.all(affectedUserIds.map((userId) => setUserDefaultNumber(userId)));
    } else {
      console.log('[Twilio Sync] No stale numbers found.');
    }

    const numbers = await Promise.all(incomingNumbers.map(upsertTwilioNumber));
    const populatedNumbers = await populateNumber(TwilioNumber.find({
      _id: { $in: numbers.map((number) => number._id) }
    }))
      .sort({ phoneNumber: 1 });

    console.log('[Twilio Sync] Stored numbers in TwilioNumber collection:', populatedNumbers.map((number) => ({
      phoneNumber: number.phoneNumber,
      assignedUsers: number.assignedUsers?.map((user) => user.email).filter(Boolean) || []
    })));
    console.log('[Twilio Sync] Sync completed.');

    res.json(populatedNumbers.map(serializeNumber));
  } catch (error) {
    console.error('Sync Twilio Numbers Error:', error);
    res.status(500).json({ message: error.message, code: error.code });
  }
};

const assignNumberToUsersById = async (numberId, userIds) => {
  const number = await TwilioNumber.findById(numberId);
  if (!number) {
    const error = new Error('Phone number not found');
    error.status = 404;
    throw error;
  }

  const nextUserIds = normalizeUserIds(userIds);
  const previousUserIds = (number.assignedUsers || []).map((userId) => String(userId));

  if (nextUserIds.length === 0) {
    number.assignedUsers = [];
    await number.save();
    await Promise.all(previousUserIds.map((userId) => setUserDefaultNumber(userId)));
    return number;
  }

  const users = await User.find({ _id: { $in: nextUserIds } });
  if (users.length !== nextUserIds.length) {
    const error = new Error('One or more users were not found');
    error.status = 404;
    throw error;
  }

  await Promise.all(users.map((user) => ensureVoiceIdentity(user)));

  number.assignedUsers = users.map((user) => user._id);
  await number.save();

  const removedUserIds = previousUserIds.filter((userId) => !nextUserIds.includes(userId));
  await Promise.all(removedUserIds.map((userId) => setUserDefaultNumber(userId)));

  await Promise.all(users.map(async (user) => {
    const hasValidDefault = user.assignedPhoneNumberSid
      ? await TwilioNumber.exists({
          sid: user.assignedPhoneNumberSid,
          assignedUsers: user._id
        })
      : false;

    if (!hasValidDefault) {
      user.assignedPhoneNumber = number.phoneNumber;
      user.assignedPhoneNumberSid = number.sid;
      await user.save();
    }
  }));

  return number;
};

export const assignNumberToUser = async (req, res) => {
  try {
    const userIds = normalizeUserIds(
      req.body.userIds !== undefined ? req.body.userIds : req.body.userId
    );
    const number = await assignNumberToUsersById(req.params.id, userIds);
    const populated = await populateNumber(TwilioNumber.findById(number._id));

    res.json(serializeNumber(populated));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

export const setDefaultNumberForUser = async (req, res) => {
  try {
    const number = await TwilioNumber.findById(req.params.id);
    if (!number) {
      return res.status(404).json({ message: 'Phone number not found' });
    }

    const userId = req.body.userId;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required when setting a default sender' });
    }

    if (!userIsAssignedToNumber(number, userId)) {
      return res.status(400).json({ message: 'Assign this number to the user before setting it as default' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'Assigned user not found' });
    }

    user.assignedPhoneNumber = number.phoneNumber;
    user.assignedPhoneNumberSid = number.sid;
    await user.save();

    const populated = await populateNumber(TwilioNumber.findById(number._id));
    res.json(serializeNumber(populated));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const setMyDefaultNumber = async (req, res) => {
  try {
    const number = await TwilioNumber.findById(req.body.numberId);
    if (!number) {
      return res.status(404).json({ message: 'Phone number not found' });
    }

    if (!userIsAssignedToNumber(number, req.user.id)) {
      return res.status(403).json({ message: 'This number is not allotted to your account' });
    }

    const user = await User.findById(req.user.id);
    user.assignedPhoneNumber = number.phoneNumber;
    user.assignedPhoneNumberSid = number.sid;
    await user.save();

    const populated = await populateNumber(TwilioNumber.findById(number._id));
    res.json(serializeNumber(populated));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};