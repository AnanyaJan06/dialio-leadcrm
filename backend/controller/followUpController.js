import FollowUp from '../model/FollowUp.js';
import Lead from '../model/Lead.js';

const syncLeadFromFollowUp = async (followUp) => {
  if (!followUp?.lead) return;

  const lead = await Lead.findById(followUp.lead);
  if (!lead) return;

  if (followUp.completed) {
    if (lead.followUp && String(lead.followUp) !== String(followUp._id)) return;

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

    if (!name || !note || !followUpDate) {
      return res.status(400).json({ message: 'Name, note, and follow-up date are required' });
    }

    const followUp = await FollowUp.create({
      user: req.user.id,
      lead: lead || null,
      contact: contact || null,
      callLog: callLog || null,
      source: source || (callLog ? 'voip' : lead ? 'lead' : 'manual'),
      name: name.trim(),
      phone: phone?.trim() || '',
      note: note.trim(),
      followUpDate
    });

    await syncLeadFromFollowUp(followUp);

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

    const update = {
      completed: Boolean(completed),
      completedAt: completed ? new Date() : null
    };

    const followUp = await FollowUp.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      update,
      { new: true }
    );

    if (!followUp) {
      return res.status(404).json({ message: 'Follow-up not found' });
    }

    await syncLeadFromFollowUp(followUp);

    res.json({ message: 'Follow-up updated', followUp });
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
