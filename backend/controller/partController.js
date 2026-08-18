import Part from '../model/Part.js';

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const createPart = async (req, res) => {
  try {
    const { make, model, year, partRequested, price } = req.body;
    const numericPrice = Number(price);

    if (!make?.trim() || !model?.trim() || !year?.trim() || !partRequested?.trim()) {
      return res.status(400).json({ message: 'Make, model, year, and part requested are required' });
    }

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ message: 'A valid price is required' });
    }

    const part = await Part.create({
      make: make.trim(),
      model: model.trim(),
      year: year.trim(),
      partRequested: partRequested.trim(),
      price: numericPrice,
      createdBy: req.user?.id || null,
    });

    res.status(201).json({ message: 'Part added', part });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getParts = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search?.trim()) {
      const regex = { $regex: escapeRegex(search.trim()), $options: 'i' };
      filter.$or = [
        { make: regex },
        { model: regex },
        { year: regex },
        { partRequested: regex },
      ];
    }

    const parts = await Part.find(filter)
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json(parts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deletePart = async (req, res) => {
  try {
    const part = await Part.findByIdAndDelete(req.params.id);

    if (!part) {
      return res.status(404).json({ message: 'Part not found' });
    }

    res.json({ message: 'Part deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
