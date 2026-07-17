import User from '../model/User.js';
import CallLog from '../model/CallLog.js';
import MessageLog from '../model/MessageLog.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const getClientIp = (req) => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor?.split(',')[0] || req.ip || req.socket?.remoteAddress || '';

  return ip.trim().replace(/^::ffff:/, '');
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }

  next();
};

export const register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const requestedRole = String(role || '').trim().toLowerCase();
    const userRole = ['admin', 'agent'].includes(requestedRole) ? requestedRole : 'agent';

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({ 
      name, 
      email, 
      password: hashedPassword,
      role: userRole
    });
    
    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        assignedPhoneNumber: user.assignedPhoneNumber || ''
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { 
      expiresIn: '7d' 
    });

    user.lastLoginIp = getClientIp(req);
    user.lastLoginAt = new Date();
    await user.save();

    res.json({ 
      token, 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        assignedPhoneNumber: user.assignedPhoneNumber || ''
      } 
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.lastLogoutIp = getClientIp(req);
    user.lastLogoutAt = new Date();
    await user.save();

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// New: Get Current User
export const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const readDateRange = (startValue, endValue) => {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    return null;
  }

  return { start, end };
};

export const getAdminActivityStats = async (req, res) => {
  try {
    const monthRange = readDateRange(req.query.monthStart, req.query.monthEnd);
    const dateRange = readDateRange(req.query.dateStart, req.query.dateEnd);

    if (!monthRange || !dateRange) {
      return res.status(400).json({ message: 'Valid month and date ranges are required' });
    }

    const [
      monthCalls,
      monthMessages,
      selectedDateCalls,
      selectedDateMessages
    ] = await Promise.all([
      CallLog.countDocuments({
        startedAt: { $gte: monthRange.start, $lt: monthRange.end }
      }),
      MessageLog.countDocuments({
        createdAt: { $gte: monthRange.start, $lt: monthRange.end }
      }),
      CallLog.countDocuments({
        startedAt: { $gte: dateRange.start, $lt: dateRange.end }
      }),
      MessageLog.countDocuments({
        createdAt: { $gte: dateRange.start, $lt: dateRange.end }
      })
    ]);

    res.json({
      month: {
        calls: monthCalls,
        messages: monthMessages
      },
      selectedDate: {
        calls: selectedDateCalls,
        messages: selectedDateMessages
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// New: Change Password
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
