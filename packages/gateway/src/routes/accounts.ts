/**
 * Account Management Routes
 *
 * REST API for managing multiple accounts per provider
 * Supports multi-account scenarios (e.g., work@gmail.com + personal@gmail.com)
 */

import type { FastifyInstance } from 'fastify';
import { CredentialManager } from '../services/credential-manager.js';

export async function accountRoutes(
  fastify: FastifyInstance,
  credentialManager: CredentialManager
) {
  /**
   * List all accounts (or filter by plugin)
   * GET /api/accounts?pluginId=com.corelink.gmail
   */
  fastify.get<{
    Querystring: { pluginId?: string };
  }>('/api/accounts', async (request, reply) => {
    try {
      const { pluginId } = request.query;
      const accounts = await credentialManager.listAccounts(pluginId);
      return reply.send(accounts);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to list accounts',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Get single account by ID
   * GET /api/accounts/:id
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/accounts/:id', async (request, reply) => {
    try {
      const account = await credentialManager.getAccount(request.params.id);

      if (!account) {
        return reply.status(404).send({ error: 'Account not found' });
      }

      return reply.send(account);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get account',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Get primary account for a plugin
   * GET /api/accounts/primary?pluginId=com.corelink.gmail
   */
  fastify.get<{
    Querystring: { pluginId: string };
  }>('/api/accounts/primary', async (request, reply) => {
    try {
      const { pluginId } = request.query;

      if (!pluginId) {
        return reply.status(400).send({ error: 'pluginId query parameter is required' });
      }

      const account = await credentialManager.getPrimaryAccount(pluginId);
      return reply.send(account);
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to get primary account',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Set account as primary
   * POST /api/accounts/:id/set-primary
   */
  fastify.post<{
    Params: { id: string };
  }>('/api/accounts/:id/set-primary', async (request, reply) => {
    try {
      await credentialManager.setPrimaryAccount(request.params.id);
      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to set primary account',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Update account (displayName, metadata)
   * PUT /api/accounts/:id
   */
  fastify.put<{
    Params: { id: string };
    Body: {
      displayName?: string;
      metadata?: Record<string, unknown>;
    };
  }>('/api/accounts/:id', async (request, reply) => {
    try {
      await credentialManager.updateAccount(request.params.id, request.body);
      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to update account',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Delete account and its credentials
   * DELETE /api/accounts/:id
   */
  fastify.delete<{
    Params: { id: string };
  }>('/api/accounts/:id', async (request, reply) => {
    try {
      await credentialManager.deleteAccount(request.params.id);
      return reply.send({ success: true });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({
        error: 'Failed to delete account',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}
