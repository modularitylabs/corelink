/**
 * OAuth Routes
 *
 * Handles OAuth2 flow for plugins (Gmail, etc.)
 * Uses PKCE (Proof Key for Code Exchange) for secure native app OAuth
 */

import { randomBytes } from 'crypto';
import { FastifyInstance } from 'fastify';
import { google } from 'googleapis';

import { generateCodeChallenge, generateCodeVerifier, pkceStore } from '../crypto/pkce.js';
import { CredentialManager } from '../services/credential-manager.js';

export async function oauthRoutes(
  fastify: FastifyInstance,
  credentialManager: CredentialManager
) {
  /**
   * Initiate OAuth flow for Gmail using PKCE
   */
  fastify.get('/oauth/gmail/start', async (_request, reply) => {
    // Get Client ID from environment (read at runtime, not module load time)
    const GOOGLE_CLIENT_ID =
      process.env.GOOGLE_CLIENT_ID || '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';

    // Use 127.0.0.1 (loopback IP) as required by Google for Desktop apps
    const redirectUri = 'http://127.0.0.1:3000/oauth/callback';

    // Debug: Log the Client ID being used
    fastify.log.info(`Using Google Client ID: ${GOOGLE_CLIENT_ID}`);

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString('hex');

    // Store verifier for later use
    pkceStore.set(state, codeVerifier);

    // Create OAuth client (no client secret needed!)
    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, undefined, redirectUri);

    // Generate auth URL with PKCE
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
      ],
      prompt: 'consent', // Force consent to get refresh token
      state, // Anti-CSRF token
      // PKCE parameters
      // @ts-ignore - googleapis types don't include PKCE yet
      code_challenge: codeChallenge,
      // @ts-ignore
      code_challenge_method: 'S256',
    });

    return reply.send({ authUrl });
  });

  /**
   * OAuth callback handler (PKCE)
   */
  fastify.get('/oauth/callback', async (request, reply) => {
    const { code, error, state } = request.query as {
      code?: string;
      error?: string;
      state?: string;
    };

    if (error) {
      return reply.code(400).send({ error: `OAuth error: ${error}` });
    }

    if (!code || !state) {
      return reply.code(400).send({ error: 'Missing authorization code or state' });
    }

    try {
      // Get Client ID from environment
      const GOOGLE_CLIENT_ID =
        process.env.GOOGLE_CLIENT_ID || '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';

      // Retrieve code verifier
      const codeVerifier = pkceStore.get(state);

      if (!codeVerifier) {
        return reply.code(400).send({
          error: 'Invalid or expired state parameter',
        });
      }

      // Use 127.0.0.1 (loopback IP) as required by Google for Desktop apps
      const redirectUri = 'http://127.0.0.1:3000/oauth/callback';
      const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, undefined, redirectUri);

      // Exchange code + verifier for tokens (PKCE!)
      const { tokens } = await oauth2Client.getToken({
        code,
        codeVerifier,
      });

      // Store credentials (no client secret stored!)
      await credentialManager.storeCredentials('com.corelink.gmail', 'oauth2', {
        clientId: GOOGLE_CLIENT_ID,
        redirectUri,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
      });

      // Return success page
      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Gmail Connected - CoreLink</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .card {
              background: white;
              padding: 3rem;
              border-radius: 1rem;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 400px;
            }
            .success-icon {
              font-size: 4rem;
              margin-bottom: 1rem;
            }
            h1 {
              margin: 0 0 1rem 0;
              color: #333;
            }
            p {
              color: #666;
              line-height: 1.6;
            }
            .btn {
              display: inline-block;
              margin-top: 1.5rem;
              padding: 0.75rem 2rem;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 0.5rem;
              font-weight: 500;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success-icon">✓</div>
            <h1>Gmail Connected!</h1>
            <p>Your Gmail account has been successfully connected to CoreLink.</p>
            <p>You can now close this window and return to the dashboard.</p>
            <a href="http://localhost:5173" class="btn">Back to Dashboard</a>
          </div>
          <script>
            // Auto-close after 3 seconds
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
        </html>
      `);
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({
        error: 'Failed to exchange authorization code',
        details: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  /**
   * Check Gmail connection status
   */
  fastify.get('/oauth/gmail/status', async (_request, reply) => {
    const hasCredentials = await credentialManager.hasCredentials('com.corelink.gmail');
    return reply.send({ connected: hasCredentials });
  });

  /**
   * Disconnect Gmail
   */
  fastify.delete('/oauth/gmail', async (_request, reply) => {
    await credentialManager.deleteCredentials('com.corelink.gmail');
    return reply.send({ success: true });
  });
}
