import Lead from '../model/Lead.js';

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
