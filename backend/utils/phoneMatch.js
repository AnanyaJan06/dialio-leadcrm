export const buildPhonePatterns = (phoneNumber = '') => {
  const digits = String(phoneNumber).replace(/\D/g, '');
  const normalized = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;

  return [...new Set([
    String(phoneNumber).trim(),
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