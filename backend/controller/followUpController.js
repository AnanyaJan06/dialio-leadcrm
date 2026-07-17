import FollowUp from '../model/FollowUp.js';

export const createFollowUp = async (req, res) => {
  try {
    const { name, phone, note, followUpDate } = req.body;

    if (!name || !note || !followUpDate) {
      return res.status(400).json({ message: 'Name, note, and follow-up date are required' });
    }

    const followUp = await FollowUp.create({
      user: req.user.id,
      name,
      phone,
      note,
      followUpDate
    });

    res.status(201).json({ message: 'Follow-up created', followUp });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getFollowUps = async (req, res) => {
  try {
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

    res.json({ message: 'Follow-up deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
