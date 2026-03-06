/**
 * Outlook Calendar OAuth Routes
 *
 * Handles OAuth2 PKCE flow for Outlook Calendar (separate plugin from Outlook email/MS Todo).
 * Uses the same Microsoft Identity Platform but with Calendars.ReadWrite scope.
 */

import { randomBytes } from 'crypto';
import { FastifyInstance } from 'fastify';

import { generateCodeChallenge, generateCodeVerifier, pkceStore } from '../crypto/pkce.js';
import { CredentialManager } from '../services/credential-manager.js';

const MICROSOFT_AUTH_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

export async function outlookCalendarOAuthRoutes(
  fastify: FastifyInstance,
  credentialManager: CredentialManager
) {
  /**
   * Initiate OAuth flow for Outlook Calendar using PKCE
   */
  fastify.get('/oauth/outlook-calendar/start', async (_request, reply) => {
    const MICROSOFT_CLIENT_ID =
      process.env.MICROSOFT_CLIENT_ID || '00000000-0000-0000-0000-000000000000';

    const redirectUri = 'http://127.0.0.1:3747/oauth/callback/outlook-calendar';

    fastify.log.info(`[Outlook Calendar] Using Microsoft Client ID: ${MICROSOFT_CLIENT_ID}`);

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString('hex');

    pkceStore.set(state, codeVerifier);

    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: [
        'openid',
        'profile',
        'email',
        'offline_access',
        'User.Read',
        'Calendars.ReadWrite',
      ].join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    });

    const authUrl = `${MICROSOFT_AUTH_ENDPOINT}?${params.toString()}`;
    return reply.send({ authUrl });
  });

  /**
   * OAuth callback handler for Outlook Calendar (PKCE)
   */
  fastify.get('/oauth/callback/outlook-calendar', async (request, reply) => {
    const { code, error, error_description, state } = request.query as {
      code?: string;
      error?: string;
      error_description?: string;
      state?: string;
    };

    if (error) {
      return reply.code(400).send({
        error: `OAuth error: ${error}`,
        description: error_description,
      });
    }

    if (!code || !state) {
      return reply.code(400).send({ error: 'Missing authorization code or state' });
    }

    try {
      const MICROSOFT_CLIENT_ID =
        process.env.MICROSOFT_CLIENT_ID || '00000000-0000-0000-0000-000000000000';

      const codeVerifier = pkceStore.get(state);
      if (!codeVerifier) {
        return reply.code(400).send({ error: 'Invalid or expired state parameter' });
      }

      const redirectUri = 'http://127.0.0.1:3747/oauth/callback/outlook-calendar';

      const tokenParams = new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      });

      const tokenResponse = await fetch(MICROSOFT_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
      });

      if (!tokenResponse.ok) {
        const errorData = (await tokenResponse.json()) as {
          error: string;
          error_description: string;
        };
        throw new Error(
          `Token exchange failed: ${errorData.error} - ${errorData.error_description}`
        );
      }

      const tokens = (await tokenResponse.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!graphResponse.ok) {
        const graphError = await graphResponse.text();
        throw new Error(
          `Failed to fetch user info from Microsoft Graph: ${graphResponse.status} ${graphError}`
        );
      }

      const userInfo = (await graphResponse.json()) as {
        mail?: string;
        userPrincipalName?: string;
        displayName?: string;
      };

      const email = userInfo.mail || userInfo.userPrincipalName;
      const displayName = userInfo.displayName;

      if (!email) {
        return reply.code(500).send({ error: 'Could not retrieve user email from Microsoft' });
      }

      const accountId = await credentialManager.createAccount(
        'com.corelink.outlook-calendar',
        email,
        displayName || undefined,
        { clientId: MICROSOFT_CLIENT_ID, redirectUri }
      );

      await credentialManager.storeAccountCredentials(accountId, 'oauth2', {
        clientId: MICROSOFT_CLIENT_ID,
        redirectUri,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: Date.now() + tokens.expires_in * 1000,
      });

      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Outlook Calendar Connected - CoreLink</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #0078d4 0%, #00bcf2 100%);
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
            <h1>Outlook Calendar Connected!</h1>
            <p>Your Outlook Calendar account has been successfully connected to CoreLink.</p>
            <p>This window will close automatically...</p>
          </div>
          <script>window.close();</script>
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
   * Check Outlook Calendar connection status
   */
  fastify.get('/oauth/outlook-calendar/status', async (_request, reply) => {
    try {
      const accounts = await credentialManager.listAccounts('com.corelink.outlook-calendar');
      return reply.send({ accounts });
    } catch (error) {
      fastify.log.error(error, '[Outlook Calendar Status]');
      const hasCredentials = await credentialManager.hasCredentials('com.corelink.outlook-calendar');
      return reply.send({ connected: hasCredentials, accounts: [] });
    }
  });

  /**
   * Disconnect Outlook Calendar
   */
  fastify.delete('/oauth/outlook-calendar', async (_request, reply) => {
    await credentialManager.deleteCredentials('com.corelink.outlook-calendar');
    return reply.send({ success: true });
  });
}
