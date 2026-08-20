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
    const { make, model, year, partRequested, price, availability, imageUrl, imageUrls } = req.body;
    const numericPrice = Number(price);
    const normalizedAvailability = String(availability || 'in stock').trim().toLowerCase();

    if (!make?.trim() || !model?.trim() || !year?.trim() || !partRequested?.trim()) {
      return res.status(400).json({ message: 'Make, model, year, and part requested are required' });
    }

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ message: 'A valid price is required' });
    }

    if (!['in stock', 'out of stock'].includes(normalizedAvailability)) {
      return res.status(400).json({ message: 'Availability must be in stock or out of stock' });
    }

    const images = Array.isArray(imageUrls)
      ? imageUrls.map((u) => String(u).trim()).filter(Boolean).slice(0, 4)
      : (imageUrl?.trim() ? [imageUrl.trim()] : []);
    const primaryImage = images.length > 0 ? images[0] : (imageUrl?.trim() || '');

    const part = await Part.create({
      make: make.trim(),
      model: model.trim(),
      year: year.trim(),
      partRequested: partRequested.trim(),
      price: numericPrice,
      availability: normalizedAvailability,
      imageUrl: primaryImage,
      imageUrls: images,
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
      .limit(500)
      .lean();

    res.json(parts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePart = async (req, res) => {
  try {
    const { make, model, year, partRequested, price, availability, imageUrl, imageUrls } = req.body;
    const numericPrice = Number(price);
    const normalizedAvailability = String(availability || 'in stock').trim().toLowerCase();

    if (!make?.trim() || !model?.trim() || !year?.trim() || !partRequested?.trim()) {
      return res.status(400).json({ message: 'Make, model, year, and part requested are required' });
    }

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({ message: 'A valid price is required' });
    }

    if (!['in stock', 'out of stock'].includes(normalizedAvailability)) {
      return res.status(400).json({ message: 'Availability must be in stock or out of stock' });
    }

    const images = Array.isArray(imageUrls)
      ? imageUrls.map((u) => String(u).trim()).filter(Boolean).slice(0, 4)
      : (imageUrl !== undefined ? (imageUrl?.trim() ? [imageUrl.trim()] : []) : undefined);
    const primaryImage = images !== undefined
      ? (images.length > 0 ? images[0] : '')
      : (imageUrl !== undefined ? imageUrl.trim() : undefined);

    const updateData = {
      make: make.trim(),
      model: model.trim(),
      year: year.trim(),
      partRequested: partRequested.trim(),
      price: numericPrice,
      availability: normalizedAvailability,
    };

    if (primaryImage !== undefined) updateData.imageUrl = primaryImage;
    if (images !== undefined) updateData.imageUrls = images;

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

