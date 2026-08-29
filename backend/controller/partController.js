import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Part from '../model/Part.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
const partUploadsDir = path.join(uploadsRoot, 'parts');

const allowedImageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/svg+xml', 'svg'],
  ['image/avif', 'avif'],
]);
const maxImageBytes = 10 * 1024 * 1024; // 10MB

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (value) => String(value ?? '').trim();

const normalizeAvailability = (value) => {
  const normalized = clean(value || 'in stock').toLowerCase();
  if (['in stock', 'available', 'yes', 'true', '1'].includes(normalized)) return 'in stock';
  if (['out of stock', 'unavailable', 'no', 'false', '0'].includes(normalized)) return 'out of stock';
  return normalized;
};

const buildPartTitle = ({ part, year, make, model, trim }) => (
  [part, year, make, model, trim].filter(Boolean).join(' - ')
);

const normalizePartPayload = (body, userId) => {
  const partName = clean(body.part);
  const make = clean(body.make);
  const model = clean(body.model);
  const year = clean(body.year);
  const trim = clean(body.trim);
  const title = clean(body.title) || buildPartTitle({ part: partName, year, make, model, trim });
  const price = Number(body.price);
  const availability = normalizeAvailability(body.availability);

  const images = Array.isArray(body.imageUrls)
    ? body.imageUrls.map((u) => clean(u)).filter(Boolean).slice(0, 4)
    : (clean(body.imageUrl) ? [clean(body.imageUrl)] : []);

  return {
    data: {
      externalId: clean(body.externalId ?? body.id),
      title,
      part: partName,
      make,
      model,
      year,
      trim,
      price,
      currency: clean(body.currency || 'USD').toUpperCase(),
      availability,
      condition: clean(body.condition),
      productType: clean(body.productType ?? body.product_type),
      imageUrl: images[0] || clean(body.imageUrl),
      imageUrls: images,
      createdBy: userId || null,
    },
    partName,
    make,
    model,
    year,
    price,
    availability,
  };
};

const validatePartPayload = ({ partName, make, model, year, price, availability }) => {
  if (!make || !model || !year || !partName) {
    return 'Make, model, year, and part are required';
  }

  if (!Number.isFinite(price) || price < 0) {
    return 'A valid price is required';
  }

  if (!['in stock', 'out of stock'].includes(availability)) {
    return 'Availability must be in stock or out of stock';
  }

  return null;
};

const handleDuplicateKey = (error, res) => {
  if (error?.code === 11000) {
    return res.status(409).json({ message: 'A part with this sheet id already exists' });
  }
  return res.status(500).json({ message: error.message });
};

export const uploadPartImage = async (req, res) => {
  try {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    const extension = allowedImageTypes.get(contentType);

    if (!extension) {
      return res.status(400).json({ message: 'Please upload a valid JPG, PNG, GIF, WebP, SVG, or AVIF image.' });
    }

    if (!req.body || !req.body.length) {
      return res.status(400).json({ message: 'Image file data is required.' });
    }

    if (req.body.length > maxImageBytes) {
      return res.status(400).json({ message: 'Image must be 10MB or smaller.' });
    }

    await fs.mkdir(partUploadsDir, { recursive: true });

    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${extension}`;
    const filePath = path.join(partUploadsDir, fileName);
    await fs.writeFile(filePath, req.body);

    const imageUrl = `/uploads/parts/${fileName}`;

    res.status(201).json({
      message: 'Image uploaded successfully',
      imageUrl,
    });
  } catch (error) {
    console.error('Upload Part Image Error:', error);
    res.status(500).json({ message: error.message || 'Failed to upload image' });
  }
};

export const createPart = async (req, res) => {
  try {
    const normalized = normalizePartPayload(req.body, req.user?.id);
    const validationError = validatePartPayload(normalized);
    if (validationError) return res.status(400).json({ message: validationError });

    const part = await Part.create(normalized.data);
    res.status(201).json({ message: 'Part added', part });
  } catch (error) {
    handleDuplicateKey(error, res);
  }
};

export const getParts = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = {};

    if (search?.trim()) {
      const regex = { $regex: escapeRegex(search.trim()), $options: 'i' };
      filter.$or = [
        { externalId: regex },
        { title: regex },
        { part: regex },
        { make: regex },
        { model: regex },
        { year: regex },
        { trim: regex },
        { condition: regex },
        { productType: regex },
      ];
    }

    const parts = await Part.find(filter)
      .populate('createdBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    res.json(parts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePart = async (req, res) => {
  try {
    const normalized = normalizePartPayload(req.body, req.user?.id);
    const validationError = validatePartPayload(normalized);
    if (validationError) return res.status(400).json({ message: validationError });

    const updateData = { ...normalized.data };
    delete updateData.createdBy;

    if (!updateData.externalId) delete updateData.externalId;

    const part = await Part.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate('createdBy', 'name email role');

    if (!part) {
      return res.status(404).json({ message: 'Part not found' });
    }

    res.json({ message: 'Part updated', part });
  } catch (error) {
    handleDuplicateKey(error, res);
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
