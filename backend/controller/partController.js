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
    const {
      search,
      page = 1,
      limit = 25,
      availability = 'all',
      make = 'all',
      sort = 'newest',
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

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

    if (availability && availability !== 'all') {
      filter.availability = availability.toLowerCase();
    }

    if (make && make !== 'all') {
      filter.make = { $regex: `^${escapeRegex(make.trim())}$`, $options: 'i' };
    }

    let sortObj = { createdAt: -1, _id: -1 };
    if (sort === 'oldest') sortObj = { createdAt: 1, _id: 1 };
    else if (sort === 'price-asc') sortObj = { price: 1, _id: -1 };
    else if (sort === 'price-desc') sortObj = { price: -1, _id: -1 };
    else if (sort === 'year-desc') sortObj = { year: -1, make: 1, model: 1, _id: -1 };
    else if (sort === 'make-asc') sortObj = { make: 1, model: 1, _id: -1 };

    const [
      parts,
      totalFiltered,
      totalCount,
      inStockCount,
      distinctMakes
    ] = await Promise.all([
      Part.find(filter)
        .populate('createdBy', 'name email role')
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Part.countDocuments(filter),
      Part.countDocuments(),
      Part.countDocuments({ availability: 'in stock' }),
      Part.distinct('make'),
    ]);

    const totalPages = Math.ceil(totalFiltered / limitNum) || 1;
    const sortedMakes = (distinctMakes || [])
      .filter((m) => m && m.trim())
      .sort((a, b) => a.localeCompare(b));

    res.json({
      parts,
      pagination: {
        total: totalFiltered,
        page: pageNum,
        limit: limitNum,
        totalPages,
        hasMore: pageNum < totalPages,
      },
      metrics: {
        totalCount,
        inStockCount,
        outOfStockCount: Math.max(0, totalCount - inStockCount),
        inStockRate: totalCount > 0 ? Math.round((inStockCount / totalCount) * 100) : 0,
        availableMakes: sortedMakes,
      },
    });
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

const HEADER_ALIASES = {
  externalId: ['id', 'externalid', 'sheetid', 'sku', 'partnumber', 'partnum', 'partno', 'partcode', 'stocknumber', 'stockno', 'stocknum', 'itemnumber', 'itemno', 'code', 'productid', 'vin'],
  title: ['title', 'parttitle', 'producttitle', 'fulltitle', 'itemtitle', 'listingtitle'],
  part: ['part', 'partname', 'partrequested', 'item', 'itemname', 'partdescription', 'productname', 'component'],
  make: ['make', 'carmake', 'vehiclemake', 'brand', 'manufacturer', 'auto'],
  model: ['model', 'carmodel', 'vehiclemodel'],
  year: ['year', 'caryear', 'vehicleyear', 'yr'],
  trim: ['trim', 'edition', 'submodel', 'engine', 'specs', 'trimlevel', 'version'],
  price: ['price', 'cost', 'retailprice', 'quoteprice', 'rate', 'amount', 'usd', 'priceusd', 'partprice'],
  currency: ['currency', 'curr'],
  availability: ['availability', 'status', 'instock', 'stockstatus', 'stock', 'available', 'inventory'],
  condition: ['condition', 'grade', 'mileage', 'state', 'quality', 'notes', 'descriptioncondition'],
  productType: ['producttype', 'product_type', 'type', 'category', 'itemtype'],
  imageUrl: ['imageurl', 'image', 'photo', 'photourl', 'pic', 'picture', 'images', 'imageurls', 'photos', 'pictureurl', 'link'],
};

const normalizeGoogleSheetUrl = (rawUrl) => {
  const url = clean(rawUrl);
  if (!url) return '';

  if (url.includes('/pub?') && (url.includes('output=csv') || url.includes('output=tsv'))) {
    return url;
  }
  if (url.includes('/export?') && url.includes('format=csv')) {
    return url;
  }

  const match = url.match(/https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    const docId = match[1];
    const gidMatch = url.match(/[?&#]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv&gid=${gid}`;
  }

  return url;
};

const parseCsvContent = (text) => {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;

  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
};

const mapHeaders = (headerRow) => {
  const mapping = {};
  const cleanHeader = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  headerRow.forEach((raw, idx) => {
    const cleaned = cleanHeader(raw);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (mapping[field] === undefined && aliases.includes(cleaned)) {
        mapping[field] = idx;
      }
    }
  });

  // Secondary fuzzy match for any unmapped core fields
  headerRow.forEach((raw, idx) => {
    const cleaned = cleanHeader(raw);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (mapping[field] === undefined) {
        if (aliases.some((alias) => cleaned.includes(alias) || (alias.length > 3 && alias.includes(cleaned)))) {
          mapping[field] = idx;
        }
      }
    }
  });

  return mapping;
};

export const syncGoogleSheetParts = async (req, res) => {
  try {
    const targetUrl = normalizeGoogleSheetUrl(req.body?.sheetUrl || process.env.GOOGLE_SHEETS_PARTS_URL);

    if (!targetUrl) {
      return res.status(400).json({
        message: 'No Google Sheet CSV URL configured. Please add GOOGLE_SHEETS_PARTS_URL in backend .env or provide a Sheet URL.',
      });
    }

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'LeadCRM-PartsSync/1.0',
        Accept: 'text/csv,text/plain,*/*',
      },
    });

    if (!response.ok) {
      return res.status(400).json({
        message: `Failed to fetch Google Sheet (${response.status} ${response.statusText}). Make sure the sheet is published to web as CSV.`,
      });
    }

    const csvText = await response.text();

    if (csvText.trim().startsWith('<!DOCTYPE html') || csvText.includes('<html')) {
      return res.status(400).json({
        message: 'Received HTML instead of CSV. Ensure your Google Sheet is published via File > Share > Publish to web > CSV.',
      });
    }

    const rows = parseCsvContent(csvText);
    if (rows.length < 2) {
      return res.status(400).json({
        message: 'The Google Sheet is empty or missing data rows.',
      });
    }

    const headerRow = rows[0];
    const mapping = mapHeaders(headerRow);

    if (mapping.part === undefined || mapping.make === undefined || mapping.model === undefined || mapping.year === undefined) {
      return res.status(400).json({
        message: 'Google Sheet must contain columns for Part, Make, Model, and Year.',
        detectedHeaders: headerRow,
      });
    }

    let createdCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const errors = [];
    const operations = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const getVal = (field) => (mapping[field] !== undefined ? clean(row[mapping[field]]) : '');

      const externalId = getVal('externalId');
      const customTitle = getVal('title');
      const partName = getVal('part');
      const make = getVal('make');
      const model = getVal('model');
      const year = getVal('year');
      const trim = getVal('trim');
      const rawPrice = getVal('price');
      const currency = getVal('currency') || 'USD';
      const availability = normalizeAvailability(getVal('availability'));
      const condition = getVal('condition');
      const productType = getVal('productType');
      const rawImages = getVal('imageUrl');

      if (!make || !model || !year || !partName) {
        skippedCount++;
        continue;
      }

      // Parse price
      const cleanPrice = String(rawPrice).replace(/[^0-9.-]/g, '');
      const parsedPrice = parseFloat(cleanPrice);
      const price = Number.isFinite(parsedPrice) ? Math.max(0, parsedPrice) : 0;

      // Parse images (separated by comma, semicolon, space, or pipe)
      const imagesList = rawImages
        ? rawImages.split(/[\s,;|]+/).map(clean).filter((url) => url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/'))
        : [];
      const primaryImage = imagesList[0] || '';

      const partData = {
        title: customTitle || buildPartTitle({ part: partName, year, make, model, trim }),
        part: partName,
        make,
        model,
        year,
        trim,
        price,
        currency: currency.toUpperCase(),
        availability,
        condition,
        productType,
        imageUrl: primaryImage,
        imageUrls: imagesList.slice(0, 4),
      };

      if (externalId) {
        operations.push({
          updateOne: {
            filter: { externalId },
            update: {
              $set: {
                ...partData,
                externalId,
              },
              $setOnInsert: {
                createdBy: req.user?.id || null,
              },
            },
            upsert: true,
          },
        });
      } else {
        operations.push({
          updateOne: {
            filter: {
              make,
              model,
              year: String(year).trim(),
              part: partName,
              ...(trim ? { trim } : {}),
            },
            update: {
              $set: partData,
              $setOnInsert: {
                createdBy: req.user?.id || null,
              },
            },
            upsert: true,
          },
        });
      }
    }

    const BATCH_SIZE = 2500;
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = operations.slice(i, i + BATCH_SIZE);
      try {
        const resBatch = await Part.bulkWrite(batch, { ordered: false });
        createdCount += (resBatch.upsertedCount || 0) + (resBatch.insertedCount || 0);
        updatedCount += (resBatch.modifiedCount || 0) + (resBatch.matchedCount || 0);
      } catch (batchErr) {
        if (errors.length < 5) {
          errors.push(`Batch error at rows ${i}-${i + BATCH_SIZE}: ${batchErr.message}`);
        }
      }
    }

    const totalProcessed = createdCount + updatedCount;

    res.json({
      message: `Successfully synced ${totalProcessed} parts from Google Sheet (${createdCount} added/upserted, ${updatedCount} updated, ${skippedCount} skipped).`,
      stats: {
        totalRows: rows.length - 1,
        imported: createdCount,
        updated: updatedCount,
        skipped: skippedCount,
        errors,
      },
    });
  } catch (error) {
    console.error('Google Sheet Sync Error:', error);
    res.status(500).json({ message: error.message || 'Failed to sync with Google Sheet' });
  }
};

export const getGoogleSheetSyncConfig = (req, res) => {
  const envUrl = process.env.GOOGLE_SHEETS_PARTS_URL || '';
  const isConfigured = Boolean(envUrl.trim());

  res.json({
    isConfigured,
    maskedUrl: isConfigured
      ? envUrl.length > 25
        ? `${envUrl.slice(0, 18)}...${envUrl.slice(-8)}`
        : envUrl
      : '',
  });
};
