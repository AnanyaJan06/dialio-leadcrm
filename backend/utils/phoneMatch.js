export const toStandardE164 = (phoneNumber = '') => {
  if (!phoneNumber) return '';
  const trimmed = String(phoneNumber).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;

  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }
  if (digits.length > 10) {
    return `+${digits}`;
  }
  return `+1${digits}`;
};

export const to10Digits = (phoneNumber = '') => {
  const digits = String(phoneNumber || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }
  return digits;
};

export const formatDisplayPhone = (phoneNumber = '') => {
  if (!phoneNumber) return '';
  const digits = String(phoneNumber).replace(/\D/g, '');
  const core = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  if (core.length === 10) {
    return `(${core.slice(0, 3)}) ${core.slice(3, 6)}-${core.slice(6)}`;
  }
  if (digits.length > 10) {
    return `+${digits}`;
  }
  return String(phoneNumber).trim();
};

export const buildPhonePatterns = (phoneNumber = '') => {
  const digits = String(phoneNumber).replace(/\D/g, '');
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  const standardE164 = toStandardE164(phoneNumber);

  return [...new Set([
    String(phoneNumber).trim(),
    standardE164,
    normalized,
    digits,
    normalized ? `+1${normalized}` : '',
    digits ? `+${digits}` : ''
  ].filter(Boolean))];
};

export const buildPhoneOrFilter = (phoneNumber, fields) => {
  const patterns = buildPhonePatterns(phoneNumber);

  return {
    $or: fields.map((field) => ({ [field]: { $in: patterns } }))
  };
};