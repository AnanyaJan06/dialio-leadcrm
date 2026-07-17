import InternalMessage from '../model/InternalMessage.js';
import User from '../model/User.js';

const canMessageUser = (currentUser, otherUser) => {
  if (!otherUser || String(currentUser.id) === String(otherUser._id)) {
    return false;
  }

  return ['admin', 'agent'].includes(currentUser.role)
    && ['admin', 'agent'].includes(otherUser.role);
};

const userFields = 'name email role';

export const getChatUsers = async (req, res) => {
  try {
    const users = await User.find({
      _id: { $ne: req.user.id },
      role: { $in: ['admin', 'agent'] }
    })
      .select(userFields)
      .sort({ role: 1, name: 1 });

    const usersWithUnreadCounts = await Promise.all(users.map(async (user) => {
      const [unreadCount, lastMessage] = await Promise.all([
        InternalMessage.countDocuments({
          sender: user._id,
          recipient: req.user.id,
          readAt: { $exists: false }
        }),
        InternalMessage.findOne({
          $or: [
            { sender: req.user.id, recipient: user._id },
            { sender: user._id, recipient: req.user.id }
          ]
        })
          .select('body createdAt sender recipient')
          .sort({ createdAt: -1 })
      ]);

      return {
        ...user.toObject(),
        unreadCount,
        lastMessageAt: lastMessage?.createdAt || null,
        lastMessagePreview: lastMessage?.body || ''
      };
    }));

    usersWithUnreadCounts.sort((a, b) => {
      if (b.unreadCount !== a.unreadCount) {
        return b.unreadCount - a.unreadCount;
      }

      if (a.lastMessageAt || b.lastMessageAt) {
        return new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0);
      }

      return a.name.localeCompare(b.name);
    });

    res.json(usersWithUnreadCounts);
  } catch (error) {
    console.error('Get Chat Users Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getConversation = async (req, res) => {
  try {
    const otherUser = await User.findById(req.params.userId).select(userFields);

    if (!canMessageUser(req.user, otherUser)) {
      return res.status(403).json({ message: 'You cannot view this conversation' });
    }

    const messages = await InternalMessage.find({
      $or: [
        { sender: req.user.id, recipient: otherUser._id },
        { sender: otherUser._id, recipient: req.user.id }
      ]
    })
      .populate('sender', userFields)
      .populate('recipient', userFields)
      .sort({ createdAt: 1 })
      .limit(200);

    await InternalMessage.updateMany(
      { sender: otherUser._id, recipient: req.user.id, readAt: { $exists: false } },
      { readAt: new Date() }
    );

    res.json(messages);
  } catch (error) {
    console.error('Get Conversation Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const sendInternalMessage = async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    const recipient = await User.findById(req.body.recipientId).select(userFields);

    if (!canMessageUser(req.user, recipient)) {
      return res.status(403).json({ message: 'You cannot message this user' });
    }

    if (!body) {
      return res.status(400).json({ message: 'Message body is required' });
    }

    if (body.length > 2000) {
      return res.status(400).json({ message: 'Message body cannot exceed 2000 characters' });
    }

    const message = await InternalMessage.create({
      sender: req.user.id,
      recipient: recipient._id,
      body
    });

    const populatedMessage = await message.populate([
      { path: 'sender', select: userFields },
      { path: 'recipient', select: userFields }
    ]);

    const io = req.app.get('io');
    if (io) {
      io.emit('internal-message-created', {
        _id: populatedMessage._id,
        messageId: populatedMessage._id,
        sender: populatedMessage.sender,
        recipient: populatedMessage.recipient,
        body: populatedMessage.body,
        createdAt: populatedMessage.createdAt
      });
    }

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error('Send Internal Message Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getUnreadInternalMessageCount = async (req, res) => {
  try {
    const count = await InternalMessage.countDocuments({
      recipient: req.user.id,
      readAt: { $exists: false }
    });

    res.json({ count });
  } catch (error) {
    console.error('Get Internal Unread Count Error:', error);
    res.status(500).json({ message: error.message });
  }
};
