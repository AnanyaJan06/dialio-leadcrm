import FollowUp from '../model/FollowUp.js';
import Lead from '../model/Lead.js';

const getActorName = (req) => req.user?.name || req.user?.email || 'Unknown user';

const formatNoteEntry = (req, text) => {
  return `${new Date().toLocaleString()} - ${getActorName(req)}: ${text}`;
};

const appendLeadNote = (lead, req, text) => {
  lead.notes = `${lead.notes || ''}${lead.notes ? '\n' : ''}${formatNoteEntry(req, text)}`.trim();
};

const syncLeadFromFollowUp = async (followUp, req, previousFollowUp = null) => {
  if (!followUp?.lead) return;

  const lead = await Lead.findById(followUp.lead);
  if (!lead) return;

  if (followUp.completed) {
    if (lead.followUp && String(lead.followUp) !== String(followUp._id)) return;

    if (!previousFollowUp?.completed) {
      const completedParts = ['Follow-up completed'];
      if (followUp.followUpDate) completedParts.push(`Scheduled for ${followUp.followUpDate.toLocaleString()}`);
      if (followUp.note?.trim()) completedParts.push(`Note: ${followUp.note.trim()}`);
      appendLeadNote(lead, req, completedParts.join(' - '));
    }

    lead.followUp = null;
    lead.followUpAt = null;
    lead.followUpNote = '';
    lead.followUpSetBy = null;
    lead.followUpRemindedAt = followUp.completedAt || new Date();
  } else {
    lead.followUp = followUp._id;
    lead.followUpAt = followUp.followUpDate;
    lead.followUpNote = followUp.note || '';
  }

  await lead.save();
};

const backfillLeadFollowUps = async (req) => {
  const leads = await Lead.find({
    assignedTo: req.user.id,
    followUp: null,
    followUpAt: { $ne: null },
  });

  await Promise.all(leads.map(async (lead) => {
    const followUp = await FollowUp.create({
      user: req.user.id,
      lead: lead._id,
      source: 'lead',
      name: lead.name,
      phone: lead.phone,
      note: lead.followUpNote || `Follow up with ${lead.name}`,
      followUpDate: lead.followUpAt,
    });

    lead.followUp = followUp._id;
    await lead.save();
  }));
};

export const createFollowUp = async (req, res) => {
  try {
    const { name, phone, note, followUpDate, lead, contact, callLog, source } = req.body;
    const trimmedName = name?.trim();
    const trimmedNote = note?.trim();

    if (!trimmedName || !trimmedNote || !followUpDate) {
      return res.status(400).json({ message: 'Name, note, and follow-up date are required' });
    }

    const followUp = await FollowUp.create({
      user: req.user.id,
      lead: lead || null,
      contact: contact || null,
      callLog: callLog || null,
      source: source || (callLog ? 'voip' : lead ? 'lead' : 'manual'),
      name: trimmedName,
      phone: phone?.trim() || '',
      note: trimmedNote,
      followUpDate
    });

    await syncLeadFromFollowUp(followUp, req);

    res.status(201).json({ message: 'Follow-up created', followUp });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getFollowUps = async (req, res) => {
  try {
    await backfillLeadFollowUps(req);

    const followUps = await FollowUp.find({ user: req.user.id })
      .sort({ completed: 1, followUpDate: 1, createdAt: -1 });

    res.json(followUps);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateFollowUp = async (req, res) => {
  try {
    const { completed } = req.body;
    const nextCompleted = Boolean(completed);

    const existingFollowUp = await FollowUp.findOne({ _id: req.params.id, user: req.user.id });
    if (!existingFollowUp) {
      return res.status(404).json({ message: 'Follow-up not found' });
    }

    if (nextCompleted && !existingFollowUp.note?.trim()) {
      return res.status(400).json({ message: 'A follow-up note is required before completing' });
    }

    const previousFollowUp = { completed: existingFollowUp.completed };
    existingFollowUp.completed = nextCompleted;
    existingFollowUp.completedAt = nextCompleted ? new Date() : null;
    await existingFollowUp.save();

    await syncLeadFromFollowUp(existingFollowUp, req, previousFollowUp);

    res.json({ message: 'Follow-up updated', followUp: existingFollowUp });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteFollowUp = async (req, res) => {
  try {
    const followUp = await FollowUp.findOneAndDelete({
      _id: req.params.id,
      user: req.user.id
    });

    if (!followUp) {
      return res.status(404).json({ message: 'Follow-up not found' });
    }

    if (followUp.lead) {
      const lead = await Lead.findById(followUp.lead);
      if (lead && String(lead.followUp || '') === String(followUp._id)) {
        lead.followUp = null;
        lead.followUpAt = null;
        lead.followUpNote = '';
        lead.followUpSetBy = null;
        await lead.save();
      }
    }

    res.json({ message: 'Follow-up deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
