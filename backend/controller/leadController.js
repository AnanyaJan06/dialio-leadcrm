import Lead from '../model/Lead.js';

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
      assignedTo: req.user?.id || null,
    });

    res.status(201).json({ message: 'Lead created', lead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getLeads = async (req, res) => {
  try {
    const leads = await Lead.find()
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

    res.json({ message: 'Lead status updated', lead });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};