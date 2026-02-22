/**
 * Microsoft Outlook OAuth Routes
 *
 * Handles OAuth2 PKCE flow for Outlook/Microsoft 365
 */

import { randomBytes } from 'crypto';
import { FastifyInstance } from 'fastify';

import { generateCodeChallenge, generateCodeVerifier, pkceStore } from '../crypto/pkce.js';
import { CredentialManager } from '../services/credential-manager.js';

// Microsoft Identity Platform endpoints
const MICROSOFT_AUTH_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
const MICROSOFT_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

export async function outlookOAuthRoutes(
  fastify: FastifyInstance,
  credentialManager: CredentialManager
) {
  /**
   * Initiate OAuth flow for Outlook using PKCE
   */
  fastify.get('/oauth/outlook/start', async (_request, reply) => {
    // Get Client ID from environment (read at runtime)
    const MICROSOFT_CLIENT_ID =
      process.env.MICROSOFT_CLIENT_ID || '00000000-0000-0000-0000-000000000000';

    // Use 127.0.0.1 (loopback IP) as required for native/desktop apps
    const redirectUri = 'http://127.0.0.1:3000/oauth/callback/outlook';

    // Debug: Log the Client ID being used
    fastify.log.info(`Using Microsoft Client ID: ${MICROSOFT_CLIENT_ID}`);

    // Generate PKCE parameters
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = randomBytes(16).toString('hex');

    // Store verifier for later use
    pkceStore.set(state, codeVerifier);

    // Build Microsoft OAuth URL manually (more control than using a library)
    const params = new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: [
        'openid',
        'profile',
        'offline_access',
        'Mail.Read',
        'Mail.Send',
        'Mail.ReadWrite',
      ].join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent', // Force consent to get refresh token
    });

    const authUrl = `${MICROSOFT_AUTH_ENDPOINT}?${params.toString()}`;

    return reply.send({ authUrl });
  });

  /**
   * OAuth callback handler (PKCE)
   */
  fastify.get('/oauth/callback/outlook', async (request, reply) => {
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
      // Get Client ID from environment
      const MICROSOFT_CLIENT_ID =
        process.env.MICROSOFT_CLIENT_ID || '00000000-0000-0000-0000-000000000000';

      // Retrieve code verifier
      const codeVerifier = pkceStore.get(state);

      if (!codeVerifier) {
        return reply.code(400).send({
          error: 'Invalid or expired state parameter',
        });
      }

      const redirectUri = 'http://127.0.0.1:3000/oauth/callback/outlook';

      // Exchange code + verifier for tokens (PKCE!)
      const tokenParams = new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      });

      const tokenResponse = await fetch(MICROSOFT_TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
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

      // Fetch user email from Microsoft Graph API
      const graphResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!graphResponse.ok) {
        throw new Error('Failed to fetch user info from Microsoft Graph');
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

      // Create account record
      const accountId = await credentialManager.createAccount(
        'com.corelink.outlook',
        email,
        displayName || undefined,
        {
          // Store OAuth config in account metadata
          clientId: MICROSOFT_CLIENT_ID,
          redirectUri,
        }
      );

      // Store credentials linked to account
      await credentialManager.storeAccountCredentials(accountId, 'oauth2', {
        clientId: MICROSOFT_CLIENT_ID,
        redirectUri,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiryDate: Date.now() + tokens.expires_in * 1000,
      });

      // Return success page
      return reply.type('text/html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Outlook Connected - CoreLink</title>
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
              background: #0078d4;
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
            <h1>Outlook Connected!</h1>
            <p>Your Outlook account has been successfully connected to CoreLink.</p>
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
   * Check Outlook connection status
   * Returns list of connected Outlook accounts
   */
  fastify.get('/oauth/outlook/status', async (_request, reply) => {
    try {
      const accounts = await credentialManager.listAccounts('com.corelink.outlook');
      return reply.send({ accounts });
    } catch (error) {
      fastify.log.error(error, '[Outlook Status]');
      // Fallback to legacy check if accounts table doesn't exist yet
      const hasCredentials = await credentialManager.hasCredentials('com.corelink.outlook');
      return reply.send({ connected: hasCredentials, accounts: [] });
    }
  });

  /**
   * Disconnect Outlook
   */
  fastify.delete('/oauth/outlook', async (_request, reply) => {
    await credentialManager.deleteCredentials('com.corelink.outlook');
    return reply.send({ success: true });
  });
}
