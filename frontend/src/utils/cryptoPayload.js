import CryptoJS from 'crypto-js';

const getPayloadSecret = () => (
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_PAYLOAD_SECRET_KEY) ||
  'dialio-leadcrm-parts-payload-secret-key-2026'
);

/**
 * Decrypts AES ciphertext string back into JavaScript object.
 */
export const decryptPayload = (ciphertext) => {
  try {
    if (!ciphertext || typeof ciphertext !== 'string') return null;
    const bytes = CryptoJS.AES.decrypt(ciphertext, getPayloadSecret());
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedStr) return null;
    return JSON.parse(decryptedStr);
  } catch (err) {
    console.error('Failed to decrypt response payload:', err);
    return null;
  }
};

/**
 * Encrypts data object to AES ciphertext string.
 */
export const encryptPayload = (data) => {
  try {
    const jsonStr = JSON.stringify(data);
    return CryptoJS.AES.encrypt(jsonStr, getPayloadSecret()).toString();
  } catch (err) {
    console.error('Failed to encrypt request payload:', err);
    return null;
  }
};
