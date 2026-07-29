import Lead from '../model/Lead.js';
import User from '../model/User.js';
import LeadAssignmentState from '../model/LeadAssignmentState.js';

const LEAD_DISPOSITIONS = [
  'Quoted',
  'No Response',
  'Wrong Number',
  'Not Interested',
  'Price too high',
  'Part not available',
  'Ordered',
  'Already ordered',
];

const getAssignableUsers = async () => {
  return User.find({
    role: 'agent',
    isLeadAssignmentActive: { $ne: false },
  }).select('_id name email').sort({ name: 1 });
};

const getNextAssignee = async () => {
  let state = await LeadAssignmentState.findOne({ key: 'default' });

  if (!state) {
    state = await LeadAssignmentState.create({ key: 'default', currentIndex: 0 });
  }

  const users = await getAssignableUsers();

  if (!users.length) {
    return null;
  }

  const index = state.currentIndex % users.length;
  const nextUser = users[index];
  state.currentIndex = (index + 1) % users.length;
  await state.save();

  return nextUser;
};

const emitLeadAssigned = (req, lead) => {
  const io = req.app.get('io');
  if (!io || !lead?.assignedTo) return;

  io.to(String(lead.assignedTo._id || lead.assignedTo)).emit('lead-assigned', {
    lead,
    message: `New lead assigned: ${lead.name}`,
  });
};

export const createLead = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      zip,
      partRequested,
      make,
      model,
      year,
      yearMakeModel,
      disposition,
      notes,
      source,
      followUpAt,
      followUpNote,
    } = req.body;

    const isAdmin = req.user?.role === 'admin';
    let assignedTo = null;

    if (isAdmin) {
      const nextUser = await getNextAssignee();
      assignedTo = nextUser?._id || null;
    } else {
      assignedTo = req.user?.id || null;
    }

    const lead = await Lead.create({
      name: name?.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      zip: zip?.trim() || '',
      partRequested: partRequested?.trim() || '',
      make: make?.trim() || '',
      model: model?.trim() || '',
      year: year?.trim() || '',
      yearMakeModel: yearMakeModel?.trim() || '',
      disposition: disposition || 'Quoted',
      notes: notes?.trim() || '',
      source: source || 'manual',
      followUpAt: followUpAt ? new Date(followUpAt) : null,
      followUpNote: followUpNote?.trim() || '',
      createdBy: req.user?.id || null,
      assignedTo,
    });

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .lean();

    emitLeadAssigned(req, populatedLead);

    res.status(201).json({ message: 'Lead created', lead: populatedLead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getLeads = async (req, res) => {
  try {
    const {
      status,
      assignee,
      source,
      fromDate,
      toDate,
      search,
    } = req.query;

    const filter = {};

    if (status) filter.disposition = status;
    if (assignee) filter.assignedTo = assignee;
    if (source) filter.source = source;
    if (search) {
      const term = String(search).trim();
      if (term) {
        filter.$or = [
          { name: { $regex: term, $options: 'i' } },
          { phone: { $regex: term, $options: 'i' } },
          { partRequested: { $regex: term, $options: 'i' } },
          { make: { $regex: term, $options: 'i' } },
          { model: { $regex: term, $options: 'i' } },
          { zip: { $regex: term, $options: 'i' } },
        ];
      }
    }

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }

    const leads = await Lead.find(filter)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .lean();

    res.json(leads);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateLeadDisposition = async (req, res) => {
  try {
    const { disposition } = req.body;

    if (!LEAD_DISPOSITIONS.includes(disposition)) {
      return res.status(400).json({ message: 'A valid lead status is required' });
    }

    const lead = await Lead.findByIdAndUpdate(
      req.params.id,
      { disposition },
      { new: true, runValidators: true }
    );

    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .lean();

    res.json({ message: 'Lead status updated', lead: populatedLead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const addLeadNote = async (req, res) => {
  try {
    const { note } = req.body;
    const trimmedNote = note?.trim();

    if (!trimmedNote) {
      return res.status(400).json({ message: 'A note is required' });
    }

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    lead.notes = `${lead.notes || ''}${lead.notes ? '\n' : ''}${new Date().toLocaleString()} - ${trimmedNote}`.trim();
    await lead.save();

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .lean();

    res.json({ message: 'Note added', lead: populatedLead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateLeadFollowUp = async (req, res) => {
  try {
    const { followUpAt, followUpNote } = req.body;

    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    lead.followUpAt = followUpAt ? new Date(followUpAt) : null;
    lead.followUpNote = followUpNote?.trim() || '';
    lead.followUpSetBy = req.user?.id || null;
    await lead.save();

    const populatedLead = await Lead.findById(lead._id)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .lean();

    res.json({ message: 'Follow-up updated', lead: populatedLead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};