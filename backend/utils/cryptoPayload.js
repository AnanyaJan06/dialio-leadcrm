import CryptoJS from 'crypto-js';

const getPayloadSecret = () => (
  process.env.PAYLOAD_SECRET_KEY ||
  'dialio-leadcrm-parts-payload-secret-key-2026'
);

/**
 * Encrypts data object to an AES ciphertext string.
 */
export const encryptPayload = (data) => {
  try {
    const jsonStr = JSON.stringify(data);
    return CryptoJS.AES.encrypt(jsonStr, getPayloadSecret()).toString();
  } catch (err) {
    console.error('Failed to encrypt response payload:', err);
    return null;
  }
};

/**
 * Decrypts AES ciphertext string back to JavaScript object.
 */
export const decryptPayload = (ciphertext) => {
  try {
    if (!ciphertext || typeof ciphertext !== 'string') return null;
    const bytes = CryptoJS.AES.decrypt(ciphertext, getPayloadSecret());
    const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
    if (!decryptedStr) return null;
    return JSON.parse(decryptedStr);
  } catch (err) {
    console.error('Failed to decrypt request payload:', err);
    return null;
  }
};
