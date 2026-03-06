/**
 * Todoist Token Routes
 *
 * Todoist does not support PKCE. Instead, users provide their personal API token
 * from https://app.todoist.com/app/settings/integrations/developer
 */

import { FastifyInstance } from 'fastify';
import { CredentialManager } from '../services/credential-manager.js';

const TODOIST_USER_ENDPOINT = 'https://api.todoist.com/api/v1/user';

export async function todoistOAuthRoutes(
  fastify: FastifyInstance,
  credentialManager: CredentialManager
) {
  /**
   * Connect Todoist using a personal API token
   */
  fastify.post('/oauth/todoist/connect', async (request, reply) => {
    const { apiToken } = request.body as { apiToken?: string };

    if (!apiToken?.trim()) {
      return reply.code(400).send({ error: 'apiToken is required' });
    }

    try {
      // Verify the token by fetching user info
      const userResponse = await fetch(TODOIST_USER_ENDPOINT, {
        headers: { Authorization: `Bearer ${apiToken.trim()}` },
      });

      if (!userResponse.ok) {
        return reply.code(401).send({ error: 'Invalid Todoist API token' });
      }

      const userInfo = (await userResponse.json()) as {
        email?: string;
        full_name?: string;
      };

      const email = userInfo.email;
      const displayName = userInfo.full_name;

      if (!email) {
        return reply.code(500).send({ error: 'Could not retrieve user info from Todoist' });
      }

      // Create account record
      const accountId = await credentialManager.createAccount(
        'com.corelink.todoist',
        email,
        displayName || undefined,
        {}
      );

      // Store credentials
      await credentialManager.storeAccountCredentials(accountId, 'oauth2', {
        accessToken: apiToken.trim(),
      });

      return reply.send({ success: true, email, displayName });
    } catch (err) {
      fastify.log.error(err);
      return reply.code(500).send({
        error: 'Failed to connect Todoist',
        details: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  });

  /**
   * Check Todoist connection status
   */
  fastify.get('/oauth/todoist/status', async (_request, reply) => {
    try {
      const accounts = await credentialManager.listAccounts('com.corelink.todoist');
      return reply.send({ accounts });
    } catch (error) {
      fastify.log.error(error, '[Todoist Status]');
      const hasCredentials = await credentialManager.hasCredentials('com.corelink.todoist');
      return reply.send({ connected: hasCredentials, accounts: [] });
    }
  });

  /**
   * Disconnect Todoist
   */
  fastify.delete('/oauth/todoist', async (_request, reply) => {
    await credentialManager.deleteCredentials('com.corelink.todoist');
    return reply.send({ success: true });
  });
}
