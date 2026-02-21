/**
 * PKCE (Proof Key for Code Exchange) Implementation
 *
 * Used for OAuth2 without client secrets (native/desktop apps)
 * https://www.rfc-editor.org/rfc/rfc7636
 */

import * as crypto from 'crypto';

/**
 * Generate a cryptographically random code verifier
 * Length: 43-128 characters (we use 128 for maximum entropy)
 */
export function generateCodeVerifier(): string {
  return base64URLEncode(crypto.randomBytes(96));
}

/**
 * Generate code challenge from verifier using SHA256
 */
export function generateCodeChallenge(verifier: string): string {
  const hash = crypto.createHash('sha256').update(verifier).digest();
  return base64URLEncode(hash);
}

/**
 * Base64 URL encode (RFC 7636 compliant)
 * Remove padding, replace + with -, replace / with _
 */
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * In-memory store for PKCE verifiers
 * Maps state -> code verifier
 * Auto-expires after 10 minutes
 */
class PKCEStore {
  private store = new Map<string, { verifier: string; expires: number }>();

  set(state: string, verifier: string): void {
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
    this.store.set(state, { verifier, expires });

    // Clean up expired entries
    this.cleanup();
  }

  get(state: string): string | null {
    const entry = this.store.get(state);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expires) {
      this.store.delete(state);
      return null;
    }

    // Delete after use (one-time use)
    this.store.delete(state);
    return entry.verifier;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [state, entry] of this.store.entries()) {
      if (now > entry.expires) {
        this.store.delete(state);
      }
    }
  }
}

export const pkceStore = new PKCEStore();
