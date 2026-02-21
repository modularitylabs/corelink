/**
 * Credential Encryption Module
 *
 * Uses Node.js crypto to encrypt/decrypt OAuth tokens and API keys
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits

/**
 * Get or generate encryption key
 */
function getEncryptionKey(): Buffer {
  const keyPath = process.env.ENCRYPTION_KEY_PATH || './.corelink/encryption.key';
  const keyDir = path.dirname(keyPath);

  // Ensure directory exists
  if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true });
  }

  // Generate key if it doesn't exist
  if (!fs.existsSync(keyPath)) {
    const key = crypto.randomBytes(KEY_LENGTH);
    fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
    return key;
  }

  // Read existing key
  const keyHex = fs.readFileSync(keyPath, 'utf-8').trim();
  return Buffer.from(keyHex, 'hex');
}

/**
 * Encrypt data
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt data
 */
export function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const parts = ciphertext.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt credentials object
 */
export function encryptCredentials(credentials: Record<string, unknown>): string {
  const json = JSON.stringify(credentials);
  return encrypt(json);
}

/**
 * Decrypt credentials object
 */
export function decryptCredentials(encrypted: string): Record<string, unknown> {
  const json = decrypt(encrypted);
  return JSON.parse(json);
}
