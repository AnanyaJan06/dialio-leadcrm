import Lead from '../model/Lead.js';
import FollowUp from '../model/FollowUp.js';
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

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const getActorName = (req) => req.user?.name || req.user?.email || 'Unknown user';

const formatNoteEntry = (req, text) => {
  return `${new Date().toLocaleString()} - ${getActorName(req)}: ${text}`;
};

const appendLeadNote = (lead, req, text) => {
  lead.notes = `${lead.notes || ''}${lead.notes ? '\n' : ''}${formatNoteEntry(req, text)}`.trim();
};

const populateLead = (id) => Lead.findById(id)
  .populate('assignedTo', 'name email role')
  .populate('createdBy', 'name email role')
  .populate('followUp')
  .lean();

const getFollowUpOwner = (lead, req) => lead.assignedTo || req.user?.id || null;

const getFollowUpNote = (lead, fallbackNote = '') => fallbackNote || `Follow up with ${lead.name}`;

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

    let assignedTo = null;

    const nextUser = await getNextAssignee();
    if (nextUser?._id) {
      assignedTo = nextUser._id;
    } else {
      assignedTo = req.user?.id || null;
    }

    const initialNotes = [];
    if (notes?.trim()) {
      initialNotes.push(formatNoteEntry(req, notes.trim()));
    }
    if (followUpAt) {
      if (!followUpNote?.trim()) {
        return res.status(400).json({ message: 'A follow-up note is required when scheduling a follow-up' });
      }

      const followUpParts = [`Follow-up scheduled for ${new Date(followUpAt).toLocaleString()}`];
      if (followUpNote?.trim()) followUpParts.push(`Note: ${followUpNote.trim()}`);
      initialNotes.push(formatNoteEntry(req, followUpParts.join(' - ')));
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
      notes: initialNotes.join('\n'),
      source: source || 'manual',
      followUpAt: followUpAt ? new Date(followUpAt) : null,
      followUpNote: followUpNote?.trim() || '',
      followUpSetBy: followUpAt ? req.user?.id || null : null,
      createdBy: req.user?.id || null,
      assignedTo,
    });

    if (lead.followUpAt) {
      const followUp = await FollowUp.create({
        user: getFollowUpOwner(lead, req),
        lead: lead._id,
        source: 'lead',
        name: lead.name,
        phone: lead.phone,
        note: getFollowUpNote(lead, lead.followUpNote),
        followUpDate: lead.followUpAt,
      });

      lead.followUp = followUp._id;
      await lead.save();
    }

    const populatedLead = await populateLead(lead._id);

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
      page,
      limit,
    } = req.query;

    const filter = {};

    if (status) filter.disposition = status;
    if (assignee) filter.assignedTo = assignee;
    if (source) filter.source = source;
    if (search) {
      const term = String(search).trim();
      if (term) {
        const regex = { $regex: escapeRegex(term), $options: 'i' };
        filter.$or = [
          { name: regex },
          { email: regex },
          { phone: regex },
          { partRequested: regex },
          { make: regex },
          { model: regex },
          { zip: regex },
        ];
      }
    }

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) filter.createdAt.$lte = new Date(toDate);
    }

    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedLimit = Math.min(50, Math.max(1, Number(limit) || 3));

    const totalCount = await Lead.countDocuments(filter);
    const totalPages = Math.max(1, Math.ceil(totalCount / normalizedLimit));
    const safePage = Math.min(normalizedPage, totalPages);

    const leads = await Lead.find(filter)
      .populate('assignedTo', 'name email role')
      .populate('createdBy', 'name email role')
      .populate('followUp')
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * normalizedLimit)
      .limit(normalizedLimit)
      .lean();

    res.json({
      leads,
      page: safePage,
      limit: normalizedLimit,
      totalCount,
      totalPages,
    });
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

    const populatedLead = await populateLead(lead._id);

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

    appendLeadNote(lead, req, trimmedNote);
    await lead.save();

    const populatedLead = await populateLead(lead._id);

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

    const trimmedFollowUpNote = followUpNote?.trim() || '';
    const nextFollowUpAt = followUpAt ? new Date(followUpAt) : null;

    if (nextFollowUpAt && !trimmedFollowUpNote) {
      return res.status(400).json({ message: 'A follow-up note is required when scheduling a follow-up' });
    }

    lead.followUpAt = nextFollowUpAt;
    lead.followUpNote = trimmedFollowUpNote;
    lead.followUpSetBy = req.user?.id || null;

    if (nextFollowUpAt) {
      const noteParts = [`Follow-up scheduled for ${nextFollowUpAt.toLocaleString()}`];
      if (trimmedFollowUpNote) noteParts.push(`Note: ${trimmedFollowUpNote}`);
      appendLeadNote(lead, req, noteParts.join(' - '));
    } else {
      appendLeadNote(lead, req, 'Follow-up cleared');
    }

    await lead.save();

    if (nextFollowUpAt) {
      const followUpPayload = {
        user: getFollowUpOwner(lead, req),
        lead: lead._id,
        source: 'lead',
        name: lead.name,
        phone: lead.phone,
        note: getFollowUpNote(lead, trimmedFollowUpNote),
        followUpDate: nextFollowUpAt,
        completed: false,
        completedAt: null,
      };

      let followUp = lead.followUp
        ? await FollowUp.findByIdAndUpdate(lead.followUp, followUpPayload, { new: true, runValidators: true })
        : null;

      if (!followUp) {
        followUp = await FollowUp.create(followUpPayload);
      }

      lead.followUp = followUp._id;
      await lead.save();
    } else if (lead.followUp) {
      await FollowUp.findByIdAndUpdate(lead.followUp, {
        completed: true,
        completedAt: new Date(),
      });
      lead.followUp = null;
      await lead.save();
    }

    const populatedLead = await populateLead(lead._id);

    res.json({ message: 'Follow-up updated', lead: populatedLead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const completeLeadFollowUp = async (req, res) => {
  try {
    const lead = await Lead.findById(req.params.id);
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' });
    }

    const completedParts = ['Follow-up completed'];
    if (lead.followUpAt) completedParts.push(`Scheduled for ${lead.followUpAt.toLocaleString()}`);
    if (lead.followUpNote) completedParts.push(`Note: ${lead.followUpNote}`);

    if (!lead.followUpNote?.trim()) {
      return res.status(400).json({ message: 'A follow-up note is required before completing' });
    }

    lead.followUpAt = null;
    lead.followUpNote = '';
    lead.followUpSetBy = null;
    lead.followUpRemindedAt = new Date();
    appendLeadNote(lead, req, completedParts.join(' - '));

    if (lead.followUp) {
      await FollowUp.findByIdAndUpdate(lead.followUp, {
        completed: true,
        completedAt: lead.followUpRemindedAt,
      });
      lead.followUp = null;
    }

    await lead.save();

    const populatedLead = await populateLead(lead._id);

    res.json({ message: 'Follow-up completed', lead: populatedLead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

