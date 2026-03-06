/**
 * Google Calendar OAuth Routes
 *
 * Handles OAuth2 PKCE flow for Google Calendar (separate plugin from Gmail).
 * Uses the same Google OAuth2 infrastructure but different scopes and plugin ID.
 */

import { randomBytes } from 'crypto';
import { FastifyInstance } from 'fastify';
import { google } from 'googleapis';

import { generateCodeChallenge, generateCodeVerifier, pkceStore } from '../crypto/pkce.js';
import { CredentialManager } from '../services/credential-manager.js';

export async function googleCalendarOAuthRoutes(
  fastify: FastifyInstance,
  credentialManager: CredentialManager
) {
  /**
   * Initiate OAuth flow for Google Calendar using PKCE
   */
  fastify.get('/oauth/google-calendar/start', async (_request, reply) => {
    const GOOGLE_CLIENT_ID =
      process.env.GOOGLE_CLIENT_ID || '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';

    const redirectUri = 'http://127.0.0.1:3747/oauth/callback/google-calendar';

    fastify.log.info(`[Google Calendar] Using Google Client ID: ${GOOGLE_CLIENT_ID}`);

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString('hex');

    pkceStore.set(state, codeVerifier);

    const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, undefined, redirectUri);

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'select_account consent',
      state,
      // @ts-ignore - googleapis types don't include PKCE yet
      code_challenge: codeChallenge,
      // @ts-ignore
      code_challenge_method: 'S256',
    });

    return reply.send({ authUrl });
  });

  /**
   * OAuth callback handler for Google Calendar (PKCE)
   */
  fastify.get('/oauth/callback/google-calendar', async (request, reply) => {
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
      const GOOGLE_CLIENT_ID =
        process.env.GOOGLE_CLIENT_ID || '1234567890-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';

      const codeVerifier = pkceStore.get(state);
      if (!codeVerifier) {
        return reply.code(400).send({ error: 'Invalid or expired state parameter' });
      }

      const redirectUri = 'http://127.0.0.1:3747/oauth/callback/google-calendar';
      const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, undefined, redirectUri);

      const { tokens } = await oauth2Client.getToken({ code, codeVerifier });

      fastify.log.info(`[Google Calendar] Token exchange successful. Has refresh token: ${!!tokens.refresh_token}`);

      oauth2Client.setCredentials(tokens);

      let email: string | null | undefined;
      let displayName: string | null | undefined;

      try {
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const userInfo = await oauth2.userinfo.get();
        email = userInfo.data.email;
        displayName = userInfo.data.name;
        fastify.log.info(`[Google Calendar] User info: ${email}`);
      } catch (userInfoError: any) {
        fastify.log.error(`[Google Calendar] Failed to fetch user info: ${userInfoError.message}`);
        return reply.code(500).send({
          error: 'Failed to fetch user info from Google',
          details: userInfoError.message,
        });
      }

      if (!email) {
        return reply.code(500).send({ error: 'Could not retrieve user email from Google' });
      }

      const accountId = await credentialManager.createAccount(
        'com.corelink.google-calendar',
        email,
        displayName || undefined,
        { clientId: GOOGLE_CLIENT_ID, redirectUri }
      );

      await credentialManager.storeAccountCredentials(accountId, 'oauth2', {
        clientId: GOOGLE_CLIENT_ID,
        redirectUri,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: tokens.expiry_date,
      });

      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Calendar Connected - CoreLink</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #34a853 0%, #4285f4 100%);
            }
            .card {
              background: white;
              padding: 3rem;
              border-radius: 1rem;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 400px;
            }
            .success-icon { font-size: 4rem; margin-bottom: 1rem; }
            h1 { margin: 0 0 1rem 0; color: #333; }
            p { color: #666; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="success-icon">✓</div>
            <h1>Google Calendar Connected!</h1>
            <p>Your Google Calendar account has been successfully connected to CoreLink.</p>
            <p>This window will close automatically...</p>
          </div>
          <script>
            setTimeout(() => window.close(), 3000);
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
   * Check Google Calendar connection status
   */
  fastify.get('/oauth/google-calendar/status', async (_request, reply) => {
    try {
      const accounts = await credentialManager.listAccounts('com.corelink.google-calendar');
      return reply.send({ accounts });
    } catch (error) {
      fastify.log.error(error, '[Google Calendar Status]');
      const hasCredentials = await credentialManager.hasCredentials('com.corelink.google-calendar');
      return reply.send({ connected: hasCredentials, accounts: [] });
    }
  });

  /**
   * Disconnect Google Calendar
   */
  fastify.delete('/oauth/google-calendar', async (_request, reply) => {
    await credentialManager.deleteCredentials('com.corelink.google-calendar');
    return reply.send({ success: true });
  });
}
