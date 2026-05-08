import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
    const rawSecret = process.env.PLUGIN_SECRET;
    if (!rawSecret || !rawSecret.trim()) {
        throw new Error('缺少 PLUGIN_SECRET，无法执行 Cookie 加解密');
    }

    return crypto.createHash('sha256').update(String(rawSecret).trim()).digest();
}

/**
 * Encrypts a text string with AES-256-GCM.
 * @param {string} text - The plaintext to encrypt.
 * @returns {string} - The hex-encoded iv:authTag:encryptedData
 */
export function encryptCookie(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
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
        
        const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        console.error("Decryption failed:", e);
        return null;
    }
}
