import crypto from 'node:crypto';

// Use PLUGIN_SECRET as the base for our 32-byte AES key
// Fallback if the user somehow hasn't set it (though the system warns if not set)
const RAW_SECRET = process.env.PLUGIN_SECRET || 'bilibili-vup-default-insecure-secret';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(String(RAW_SECRET)).digest('base64').substr(0, 32); 

const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts a text string with AES-256-GCM.
 * @param {string} text - The plaintext to encrypt.
 * @returns {string} - The hex-encoded iv:authTag:encryptedData
 */
export function encryptCookie(text) {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf-8'), iv);
        
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag().toString('hex');
        
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (e) {
        console.error("Encryption failed:", e);
        return null;
    }
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * @param {string} ciphertext - The hex-encoded iv:authTag:encryptedData
 * @returns {string} - The decrypted plaintext
 */
export function decryptCookie(ciphertext) {
    if (!ciphertext || typeof ciphertext !== 'string' || !ciphertext.includes(':')) {
        return ciphertext; // Possibly unencrypted fallback
    }
    
    try {
        const parts = ciphertext.split(':');
        if (parts.length !== 3) return ciphertext;
        
        const [ivHex, authTagHex, encryptedHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'utf-8'), iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error("Decryption failed:", e);
        return null; // Don't leak fallback
    }
}
