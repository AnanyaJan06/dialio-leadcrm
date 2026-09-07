import twilio from 'twilio';
import mongoose from 'mongoose';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import MessageLog from '../model/MessageLog.js';
import Lead from '../model/Lead.js';
import Part from '../model/Part.js';
import TwilioNumber from '../model/TwilioNumber.js';
import { buildMessageAccessQuery } from '../utils/messageAccess.js';
import { buildPaginatedResponse, parseBeforeDate, parseLimit } from '../utils/pagination.js';
import { buildPhoneOrFilter, buildPhonePatterns, toStandardE164 } from '../utils/phoneMatch.js';
import { getAssignedNumberForUser } from '../utils/twilioNumbers.js';
import { createTextResponse, getOpenAIModel } from '../services/openaiService.js';
import User from '../model/User.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '..', 'uploads');
const messageUploadsDir = path.join(uploadsRoot, 'messages');
const allowedImageTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp']
]);
const maxImageBytes = 5 * 1024 * 1024;
const defaultGreetingReply = 'Hello';
const unknownNumberGreeting = 'Hello! How can I help you find the right parts for your vehicle today?';
const autoReplyCooldownMs = Math.max(0, Number(process.env.AI_AUTO_REPLY_COOLDOWN_MS) || 120000);
const autoReplyEnabled = String(process.env.AI_AUTO_REPLY_WHEN_AGENT_OFFLINE || 'true').toLowerCase() !== 'false';
const optOutPattern = /\b(stop|unsubscribe|cancel|end|quit|do not contact|don't contact|do not text|don't text)\b/i;

const getEditDistance = (left = '', right = '') => {
  const a = String(left || '');
  const b = String(right || '');
  const rows = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost
      );
    }
  }

  return rows[a.length][b.length];
};

const getSimpleGreetingReply = (text = '') => {
  const normalized = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  const fillerWords = new Set(['there', 'sir', 'mam', 'maam', 'madam', 'friend', 'team']);
  const words = normalized.split(' ').filter(Boolean);
  const coreWords = words.filter((word) => !fillerWords.has(word));

  if (!coreWords.length || words.length > 5) return null;

  const greetingWords = new Set([
    'hi',
    'hy',
    'hai',
    'hey',
    'hello',
    'helo',
    'heloo',
    'helloo',
    'hlo',
    'hii',
    'hiii',
    'hola',
    'greetings',
    'yo',
  ]);
  const timeGreetingWords = coreWords.filter((word) => !greetingWords.has(word));
  const phraseWords = timeGreetingWords.length ? timeGreetingWords : coreWords;
  const corePhrase = phraseWords.join(' ');
  const compactPhrase = phraseWords.join('');
  const phraseMatches = (phrases) => phrases.some((phrase) => {
    const phraseValue = String(phrase || '').replace(/\s+/g, '');
    if (phrase === corePhrase || phraseValue === compactPhrase) return true;

    const maxDistance = phraseValue.length <= 4 ? 1 : 2;
    const isCloseTypo = Math.abs(phraseValue.length - compactPhrase.length) <= maxDistance
      && getEditDistance(compactPhrase, phraseValue) <= maxDistance;
    const isMissingEnding = compactPhrase.length >= 6
      && phraseValue.startsWith(compactPhrase)
      && phraseValue.length - compactPhrase.length <= 4;

    return isCloseTypo || isMissingEnding;
  });

  if (phraseMatches(['good morning', 'gud morning', 'goodmorning', 'gudmorning', 'gdmorning', 'goodmorn', 'gudmorn', 'gm', 'mrng', 'morn', 'morning'])) {
    return 'Good morning';
  }

  if (phraseMatches(['good afternoon', 'gud afternoon', 'goodafternoon', 'gudafternoon', 'ga', 'afternoon'])) {
    return 'Good afternoon';
  }

  if (phraseMatches(['good evening', 'gud evening', 'goodevening', 'gudevening', 'ge', 'evening'])) {
    return 'Good evening';
  }

  if (phraseMatches(['good night', 'gud night', 'goodnight', 'gudnight', 'gn', 'night'])) {
    return 'Good night';
  }

  if (phraseMatches(['whats up', 'what s up', 'wassup', 'sup'])) {
    return 'Hello';
  }

  return coreWords.length <= 3 && coreWords.every((word) => greetingWords.has(word))
    ? 'Hello'
    : null;
};

const AUTO_PARTS_ASSISTANT_INSTRUCTIONS = `You are the customer support assistant for an auto-parts business. You reply to customer inquiries via SMS like a real, helpful human being.

Core Guidelines:
1. Brevity & Tone: Keep replies short, natural, friendly, and human (1 to 2 short sentences, under 160 characters). Never use robotic greetings, fluff, or emojis.
2. Part Inquiries & Availability:
   - When vehicle model and/or year are missing: Ask for the model and year before checking stock or variants (e.g., "What model and year is your Nissan?"). Never ask about engine displacement or transmission variants until model and year are known.
   - When a part is in stock and fitment is clear: Reply exactly "Yes, we have it in stock." (or include price if they also asked for price, e.g., "Yes, we have it in stock for $1,250.").
   - When a part is not in stock or not found: Reply exactly "Let me check and update you shortly."
   - When multiple variants match the customer's vehicle (e.g., different engine sizes or transmission types for that specific vehicle): Ask a short, human clarifying question (e.g. "Is yours 1.5L turbo or 2.0L non-turbo? Also automatic or manual?").
3. Common Questions & Typos:
   - Price inquiries (e.g., "price?", "how much?", "/price"): Reply in the format "<Part Title> - $<Price.toFixed(2)>" (e.g., "2019 Honda Civic 2.0L non-turbo CVT Automatic Transmission - $1250.00"). If not in catalog, reply "Let me check and update you shortly."
   - Warranty inquiries: Confirm OEM parts include a standard 30-90 day replacement warranty.
   - Mileage inquiries: Confirm mechanical parts are tested OEM units with verified low mileage.
   - Shipping inquiries: When the customer asks about shipping, first ask "Shipping address?". Once the customer provides their shipping address or zip code, reply "Shipping takes about 7-14 days."
   - Order confirmation / Placing orders: Reply "Our representative will contact you soon for confirming the order."
   - Photo requests: Reply "Our representative will send you the picture of the required part when they are online."
4. Opt-Out Safety: If the customer asks to stop, unsubscribe, cancel, or opt out, return an empty draft ("") with safeToAutoSend: false and intent: "opt_out".`;

export const detectInquiryTopics = (text = '') => {
  const raw = String(text || '').trim().toLowerCase();
  if (!raw) return [];

  const topics = [];

  // Price inquiries: price, prce, cost, quote, how much, how much is, rate, /price, $
  if (
    /\b(price|prce|prices|pricing|cost|costs|costing|how\s*much|quote|quotes|quotation|rate|rates|\$)\b/i.test(raw) ||
    /^\/?(price|prce|cost|quote|pricing|rate)\b/i.test(raw) ||
    /\bprice\s+please\b/i.test(raw)
  ) {
    topics.push('price');
  }

  // Warranty inquiries: warranty, warrany (typo), waranty, warenty, warrenty, warranti, guarantee
  if (
    /\b(warranty|warrany|waranty|warenty|warrenty|warranti|warranties|guarantee|guaranty)\b/i.test(raw) ||
    /^\/?(warranty|warrany|waranty|warenty|warrenty|warranti|guarantee)\b/i.test(raw) ||
    /\bwarran(ty|y)\s+please\b/i.test(raw)
  ) {
    topics.push('warranty');
  }

  // Mileage inquiries: mileage, milage (typo), milleage, millage, miles, mile, odometer
  if (
    /\b(mileage|milage|milleage|millage|miles|mile|odometer|how\s*many\s*miles)\b/i.test(raw) ||
    /^\/?(mileage|milage|milleage|millage|miles|mile)\b/i.test(raw) ||
    /\bmil(e|)(age|es)\s+please\b/i.test(raw)
  ) {
    topics.push('mileage');
  }

  // Shipping inquiries: shipping, ship, delivery, dispatch, eta, transit
  if (
    /\b(shipping|ship|shipped|delivery|deliver|delivered|dispatch|eta|transit|how\s*long\s*(to|does|will)?\s*(ship|take|deliver))\b/i.test(raw) ||
    /^\/?(shipping|delivery|ship)\b/i.test(raw)
  ) {
    topics.push('shipping');
  }

  // Availability & part inquiries: available, in stock, instock, do you have, have it, looking for, or mentioning vehicle parts
  if (
    /\b(available|availability|in\s*stock|instock|do\s*you\s*have|have\s*it|got\s*it|looking\s*for|need|want)\b/i.test(raw) ||
    /\b(transmission|transmition|transmision|tranny|trans|gearbox|engine|motor|engin|alternator|starter|compressor|headlight|taillight|bumper|hood|fender|door|mirror|radiator|axle|strut|shock|transfer\s*case|differential|ecm|ecu|pcm)\b/i.test(raw) ||
    /^\/?(available|stock|part)\b/i.test(raw)
  ) {
    topics.push('availability');
  }

  // Order confirmation / placing order inquiries
  if (
    /\b(confirm(\s*(the|my|this))?\s*order|placing(\s*(the|my|an|this))?\s*order|place(\s*(the|my|an|this))?\s*order|proceed(\s*with)?(\s*(the|my|their|this))?\s*order|ready\s*to\s*order|want\s*to\s*(order|buy|purchase)|order\s*now|book(\s*(the|my|this))?\s*order|take(\s*(the|my|this))?\s*order|i('?m| am|am)\s*placing|i\s*need\s*to\s*confirm|i('?ll| will)?\s*take\s*it|i\s*want\s*to\s*buy|let('?s|\s*us)?\s*proceed)\b/i.test(raw) ||
    /^\/?(order|buy|confirm|purchase)\b/i.test(raw)
  ) {
    topics.push('order');
  }

  // Photo / Picture inquiries
  if (
    /\b(photo|photos|picture|pictures|pic|pics|image|images|img|show\s*me|send\s*(me)?\s*(the|a)?\s*(picture|photo|pic|image)s?)\b/i.test(raw) ||
    /^\/?(photo|photos|picture|pictures|pic|pics|image|images)\b/i.test(raw)
  ) {
    topics.push('photo');
  }

  return [...new Set(topics)];
};

export const getInboundMessagesChronological = (messages = []) => {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const inbounds = messages.filter((m) => m.direction === 'inbound');
  if (!inbounds.length) return [];

  const hasDates = inbounds.some((m) => m.createdAt);
  if (hasDates) {
    return inbounds.slice().sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  }

  return inbounds.slice();
};

export const getLatestInboundMessage = (messages = []) => {
  const inbounds = getInboundMessagesChronological(messages);
  return inbounds.length ? (inbounds[inbounds.length - 1]?.body || '') : '';
};

export const getLatestOutboundMessage = (messages = []) => {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const outbounds = messages.filter((m) => m.direction === 'outbound');
  if (!outbounds.length) return '';

  const hasDates = outbounds.some((m) => m.createdAt);
  if (hasDates) {
    return outbounds.slice().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0]?.body || '';
  }

  return outbounds[outbounds.length - 1]?.body || outbounds[0]?.body || '';
};

export const hasAddressDetails = (text = '') => {
  const clean = String(text || '').trim().toLowerCase();
  if (!clean) return false;

  if (/\b\d{5}(?:-\d{4})?\b/.test(clean)) return true;
  if (/\b\d+\s+[a-z0-9\s.,]+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|lane|ln|way|ct|court|hwy|highway|pkwy|parkway|apt|suite|ste|circle|cir|trail|trl)\b/i.test(clean)) {
    return true;
  }
  const stateRegex = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|texas|california|florida|new\s*york|ohio|georgia|illinois|pennsylvania|michigan|arizona|colorado|washington|virginia|carolina)\b/i;
  if (stateRegex.test(clean) && clean.length >= 3) {
    return true;
  }
  if (/\b(p\.?o\.?\s*box)\b/i.test(clean)) return true;

  return false;
};

export const generateDirectAnswer = ({ lead, detectedTopics, partAvailability, recentMessages = [] }) => {
  if (!detectedTopics || detectedTopics.length === 0) return null;

  // Missing vehicle details or variant disambiguation takes highest priority
  if ((partAvailability?.status === 'missing_details' || partAvailability?.status === 'ambiguous') && partAvailability?.clarifyingQuestion) {
    return partAvailability.clarifyingQuestion;
  }

  const inStockMatch = partAvailability?.matches?.find(
    (p) => String(p.availability || '').toLowerCase() === 'in stock' && p.price
  ) || partAvailability?.matches?.[0];

  const hasPrice = inStockMatch && typeof inStockMatch.price === 'number' && inStockMatch.price > 0;
  const priceFormatted = hasPrice
    ? (inStockMatch.title ? `${inStockMatch.title} - $${Number(inStockMatch.price).toFixed(2)}` : `$${Number(inStockMatch.price).toFixed(2)}`)
    : null;

  const isPriceOnlyInquiry = detectedTopics.length === 1 && detectedTopics.includes('price');

  if (isPriceOnlyInquiry) {
    return priceFormatted || 'Let me check and update you shortly.';
  }

  const latestOutbound = getLatestOutboundMessage(recentMessages);
  const wasAskedAddress = /shipping\s*address\?/i.test(latestOutbound);
  const inbounds = (Array.isArray(recentMessages) ? recentMessages : []).filter((m) => m.direction === 'inbound');
  const allInboundText = inbounds.map((m) => m.body || '').join(' ');
  const latestInbound = getLatestInboundMessage(recentMessages);
  const hasProvidedAddress = Boolean(lead?.zip) || hasAddressDetails(allInboundText) || (wasAskedAddress && latestInbound.trim().length > 0);

  const isShippingOnlyInquiry = detectedTopics.length === 1 && detectedTopics.includes('shipping');
  if (isShippingOnlyInquiry) {
    return hasProvidedAddress ? 'Shipping takes about 7-14 days.' : 'Shipping address?';
  }

  const parts = [];

  // Availability / Part inquiry answer (human-like)
  if (detectedTopics.includes('availability')) {
    if (partAvailability?.status === 'available') {
      if (detectedTopics.includes('price') && priceFormatted) {
        parts.push(priceFormatted);
      } else {
        parts.push('Yes, we have it in stock.');
      }
    } else {
      parts.push('Let me check and update you shortly.');
    }
  } else if (detectedTopics.includes('price')) {
    if (priceFormatted) {
      parts.push(priceFormatted);
    } else {
      parts.push('Let me check and update you shortly.');
    }
  }

  // Warranty answer
  if (detectedTopics.includes('warranty')) {
    parts.push('All our tested OEM parts include a standard 30-90 day replacement warranty.');
  }

  // Mileage answer
  if (detectedTopics.includes('mileage')) {
    parts.push('Our parts are quality-tested OEM units with verified low mileage.');
  }

  // Shipping answer
  if (detectedTopics.includes('shipping')) {
    if (hasProvidedAddress) {
      parts.push('Shipping takes about 7-14 days.');
    } else {
      parts.push('Shipping address?');
    }
  }

  // Order confirmation / Placing order answer
  if (detectedTopics.includes('order')) {
    parts.push('Our representative will contact you soon for confirming the order.');
  }

  // Photo / Picture answer
  if (detectedTopics.includes('photo')) {
    parts.push('Our representative will send you the picture of the required part when they are online.');
  }

  if (parts.length === 0) return null;

  return parts.join(' ');
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getTwilioClient = () => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    throw new Error('Twilio SMS credentials are not configured');
  }

  return twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
};

const getSenderConfig = async (userId) => {
  const assignedNumber = await getAssignedNumberForUser(userId);
  if (assignedNumber) {
    return { from: assignedNumber };
  }

  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    return { messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID };
  }

  if (!process.env.TWILIO_PHONE_NUMBER) {
    throw new Error('Twilio sender number is not configured');
  }

  return { from: process.env.TWILIO_PHONE_NUMBER };
};

const getPublicBaseUrl = () => (process.env.BASE_URL || '').replace(/\/$/, '');

const toPublicMediaUrl = (url) => {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;

  const baseUrl = getPublicBaseUrl();
  if (!baseUrl) return '';

  return `${baseUrl}${value.startsWith('/') ? value : `/${value}`}`;
};

const normalizeMediaUrls = (mediaUrls) => {
  if (!Array.isArray(mediaUrls)) return [];

  return mediaUrls
    .map((url) => String(url || '').trim())
    .filter(Boolean)
    .slice(0, 10);
};

const resolveLeadForMessage = async ({ leadId, phoneNumber }) => {
  if (mongoose.isValidObjectId(leadId)) {
    const lead = await Lead.findById(leadId).select('_id');
    if (lead?._id) return lead._id;
  }

  if (!phoneNumber) return undefined;

  const lead = await Lead.findOne(buildPhoneOrFilter(phoneNumber, ['phone']))
    .select('_id')
    .sort({ updatedAt: -1 });

  return lead?._id;
};

const extractResponseText = (response) => {
  if (typeof response?.output_text === 'string') return response.output_text;

  const parts = response?.output
    ?.flatMap((item) => item.content || [])
    ?.map((content) => content.text || '')
    ?.filter(Boolean);

  if (parts?.length) return parts.join('\n').trim();

  if (response?.choices?.[0]?.message?.content) {
    return response.choices[0].message.content.trim();
  }

  return '';
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    const match = String(value || '').match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  }
};

const formatLeadForAi = (lead) => ({
  name: lead?.name || '',
  phone: lead?.phone || '',
  email: lead?.email || '',
  zip: lead?.zip || '',
  partRequested: lead?.partRequested || '',
  make: lead?.make || '',
  model: lead?.model || '',
  year: lead?.year || '',
  yearMakeModel: lead?.yearMakeModel || `${lead?.year || ''} ${lead?.make || ''} ${lead?.model || ''}`.trim(),
  disposition: lead?.disposition || '',
  notes: lead?.notes || '',
  followUpAt: lead?.followUpAt || '',
  followUpNote: lead?.followUpNote || '',
  source: lead?.source || '',
});

const formatRecentMessagesForAi = (messages) => messages
  .slice()
  .reverse()
  .map((message) => ({
    direction: message.direction,
    body: message.body || (message.mediaUrls?.length ? '[image message]' : ''),
    status: message.status || '',
    at: message.createdAt,
  }));

const formatPriceForSms = (price, currency = 'USD') => {
  if (typeof price !== 'number') return price ? `${currency} ${price}` : 'Quote required';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(price) ? 0 : 2,
  }).format(price);
};

const formatPartForAi = (part) => {
  const partName = part.part || part.title || '';
  const currency = part.currency || 'USD';

  return {
    title: part.title || '',
    make: part.make || '',
    model: part.model || '',
    year: part.year || '',
    trim: part.trim || '',
    part: partName,
    price: part.price,
    priceFormatted: formatPriceForSms(part.price, currency),
    availability: part.availability || 'in stock',
    condition: part.condition || '',
  };
};

const hasPhotoRequest = (...values) => {
  const text = values.map((value) => String(value || '')).join(' ').toLowerCase();
  return /\b(photo|photos|picture|pictures|pic|pics|image|images|img|show me|send.*(it|one|them))\b/.test(text);
};

const getSuggestedPartMediaUrls = () => [];

const buildRegexFilter = (field, value, exact = false) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  return {
    [field]: {
      $regex: exact ? `^${escapeRegex(trimmed)}$` : escapeRegex(trimmed),
      $options: 'i',
    },
  };
};

export const PART_KEYWORDS = {
  'transfer case': ['transfer case', 'transfercase', 'transfer-case', 't-case', 't case'],
  transmission: ['transmission', 'transmition', 'transmision', 'tranny', 'trans', 'gearbox'],
  differential: ['differential', 'diff', 'carrier'],
  engine: ['engine', 'motor', 'engin', 'longblock'],
  alternator: ['alternator', 'alternater'],
  starter: ['starter'],
  compressor: ['compressor', 'compresser', 'ac compressor', 'a/c compressor'],
  headlight: ['headlight', 'head light', 'headlamp', 'head lamp'],
  taillight: ['taillight', 'tail light', 'taillamp'],
  bumper: ['bumper', 'front bumper', 'rear bumper'],
  hood: ['hood'],
  fender: ['fender'],
  door: ['door', 'doors'],
  mirror: ['mirror', 'side mirror'],
  radiator: ['radiator'],
  axle: ['axle'],
  strut: ['strut'],
  shock: ['shock', 'shocks'],
};

export const COMMON_MAKES = [
  'acura', 'audi', 'bmw', 'buick', 'cadillac', 'chevrolet', 'chevy', 'chrysler',
  'dodge', 'ford', 'gmc', 'honda', 'hyundai', 'infiniti', 'jeep', 'kia',
  'lexus', 'lincoln', 'mazda', 'mercedes', 'mercedes-benz', 'mercury', 'mini',
  'mitsubishi', 'nissan', 'pontiac', 'porsche', 'ram', 'subaru', 'toyota',
  'volkswagen', 'vw', 'volvo'
];

export const COMMON_MODELS_MAP = {
  // Nissan
  altima: 'nissan', maxima: 'nissan', sentra: 'nissan', rogue: 'nissan', pathfinder: 'nissan',
  murano: 'nissan', titan: 'nissan', frontier: 'nissan', versa: 'nissan', armada: 'nissan',
  kicks: 'nissan', quest: 'nissan', juke: 'nissan', xterra: 'nissan',
  // Toyota
  camry: 'toyota', corolla: 'toyota', rav4: 'toyota', highlander: 'toyota', tacoma: 'toyota',
  tundra: 'toyota', '4runner': 'toyota', sienna: 'toyota', prius: 'toyota', sequoia: 'toyota',
  avalon: 'toyota', yaris: 'toyota', venza: 'toyota', matrix: 'toyota',
  // Honda
  civic: 'honda', accord: 'honda', 'cr-v': 'honda', crv: 'honda', pilot: 'honda',
  odyssey: 'honda', fit: 'honda', ridgeline: 'honda', passport: 'honda', hrv: 'honda', 'hr-v': 'honda',
  // Ford
  f150: 'ford', 'f-150': 'ford', f250: 'ford', 'f-250': 'ford', f350: 'ford', 'f-350': 'ford',
  mustang: 'ford', explorer: 'ford', escape: 'ford', edge: 'ford', fusion: 'ford', focus: 'ford',
  taurus: 'ford', ranger: 'ford', expedition: 'ford',
  // Chevy / Chevrolet
  silverado: 'chevy', tahoe: 'chevy', suburban: 'chevy', malibu: 'chevy', impala: 'chevy',
  equinox: 'chevy', colorado: 'chevy', camaro: 'chevy', corvette: 'chevy', cruze: 'chevy', traverse: 'chevy',
  // Jeep
  wrangler: 'jeep', cherokee: 'jeep', 'grand cherokee': 'jeep', compass: 'jeep', renegade: 'jeep', comanche: 'jeep',
  // Dodge / Ram
  charger: 'dodge', challenger: 'dodge', durango: 'dodge', ram: 'ram', colt: 'dodge',
  // Subaru
  outback: 'subaru', forester: 'subaru', impreza: 'subaru', legacy: 'subaru', crosstrek: 'subaru',
  // Volkswagen
  jetta: 'volkswagen', golf: 'volkswagen', passat: 'volkswagen', tiguan: 'volkswagen', atlas: 'volkswagen', beetle: 'volkswagen',
  // GMC
  sierra: 'gmc', yukon: 'gmc', canyon: 'gmc', acadia: 'gmc', terrain: 'gmc', jimmy: 'gmc',
};

const VEHICLE_STOP_WORDS = new Set([
  'for', 'the', 'a', 'an', 'in', 'stock', 'do', 'you', 'have', 'with', 'is', 'to',
  'need', 'as', 'well', 'what', 'about', 'how', 'much', 'it', 'its', 'my', 'car',
  'vehicle', 'truck', 'auto', 'any', 'got', 'looking', 'please', 'thanks', 'thank',
  'can', 'get', 'of', 'and', 'or', 'at', 'on', 'by', 'hey', 'hello', 'hi', 'yes', 'no',
  'mine', 'yours', 'year', 'model', 'make', 'price', 'cost', 'quote', 'check', 'give', 'tell', 'want'
]);

export const normalizePartKeyword = (word = '') => {
  const lower = String(word || '').toLowerCase();
  for (const [canonical, aliases] of Object.entries(PART_KEYWORDS)) {
    for (const alias of aliases) {
      const escaped = escapeRegex(alias).replace(/\s+/g, '\\s+');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(lower)) {
        return canonical;
      }
    }
  }
  return null;
};

export const extractVehicleDetails = (lead, recentMessages = []) => {
  const inbounds = getInboundMessagesChronological(recentMessages);
  const latestInbound = inbounds.length ? (inbounds[inbounds.length - 1]?.body || '') : '';
  const latestLower = latestInbound.toLowerCase();

  // 1. Check if the latest message specifically mentions a new part
  const partInLatest = normalizePartKeyword(latestLower);
  let partRequested = partInLatest || '';

  if (!partRequested) {
    for (let i = inbounds.length - 1; i >= 0; i--) {
      const p = normalizePartKeyword(inbounds[i].body || '');
      if (p) {
        partRequested = p;
        break;
      }
    }
  }
  if (!partRequested && lead?.partRequested) {
    partRequested = normalizePartKeyword(lead.partRequested) || lead.partRequested;
  }

  // 2. Year extraction
  let year = '';
  const yMatchLatest = latestLower.match(/\b(19\d\d|20[0-2]\d)\b/);
  if (yMatchLatest) {
    year = yMatchLatest[1];
  } else {
    for (let i = inbounds.length - 1; i >= 0; i--) {
      const ym = (inbounds[i].body || '').match(/\b(19\d\d|20[0-2]\d)\b/);
      if (ym) {
        year = ym[1];
        break;
      }
    }
  }
  if (!year && lead?.year) year = String(lead.year).trim();

  // 3. Make extraction
  let make = '';
  for (const m of COMMON_MAKES) {
    if (new RegExp(`\\b${m}\\b`, 'i').test(latestLower)) {
      make = m === 'chevy' ? 'chevy' : (m === 'vw' ? 'volkswagen' : m);
      break;
    }
  }
  if (!make) {
    for (let i = inbounds.length - 1; i >= 0; i--) {
      const text = (inbounds[i].body || '').toLowerCase();
      for (const m of COMMON_MAKES) {
        if (new RegExp(`\\b${m}\\b`, 'i').test(text)) {
          make = m === 'chevy' ? 'chevy' : (m === 'vw' ? 'volkswagen' : m);
          break;
        }
      }
      if (make) break;
    }
  }
  if (!make && lead?.make) make = String(lead.make).trim().toLowerCase();

  // 4. Model extraction
  let model = '';

  // Check known models map across inbound messages (newest to oldest)
  for (let i = inbounds.length - 1; i >= 0; i--) {
    const text = (inbounds[i].body || '').toLowerCase();
    for (const [mName, mMake] of Object.entries(COMMON_MODELS_MAP)) {
      if (new RegExp(`\\b${escapeRegex(mName).replace(/[-]/g, '[- ]?')}\\b`, 'i').test(text)) {
        model = mName;
        if (!make) make = mMake;
        break;
      }
    }
    if (model) break;
  }

  // If model still not found, search clean candidate words in inbounds (newest to oldest)
  if (!model) {
    for (let i = inbounds.length - 1; i >= 0; i--) {
      const text = (inbounds[i].body || '').toLowerCase();
      const words = text
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

      for (const word of words) {
        if (word.length <= 1) continue;
        if (/^\d{4}$/.test(word)) continue;
        if (/^\d\.\d\s*l?$/i.test(word)) continue;
        if (word === make || (make === 'chevy' && word === 'chevrolet') || (make === 'volkswagen' && word === 'vw')) continue;
        if (COMMON_MAKES.includes(word)) continue;
        if (VEHICLE_STOP_WORDS.has(word)) continue;
        const isPart = Object.values(PART_KEYWORDS).some((aliases) =>
          aliases.some((alias) => alias.replace(/[^a-z0-9]/g, '') === word)
        );
        if (isPart) continue;
        if (['automatic', 'manual', 'cvt', 'turbo', 'hybrid', 'fwd', 'rwd', 'awd', '4wd', '4x4', 'at', 'mt'].includes(word)) continue;

        model = word;
        break;
      }
      if (model) break;
    }
  }

  if (!model && lead?.model) model = String(lead.model).trim().toLowerCase();

  // Determine relevant specs text:
  // If a new part was asked in the latest message, only use specs from the latest message.
  // If a follow-up inquiry (e.g., "how much?"), use specs since this part was requested.
  let relevantSpecsText = latestLower;
  if (!partInLatest) {
    let partSwitchIndex = -1;
    for (let i = inbounds.length - 1; i >= 0; i--) {
      if (normalizePartKeyword(inbounds[i].body || '') === partRequested) {
        partSwitchIndex = i;
        break;
      }
    }
    if (partSwitchIndex !== -1) {
      relevantSpecsText = inbounds.slice(partSwitchIndex).map((m) => m.body || '').join(' ').toLowerCase();
    } else {
      relevantSpecsText = inbounds.map((m) => m.body || '').join(' ').toLowerCase();
    }
  }

  return {
    make,
    model,
    year,
    partRequested: normalizePartKeyword(partRequested) || partRequested,
    inboundText: relevantSpecsText,
    isNewPartAsked: Boolean(partInLatest),
  };
};

const deduplicateEngineSpecs = (rawSpecs) => {
  const list = Array.from(rawSpecs).map((s) => s.trim());
  const filtered = list.filter((item) => (
    !list.some((other) => other !== item && other.toLowerCase().includes(item.toLowerCase()))
  ));
  return Array.from(new Set(filtered));
};

const analyzePartVariants = (matchingTitles = [], userQuery = '') => {
  const queryLower = String(userQuery || '').toLowerCase();
  const rawEngineSpecs = new Set();
  const transSpecs = new Set();
  const driveSpecs = new Set();

  for (const title of matchingTitles) {
    const engineMatch = title.match(/\b(\d\.\d\s*L(?:\s+(?:non-turbo|turbo|turbocharged|w\/o\s*turbo))?)\b/i);
    if (engineMatch) {
      rawEngineSpecs.add(engineMatch[1].trim());
    }

    const hasAuto = /\b(AT|Automatic|CVT|Auto)\b/i.test(title);
    const hasManual = /\b(MT|Manual|\d\s*speed\s*MT)\b/i.test(title);
    if (hasAuto && !hasManual) transSpecs.add('automatic');
    else if (hasManual && !hasAuto) transSpecs.add('manual');

    const is4WD = /\b(4x4|4wd|awd)\b/i.test(title);
    const is2WD = /\b(2wd|fwd|rwd)\b/i.test(title);
    if (is4WD) driveSpecs.add('4WD/AWD');
    if (is2WD) driveSpecs.add('2WD/FWD');
  }

  const engineSpecs = deduplicateEngineSpecs(rawEngineSpecs);
  const questions = [];

  const userHasEngine = /\b(\d\.\d\s*L?|turbo|non-turbo)\b/i.test(queryLower);
  if (engineSpecs.length > 1 && !userHasEngine) {
    const formatted = engineSpecs.map((s) => s.replace(/\bturbo\b/i, 'turbo').replace(/\bnon-turbo\b/i, 'non-turbo'));
    questions.push(`Is yours ${formatted.join(' or ')}?`);
  }

  const userHasAuto = /\b(automatic|auto|at|cvt)\b/i.test(queryLower);
  const userHasManual = /\b(manual|mt|stick|\d\s*speed)\b/i.test(queryLower);
  if (transSpecs.size > 1 && !userHasAuto && !userHasManual) {
    questions.push(questions.length > 0 ? 'Also automatic or manual?' : 'Is yours automatic or manual?');
  }

  if (driveSpecs.size > 1 && questions.length === 0) {
    const userHas4WD = /\b(4x4|4wd|awd)\b/i.test(queryLower);
    const userHas2WD = /\b(2wd|fwd|rwd)\b/i.test(queryLower);
    if (!userHas4WD && !userHas2WD) {
      questions.push('Is yours 2WD or 4WD/AWD?');
    }
  }

  return {
    isAmbiguous: questions.length > 0,
    clarifyingQuestion: questions.join(' '),
  };
};

export const findAvailablePartsForLead = async (lead, recentMessages = []) => {
  const details = extractVehicleDetails(lead, recentMessages);

  // If a part is requested, check if essential vehicle details (year, make, model) are missing
  if (details.partRequested) {
    const missingYear = !details.year;
    const missingModel = !details.model;
    const missingMake = !details.make;

    if (missingYear || missingModel || missingMake) {
      let clarifyingQuestion = '';
      const makeDisplay = details.make
        ? details.make.charAt(0).toUpperCase() + details.make.slice(1)
        : '';
      const modelDisplay = details.model
        ? details.model.charAt(0).toUpperCase() + details.model.slice(1)
        : '';

      if (missingMake && missingModel && missingYear) {
        clarifyingQuestion = 'What is the year, make, and model of your vehicle?';
      } else if (missingMake) {
        clarifyingQuestion = 'What is the year, make, and model of your vehicle?';
      } else if (missingModel && missingYear) {
        clarifyingQuestion = `What model and year is your ${makeDisplay}?`;
      } else if (missingModel) {
        clarifyingQuestion = details.year
          ? `Which model is your ${details.year} ${makeDisplay}?`
          : `Which model is your ${makeDisplay}?`;
      } else if (missingYear) {
        clarifyingQuestion = `What year is your ${makeDisplay} ${modelDisplay}?`;
      }

      return {
        status: 'missing_details',
        reason: 'Missing vehicle model or year to search parts catalog.',
        matches: [],
        isAmbiguous: true,
        clarifyingQuestion,
        reply: clarifyingQuestion,
      };
    }
  }

  const conditions = [];

  if (details.year) {
    conditions.push({ title: { $regex: details.year, $options: 'i' } });
  }

  if (details.make) {
    const makePattern = details.make === 'chevy' ? '(chevy|chevrolet)' : details.make;
    conditions.push({ title: { $regex: makePattern, $options: 'i' } });
  }

  if (details.model) {
    conditions.push({ title: { $regex: details.model, $options: 'i' } });
  }

  if (details.partRequested) {
    const partRoot = details.partRequested === 'transmission'
      ? '(transmission|\\btrans\\b)'
      : escapeRegex(details.partRequested);
    conditions.push({ title: { $regex: partRoot, $options: 'i' } });
  }

  // Only apply transmission specs if active part is transmission
  if (details.partRequested === 'transmission') {
    if (/\b(automatic|auto|cvt|at)\b/i.test(details.inboundText) && !/\b(manual|mt)\b/i.test(details.inboundText)) {
      conditions.push({ title: { $regex: '(AT|Automatic|CVT)', $options: 'i' } });
    } else if (/\b(manual|mt|stick)\b/i.test(details.inboundText) && !/\b(automatic|auto|cvt)\b/i.test(details.inboundText)) {
      conditions.push({ title: { $regex: '(MT|Manual)', $options: 'i' } });
    }
  }

  // Only apply engine displacement/turbo if part requested is engine or transmission
  if (details.partRequested === 'engine' || details.partRequested === 'transmission') {
    const engineSpecMatch = details.inboundText.match(/\b(\d\.\d\s*L?)\b/i);
    if (engineSpecMatch) {
      conditions.push({ title: { $regex: engineSpecMatch[1].replace(/\s+/g, '\\s*'), $options: 'i' } });
    }
    if (/\bnon-turbo\b/i.test(details.inboundText)) {
      conditions.push({ title: { $regex: 'non-turbo', $options: 'i' } });
    } else if (/\bturbo\b/i.test(details.inboundText)) {
      conditions.push({ title: { $regex: 'turbo', $options: 'i' } });
    }
  }

  if (!conditions.length) {
    return {
      status: 'not_checked',
      reason: 'No vehicle or part details were available to search the parts catalog.',
      matches: [],
      isAmbiguous: false,
    };
  }

  const matches = await Part.find({ $and: conditions })
    .sort({ updatedAt: -1 })
    .limit(10)
    .lean();

  if (!matches.length) {
    return {
      status: 'not_found',
      reason: 'No matching part record was found in the catalog.',
      matches: [],
      isAmbiguous: false,
      reply: 'Let me check and update you shortly.',
    };
  }

  const inStockMatches = matches.filter(
    (part) => String(part.availability || '').trim().toLowerCase() === 'in stock'
  );

  if (!inStockMatches.length) {
    return {
      status: 'out_of_stock',
      reason: 'Matching part records were found, but none are currently in stock.',
      matches: matches.map(formatPartForAi),
      isAmbiguous: false,
      reply: 'Let me check and update you shortly.',
    };
  }

  // Check if multiple variants exist that require clarification
  const variantAnalysis = analyzePartVariants(
    inStockMatches.map((m) => m.title || ''),
    details.inboundText
  );

  if (variantAnalysis.isAmbiguous) {
    return {
      status: 'ambiguous',
      reason: 'Multiple matching part variants found in stock.',
      matches: inStockMatches.map(formatPartForAi),
      isAmbiguous: true,
      clarifyingQuestion: variantAnalysis.clarifyingQuestion,
      reply: variantAnalysis.clarifyingQuestion,
    };
  }

  return {
    status: 'available',
    reason: 'Matching in-stock part record found in the catalog.',
    matches: inStockMatches.map(formatPartForAi),
    isAmbiguous: false,
    reply: 'Yes, we have it in stock.',
  };
};

export const generateAiReply = async ({ lead, recentMessages = [], instruction = 'reply_to_latest_message', automatic = false }) => {
  const latestInbound = getLatestInboundMessage(recentMessages);
  const latestOutbound = getLatestOutboundMessage(recentMessages);
  const wasAskedShippingAddress = /shipping\s*address\?/i.test(latestOutbound);

  const textToAnalyze = [instruction !== 'reply_to_latest_message' && instruction !== 'follow_up' ? instruction : '', latestInbound]
    .filter(Boolean)
    .join(' ');
  const detectedTopics = detectInquiryTopics(textToAnalyze || latestInbound || instruction);

  if (wasAskedShippingAddress && latestInbound.trim().length > 0 && !detectedTopics.includes('shipping')) {
    detectedTopics.push('shipping');
  }

  const partAvailability = await findAvailablePartsForLead(lead, recentMessages);
  const directReply = generateDirectAnswer({ lead, detectedTopics, partAvailability, recentMessages });
  const isDirectPriceOnlyReply = detectedTopics.length === 1
    && detectedTopics.includes('price')
    && Boolean(directReply);

  const isDirectShippingOnlyReply = detectedTopics.length === 1
    && detectedTopics.includes('shipping')
    && Boolean(directReply);

  // Return direct answer immediately for missing details, part availability, price, or shipping inquiries (short, human-like)
  const isDirectReplyReady = directReply && (
    partAvailability?.status === 'missing_details' ||
    isDirectPriceOnlyReply ||
    isDirectShippingOnlyReply ||
    (detectedTopics.includes('availability') && !detectedTopics.some((t) => ['warranty', 'mileage', 'shipping', 'order', 'photo'].includes(t)))
  );

  if (isDirectReplyReady) {
    return {
      draft: directReply,
      intent: partAvailability?.status === 'missing_details' ? 'qualify_lead' : 'answer_question',
      safeToAutoSend: true,
      reason: isDirectShippingOnlyReply ? 'Shipping inquiry answer' : (partAvailability.reason || 'Part availability / price answer'),
      partAvailability,
      suggestedMediaUrls: [],
    };
  }

  const suggestedMediaUrls = automatic
    ? []
    : getSuggestedPartMediaUrls({
      partAvailability,
      recentMessages,
      instruction,
    });

  const aiInput = {
    task: automatic
      ? 'Generate one safe SMS reply that may be automatically sent to this CRM lead.'
      : 'Draft one SMS reply for a CRM lead. Do not send it.',
    requestedInstruction: String(instruction || 'follow_up').slice(0, 240),
    detectedCustomerTopics: detectedTopics,
    lead: formatLeadForAi(lead),
    recentMessages: formatRecentMessagesForAi(recentMessages),
    partAvailability,
    rules: [
      'Return JSON only.',
      'Keep replies brief, short, concise, and customer-focused (under 160 characters, typically 1-2 short sentences).',
      'Sound natural, polite, and like a real human being. Avoid robotic greetings or fluff. Do not include emojis.',
      'Vehicle details missing: If the customer asks for a part or part price but vehicle model and/or year are missing, ask for them (e.g., "What model and year is your Nissan?"). Do not ask variant questions (engine size or transmission) until model and year are known.',
      'Part availability in stock: Reply exactly "Yes, we have it in stock." (or if price requested: "Yes, we have it in stock for <price>.").',
      'Part availability not found or out of stock: Reply exactly "Let me check and update you shortly."',
      'Multiple part variants: If partAvailability.status is ambiguous, ask the clarifying question (e.g., "Is yours 1.5L turbo or 2.0L non-turbo? Also automatic or manual?").',
      'Recognize shorthand, single words, slash commands (/price, /warranty, /mileage), and typos (warrany, waranty, milage, prce) as direct customer questions asking for those details.',
      'Price questions: Reply in the format "<Part Title> - $<Price.toFixed(2)>" (e.g., "2019 Honda Civic 2.0L non-turbo CVT Automatic Transmission - $1250.00"). If not in catalog, reply "Let me check and update you shortly."',
      'Warranty: If the customer asks about warranty (e.g., "warranty?", "warrany?"), confirm OEM parts include standard 30-90 day replacement warranty.',
      'Mileage: If the customer asks about mileage (e.g., "mileage?", "milage?"), confirm parts are quality-tested OEM units with verified low mileage.',
      'Shipping: Whenever the customer asks about shipping, first ask "Shipping address?". If the customer has already provided or just replied with their shipping address or zip code, reply "Shipping takes about 7-14 days."',
      'Order Confirmation / Placing Order: Reply "Our representative will contact you soon for confirming the order."',
      'Photo / Picture Requests: Reply "Our representative will send you the picture of the required part when they are online."',
      'If the customer asks multiple questions (e.g. price and photos, or warranty and order confirmation), answer each concisely in the same short reply.',
      'Always set safeToAutoSend: true and intent: "answer_question" for valid customer inquiries. Only set safeToAutoSend: false if the customer asked to stop, unsubscribe, or opt out.',
    ],
    responseShape: {
      draft: 'string',
      intent: 'follow_up | answer_question | schedule_callback | qualify_lead | opt_out | unknown',
      safeToAutoSend: 'boolean',
      reason: 'short explanation for the rep',
    },
    suggestedMediaUrls,
  };

  let draft = '';
  let intent = detectedTopics.length ? 'answer_question' : 'unknown';
  let safeToAutoSend = true;
  let reason = partAvailability.reason || 'Auto reply';

  try {
    const response = await createTextResponse({
      instructions: AUTO_PARTS_ASSISTANT_INSTRUCTIONS,
      input: JSON.stringify(aiInput),
    });
    const rawText = extractResponseText(response);
    const parsed = safeJsonParse(rawText) || {};

    draft = String(parsed.draft || '').trim().slice(0, 1600);
    if (parsed.intent) intent = parsed.intent;
    if (typeof parsed.safeToAutoSend === 'boolean') {
      safeToAutoSend = parsed.safeToAutoSend;
    }
    if (parsed.reason) reason = parsed.reason;
  } catch (error) {
    console.error('OpenAI generation error in generateAiReply:', error.message);
  }

  // Fallback if OpenAI draft is empty or failed, but we have detected topics (price, warranty, mileage, etc.)
  if (!draft && detectedTopics.length > 0) {
    const directReply = generateDirectAnswer({ lead, detectedTopics, partAvailability, recentMessages });
    if (directReply) {
      draft = directReply;
      intent = 'answer_question';
      safeToAutoSend = true;
      reason = `Direct answer for ${detectedTopics.join(', ')}`;
    }
  }

  // Safety check: if draft contains opt-out text or intent is opt_out
  const isOptOut = optOutPattern.test(draft) || intent === 'opt_out' || (latestInbound && optOutPattern.test(latestInbound));
  if (isOptOut) {
    draft = '';
    safeToAutoSend = false;
    intent = 'opt_out';
  }

  return {
    draft,
    intent,
    safeToAutoSend,
    reason,
    partAvailability,
    suggestedMediaUrls,
  };
};

const isUserOnline = async (io, userId) => {
  if (!io || !userId) return false;
  const sockets = await io.in(String(userId)).fetchSockets();
  return sockets.some((socket) => String(socket.data.userId) === String(userId));
};

const sendSimpleGreetingReply = async ({ lead, from, to, userId, reply = defaultGreetingReply, senderType = 'ai' }) => {
  const twilioMessage = await getTwilioClient().messages.create({
    from: to,
    to: from,
    body: reply,
    ...(getPublicBaseUrl() ? { statusCallback: `${getPublicBaseUrl()}/api/messages/status` } : {}),
  });

  await MessageLog.create({
    ...(lead?._id ? { lead: lead._id } : {}),
    ...(userId ? { user: userId } : {}),
    phoneNumber: from,
    from: to,
    to: from,
    body: reply,
    direction: 'outbound',
    senderType,
    status: twilioMessage.status,
    messageSid: twilioMessage.sid,
  });
};

const sendOfflineAgentAiReply = async ({ io, lead, from, to, inboundMessage, fallbackUserId }) => {
  if (!autoReplyEnabled
    || !String(inboundMessage.body || '').trim()
    || inboundMessage.mediaUrls?.length
    || optOutPattern.test(inboundMessage.body || '')) return;

  const assignedUserId = lead?.assignedTo?._id || lead?.assignedTo || fallbackUserId;
  if (assignedUserId) {
    const assignedUser = await User.findById(assignedUserId).select('isAiAutoReplyActive');
    if (assignedUser && assignedUser.isAiAutoReplyActive === false) return;

    if (await isUserOnline(io, assignedUserId)) return;
  }

  const cooldownSince = new Date(Date.now() - autoReplyCooldownMs);
  const filterConditions = [{ phoneNumber: from }];
  if (lead?._id) {
    filterConditions.push({ lead: lead._id });
  }

  const recentAutoReply = await MessageLog.exists({
    $or: filterConditions,
    direction: 'outbound',
    senderType: 'ai',
    createdAt: { $gte: cooldownSince },
  });
  if (recentAutoReply) return;

  const messageQuery = lead?._id
    ? { lead: lead._id }
    : buildPhoneOrFilter(from, ['phoneNumber', 'from', 'to']);

  const recentMessages = await MessageLog.find(messageQuery)
    .sort({ createdAt: -1, _id: -1 })
    .limit(12)
    .lean();

  const aiReply = await generateAiReply({ lead, recentMessages, automatic: true });
  if (!aiReply.draft || !aiReply.safeToAutoSend || aiReply.intent === 'opt_out' || optOutPattern.test(aiReply.draft)) return;

  // The agent may have opened the CRM while OpenAI was preparing the response.
  if (assignedUserId && await isUserOnline(io, assignedUserId)) return;

  const twilioMessage = await getTwilioClient().messages.create({
    from: to,
    to: from,
    body: aiReply.draft,
    ...(getPublicBaseUrl() ? { statusCallback: `${getPublicBaseUrl()}/api/messages/status` } : {}),
  });

  const replyLog = await MessageLog.create({
    ...(lead?._id ? { lead: lead._id } : {}),
    ...(assignedUserId ? { user: assignedUserId } : {}),
    phoneNumber: from,
    from: to,
    to: from,
    body: aiReply.draft,
    mediaUrls: aiReply.suggestedMediaUrls,
    direction: 'outbound',
    senderType: 'ai',
    status: twilioMessage.status,
    messageSid: twilioMessage.sid,
  });

  if (assignedUserId) {
    io?.to(String(assignedUserId)).emit('ai-message-sent', {
      lead: lead?._id ? String(lead._id) : null,
      message: replyLog,
      reason: aiReply.reason,
    });
  }
};

export const uploadMessageImage = async (req, res) => {
  try {
    const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase();
    const extension = allowedImageTypes.get(contentType);
    const baseUrl = getPublicBaseUrl();

    if (!extension) {
      return res.status(400).json({ message: 'Upload a JPG, PNG, GIF, or WebP image.' });
    }

    if (!baseUrl) {
      return res.status(500).json({ message: 'BASE_URL is required before image messages can be sent.' });
    }

    if (!req.body?.length) {
      return res.status(400).json({ message: 'Image file is required.' });
    }

    if (req.body.length > maxImageBytes) {
      return res.status(400).json({ message: 'Image must be 5MB or smaller.' });
    }

    await fs.mkdir(messageUploadsDir, { recursive: true });

    const fileName = `${Date.now()}-${req.user.id}-${Math.random().toString(36).slice(2)}.${extension}`;
    const filePath = path.join(messageUploadsDir, fileName);
    await fs.writeFile(filePath, req.body);

    res.status(201).json({
      mediaUrl: `${baseUrl}/uploads/messages/${fileName}`
    });
  } catch (error) {
    console.error('Upload Message Image Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { to, body, leadId } = req.body;
    const normalizedTo = toStandardE164(to);
    const trimmedBody = String(body || '').trim();
    const mediaUrls = normalizeMediaUrls(req.body.mediaUrls);

    if (!normalizedTo || normalizedTo.replace(/\D/g, '').length < 7) {
      return res.status(400).json({ message: 'A valid recipient phone number is required' });
    }

    if (!trimmedBody && mediaUrls.length === 0) {
      return res.status(400).json({ message: 'Message body or image is required' });
    }

    if (trimmedBody.length > 1600) {
      return res.status(400).json({ message: 'Message body cannot exceed 1600 characters' });
    }

    const client = getTwilioClient();
    const senderConfig = await getSenderConfig(req.user.id);
    const baseUrl = getPublicBaseUrl();
    const linkedLeadId = await resolveLeadForMessage({ leadId, phoneNumber: normalizedTo });

    const twilioMessage = await client.messages.create({
      ...senderConfig,
      to: normalizedTo,
      ...(trimmedBody ? { body: trimmedBody } : {}),
      ...(mediaUrls.length > 0 ? { mediaUrl: mediaUrls } : {}),
      ...(baseUrl ? { statusCallback: `${baseUrl}/api/messages/status` } : {})
    });

    const sender = senderConfig.from || process.env.TWILIO_MESSAGING_SERVICE_SID;
    const messageLog = await MessageLog.create({
      ...(linkedLeadId ? { lead: linkedLeadId } : {}),
      user: req.user.id,
      phoneNumber: normalizedTo,
      from: sender,
      to: normalizedTo,
      body: trimmedBody,
      mediaUrls,
      direction: 'outbound',
      status: twilioMessage.status,
      messageSid: twilioMessage.sid
    });

    const messageLogObj = messageLog.toObject();
    messageLogObj.userName = req.user.name || '';
    messageLogObj.user = {
      _id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    };

    res.status(201).json({ message: 'Message sent', messageLog: messageLogObj });
  } catch (error) {
    console.error('Send Message Error:', error);
    res.status(500).json({
      message: error.message,
      code: error.code
    });
  }
};

export const updateMessageStatus = async (req, res) => {
  try {
    console.log('Twilio message status webhook body:', req.body);

    const messageSid = req.body.MessageSid || req.body.SmsSid;
    const status = req.body.MessageStatus || req.body.SmsStatus;

    if (!messageSid || !status) {
      return res.status(400).json({ message: 'MessageSid and status are required' });
    }

    const update = {
      status,
      errorCode: req.body.ErrorCode || '',
      errorMessage: req.body.ErrorMessage || ''
    };

    if (status === 'delivered') {
      update.deliveredAt = new Date();
    }

    const messageLog = await MessageLog.findOneAndUpdate(
      { messageSid },
      update,
      { returnDocument: 'after' }
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('message-status-updated', {
        messageSid,
        status,
        errorCode: update.errorCode,
        deliveredAt: messageLog?.deliveredAt
      });
    }

    res.sendStatus(204);
  } catch (error) {
    console.error('Message Status Error:', error);
    res.status(500).json({ message: error.message });
  }
};

const formatMessage = (message) => {
  const item = message.toObject ? message.toObject() : message;
  const assignee = item.lead?.assignedTo || null;
  const assigneeName = assignee?.name || assignee?.email || '';
  const userName = item.user?.name || item.user?.email || assigneeName || '';

  return {
    ...item,
    userName,
    assigneeName,
    senderType: item.senderType || (item.user ? 'human' : 'system'),
    assignedTo: assignee ? {
      _id: assignee._id,
      name: assignee.name,
      email: assignee.email,
      role: assignee.role
    } : null
  };
};

export const getMessages = async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const before = parseBeforeDate(req.query.before);
    const phoneNumber = String(req.query.phoneNumber || '').trim();
    const accessQuery = await buildMessageAccessQuery(req.user);
    const filters = [];

    if (phoneNumber) {
      filters.push(buildPhoneOrFilter(phoneNumber, ['phoneNumber', 'from', 'to']));
    }

    if (Object.keys(accessQuery).length > 0) {
      filters.push(accessQuery);
    }

    const query = filters.length > 1
      ? { $and: filters }
      : (filters[0] || {});

    if (before) {
      query.createdAt = { $lt: before };
    }

    const messages = await MessageLog.find(query)
      .populate('user', 'name email role')
      .populate({
        path: 'lead',
        select: 'name email phone assignedTo disposition',
        populate: { path: 'assignedTo', select: 'name email role' }
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1);

    const page = buildPaginatedResponse(
      messages.map(formatMessage),
      limit,
      (message) => new Date(message.createdAt || 0).toISOString()
    );

    res.json(page);
  } catch (error) {
    console.error('Get Messages Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getMessageThreads = async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);
    const before = parseBeforeDate(req.query.before);
    const accessQuery = await buildMessageAccessQuery(req.user);
    const pipeline = [];

    if (Object.keys(accessQuery).length > 0) {
      pipeline.push({ $match: accessQuery });
    }

    pipeline.push(
      {
        $addFields: {
          threadPhone: {
            $cond: [
              { $eq: ['$direction', 'outbound'] },
              { $ifNull: ['$to', '$phoneNumber'] },
              { $ifNull: ['$from', '$phoneNumber'] }
            ]
          }
        }
      },
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: '$threadPhone',
          latestMessage: { $first: '$$ROOT' },
          latestCreatedAt: { $first: '$createdAt' }
        }
      },
      { $sort: { latestCreatedAt: -1, _id: -1 } }
    );

    if (before) {
      pipeline.push({ $match: { latestCreatedAt: { $lt: before } } });
    }

    pipeline.push({ $limit: (limit * 2) + 1 });

    const groupedThreads = await MessageLog.aggregate(pipeline);

    // Merge any duplicate thread variants in JS using toStandardE164
    const threadMap = new Map();
    for (const thread of groupedThreads) {
      const canonicalPhone = toStandardE164(thread._id);
      const existing = threadMap.get(canonicalPhone);
      if (!existing || new Date(thread.latestCreatedAt) > new Date(existing.latestCreatedAt)) {
        threadMap.set(canonicalPhone, {
          ...thread,
          canonicalPhone
        });
      }
    }

    const mergedThreads = Array.from(threadMap.values())
      .sort((a, b) => new Date(b.latestCreatedAt) - new Date(a.latestCreatedAt))
      .slice(0, limit + 1);

    // Populate user if present in latestMessage
    const userIds = mergedThreads
      .map((t) => t.latestMessage?.user)
      .filter((id) => mongoose.isValidObjectId(id));
    const users = userIds.length > 0
      ? await mongoose.model('User').find({ _id: { $in: userIds } }).select('name email role').lean()
      : [];
    const userMap = new Map(users.map((u) => [String(u._id), u]));

    // Batch resolve leads for all thread phones
    const threadPhones = mergedThreads.map((t) => t.canonicalPhone).filter(Boolean);
    const directLeadIds = mergedThreads
      .map((t) => t.latestMessage?.lead)
      .filter((id) => mongoose.isValidObjectId(id));
    const allPhonePatterns = threadPhones.flatMap((p) => buildPhonePatterns(p));

    const leads = await Lead.find({
      $or: [
        ...(directLeadIds.length > 0 ? [{ _id: { $in: directLeadIds } }] : []),
        ...(allPhonePatterns.length > 0 ? [{ phone: { $in: allPhonePatterns } }] : [])
      ]
    })
      .select('_id name email phone disposition assignedTo')
      .populate('assignedTo', 'name email role')
      .lean();

    const leadById = new Map(leads.map((l) => [String(l._id), l]));
    const leadByPhone = new Map();
    for (const lead of leads) {
      for (const pattern of buildPhonePatterns(lead.phone)) {
        leadByPhone.set(pattern, lead);
      }
    }

    const page = buildPaginatedResponse(
      mergedThreads.map((thread) => {
        const rawMessage = thread.latestMessage;
        const user = rawMessage?.user ? userMap.get(String(rawMessage.user)) : null;

        const resolvedLead = (rawMessage?.lead && leadById.get(String(rawMessage.lead)))
          || leadByPhone.get(thread.canonicalPhone)
          || null;

        const assignee = resolvedLead?.assignedTo || null;
        const assigneeName = assignee?.name || assignee?.email || '';
        const userName = user?.name || user?.email || assigneeName || '';

        const formattedMsg = {
          ...rawMessage,
          userName,
          assigneeName,
          assignedTo: assignee ? {
            _id: assignee._id,
            name: assignee.name,
            email: assignee.email,
            role: assignee.role
          } : null
        };

        return {
          ...formattedMsg,
          phoneNumber: thread.canonicalPhone,
          threadKey: thread.canonicalPhone,
          lead: resolvedLead ? resolvedLead._id : rawMessage?.lead,
          leadName: resolvedLead?.name || '',
          leadEmail: resolvedLead?.email || '',
          leadDisposition: resolvedLead?.disposition || ''
        };
      }),
      limit,
      (thread) => new Date(thread.createdAt || 0).toISOString()
    );

    res.json(page);
  } catch (error) {
    console.error('Get Message Threads Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const draftLeadMessage = async (req, res) => {
  try {
    const { leadId, phoneNumber, instruction } = req.body;
    const trimmedPhoneNumber = toStandardE164(phoneNumber);
    const linkedLeadId = await resolveLeadForMessage({ leadId, phoneNumber: trimmedPhoneNumber });

    if (!linkedLeadId && !trimmedPhoneNumber) {
      return res.status(400).json({ message: 'leadId or phoneNumber is required' });
    }

    const lead = linkedLeadId
      ? await Lead.findById(linkedLeadId)
        .populate('assignedTo', 'name email role')
        .lean()
      : null;

    const accessQuery = await buildMessageAccessQuery(req.user);
    const filters = [];

    if (linkedLeadId) {
      filters.push({ lead: linkedLeadId });
    }

    if (trimmedPhoneNumber || lead?.phone) {
      filters.push(buildPhoneOrFilter(trimmedPhoneNumber || lead.phone, ['phoneNumber', 'from', 'to']));
    }

    if (Object.keys(accessQuery).length > 0) {
      filters.push(accessQuery);
    }

    const messageQuery = filters.length > 1
      ? { $and: filters }
      : (filters[0] || {});

    const recentMessages = await MessageLog.find(messageQuery)
      .sort({ createdAt: -1, _id: -1 })
      .limit(12)
      .lean();

    const aiResult = await generateAiReply({
      lead,
      recentMessages,
      instruction: instruction || 'follow_up',
      automatic: false,
    });

    res.json({
      draft: aiResult.draft,
      intent: aiResult.intent,
      requiresApproval: true,
      reason: aiResult.reason,
      partAvailability: aiResult.partAvailability,
      suggestedMediaUrls: aiResult.suggestedMediaUrls,
      model: getOpenAIModel(),
      leadId: linkedLeadId || null,
    });
  } catch (error) {
    console.error('Draft Lead Message Error:', error);
    res.status(500).json({ message: error.message || 'Failed to draft message' });
  }
};

export const receiveMessage = async (req, res) => {
  try {
    const rawFrom = req.body.From || 'Unknown';
    const from = toStandardE164(rawFrom);
    const rawTo = req.body.To || process.env.TWILIO_PHONE_NUMBER || 'Unknown';
    const to = toStandardE164(rawTo);
    const body = req.body.Body || '';
    const messageSid = req.body.MessageSid || req.body.SmsSid || '';
    const mediaCount = Number(req.body.NumMedia) || 0;
    const mediaUrls = Array.from({ length: mediaCount }, (_, index) => req.body[`MediaUrl${index}`])
      .filter(Boolean);

    // Twilio can retry a webhook; never create or auto-reply to the same inbound SMS twice.
    if (messageSid && await MessageLog.exists({ messageSid, direction: 'inbound' })) {
      const twiml = new twilio.twiml.MessagingResponse();
      res.type('text/xml');
      return res.send(twiml.toString());
    }

    const assignedNumber = await TwilioNumber.findOne({
      $or: [{ phoneNumber: to }, { phoneNumber: rawTo }]
    });
    const assignedUserIds = (assignedNumber?.assignedUsers || []).map((userId) => String(userId));
    const linkedLeadId = await resolveLeadForMessage({ phoneNumber: from });
    const lead = linkedLeadId
      ? await Lead.findById(linkedLeadId).select('assignedTo name phone email zip partRequested make model year yearMakeModel disposition notes followUpAt followUpNote source').lean()
      : null;

    const fallbackUserId = lead?.assignedTo || assignedUserIds[0] || undefined;

    const messageLog = await MessageLog.create({
      ...(linkedLeadId ? { lead: linkedLeadId } : {}),
      user: fallbackUserId,
      phoneNumber: from,
      from,
      to,
      body,
      mediaUrls,
      direction: 'inbound',
      status: req.body.SmsStatus || 'received',
      messageSid
    });

    const leadAssigneeId = lead?.assignedTo ? String(lead.assignedTo._id || lead.assignedTo) : null;
    const recipientUserIds = [...new Set([
      ...assignedUserIds,
      ...(leadAssigneeId ? [leadAssigneeId] : [])
    ])];

    const io = req.app.get('io');
    if (io) {
      io.emit('incoming-message', {
        from,
        to,
        body,
        mediaUrls,
        messageSid,
        lead: messageLog.lead,
        assignedTo: recipientUserIds,
        createdAt: messageLog.createdAt
      });
    }

    // Trigger AI reply when lead exists or when inbound message asks about price, warranty, mileage, order, etc.
    try {
      const detectedTopics = detectInquiryTopics(body);
      const simpleGreetingReply = getSimpleGreetingReply(body);

      // Check if customer is replying to a shipping address inquiry
      const lastOutboundMsg = await MessageLog.findOne({
        ...(linkedLeadId ? { lead: linkedLeadId } : { phoneNumber: from }),
        direction: 'outbound',
      }).sort({ createdAt: -1, _id: -1 }).select('body').lean();
      const isReplyingToShippingAddress = /shipping\s*address\?/i.test(lastOutboundMsg?.body || '');
      if (isReplyingToShippingAddress && body.trim().length > 0 && !detectedTopics.includes('shipping')) {
        detectedTopics.push('shipping');
      }

      // Auto-save 5-digit zip code to lead if found
      const zipMatch = body.match(/\b\d{5}\b/);
      if (zipMatch && linkedLeadId && !lead?.zip) {
        try {
          await Lead.findByIdAndUpdate(linkedLeadId, { zip: zipMatch[0] });
          if (lead) lead.zip = zipMatch[0];
        } catch (zipErr) {
          console.warn('Failed to update lead zip:', zipErr.message);
        }
      }

      // Update lead.partRequested if customer asks for a new part
      const newPartInInbound = normalizePartKeyword(body);
      if (newPartInInbound && linkedLeadId && lead && lead.partRequested !== newPartInInbound) {
        try {
          await Lead.findByIdAndUpdate(linkedLeadId, { partRequested: newPartInInbound });
          lead.partRequested = newPartInInbound;
          if (io) {
            io.emit('lead-updated', {
              leadId: String(linkedLeadId),
              partRequested: newPartInInbound,
            });
          }
        } catch (partErr) {
          console.warn('Failed to update lead partRequested:', partErr.message);
        }
      }

      // Auto-save vehicle details (year, make, model) to lead if newly identified
      if (linkedLeadId && lead) {
        const vehicleDetails = extractVehicleDetails(lead, [messageLog]);
        const updates = {};
        if (vehicleDetails.make && !lead.make) updates.make = vehicleDetails.make;
        if (vehicleDetails.model && !lead.model) updates.model = vehicleDetails.model;
        if (vehicleDetails.year && !lead.year) updates.year = vehicleDetails.year;
        if (Object.keys(updates).length > 0) {
          try {
            const updatedYear = updates.year || lead.year || '';
            const updatedMake = updates.make || lead.make || '';
            const updatedModel = updates.model || lead.model || '';
            updates.yearMakeModel = `${updatedYear} ${updatedMake} ${updatedModel}`.trim();
            await Lead.findByIdAndUpdate(linkedLeadId, updates);
            Object.assign(lead, updates);
            if (io) {
              io.emit('lead-updated', {
                leadId: String(linkedLeadId),
                ...updates,
              });
            }
          } catch (vehErr) {
            console.warn('Failed to update lead vehicle details:', vehErr.message);
          }
        }
      }

      const hasInquiry = detectedTopics.length > 0;

      if (simpleGreetingReply) {
        await sendSimpleGreetingReply({
          lead,
          from,
          to,
          userId: fallbackUserId,
          reply: simpleGreetingReply,
        });
      } else {
        // Update lead disposition to 'Ordered' if customer is placing/confirming an order
        if (linkedLeadId && detectedTopics.includes('order') && lead?.disposition !== 'Ordered') {
          try {
            await Lead.findByIdAndUpdate(linkedLeadId, { disposition: 'Ordered' });
            if (io) {
              io.emit('lead-updated', {
                leadId: String(linkedLeadId),
                disposition: 'Ordered',
              });
            }
          } catch (leadUpdateErr) {
            console.warn('Failed to update lead disposition to Ordered:', leadUpdateErr.message);
          }
        }

        if (lead || hasInquiry) {
          await sendOfflineAgentAiReply({
            io,
            lead,
            from,
            to,
            inboundMessage: messageLog,
            fallbackUserId: assignedUserIds[0] || undefined,
          });
        } else if (!linkedLeadId) {
          const greetingAlreadySent = await MessageLog.exists({
            phoneNumber: from,
            direction: 'outbound',
            body: unknownNumberGreeting,
          });

          if (!greetingAlreadySent) {
            await sendSimpleGreetingReply({
              from,
              to,
              userId: assignedUserIds[0] || undefined,
              reply: unknownNumberGreeting,
              senderType: 'system',
            });
          }
        }
      }
    } catch (aiError) {
      // SMS reception must still succeed if OpenAI or Twilio's outbound request fails.
      console.error('Inbound AI Reply Error:', aiError);
    }

    const twiml = new twilio.twiml.MessagingResponse();
    res.type('text/xml');
    res.send(twiml.toString());
  } catch (error) {
    console.error('Receive Message Error:', error);
    res.status(500).send('Internal Server Error');
  }
};
