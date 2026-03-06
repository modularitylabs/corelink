/**
 * Task Management REST API
 *
 * Endpoints for querying and managing tasks:
 * - GET /api/tasks/:id - Get task status
 * - POST /api/tasks/:id/cancel - Cancel specific task
 * - POST /api/tasks/session/:sessionId/cancel - Cancel all tasks for session
 * - GET /api/tasks/session/:sessionId - Get all tasks for session
 * - GET /api/tasks/session/:sessionId/stats - Get task statistics
 * - GET /api/tasks/stream - Server-Sent Events for real-time updates
 */

import type { FastifyInstance } from 'fastify';
import type { SessionTaskManager } from '../services/task-queue/index.js';
import type { TaskCleanupService } from '../services/task-cleanup.js';
import { TASK_RETENTION_DAYS } from '../config/task-queue.js';

/**
 * Register task management routes
 */
export async function taskRoutes(
  fastify: FastifyInstance,
  taskManager: SessionTaskManager,
  cleanupService?: TaskCleanupService
) {
  /**
   * Get task status by ID
   */
  fastify.get<{
    Params: { id: string };
  }>('/api/tasks/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const task = await taskManager.getTaskStatus(id);

      if (!task) {
        return reply.status(404).send({
          error: 'Task not found',
          taskId: id,
        });
      }

      return reply.send(task);
    } catch (error) {
      fastify.log.error({ err: error }, 'Error getting task status');
      return reply.status(500).send({
        error: 'Failed to get task status',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Cancel specific task
   */
  fastify.post<{
    Params: { id: string };
  }>('/api/tasks/:id/cancel', async (request, reply) => {
    try {
      const { id } = request.params;
      const cancelled = await taskManager.cancelTask(id);

      if (!cancelled) {
        return reply.status(404).send({
          error: 'Task not found or already in terminal state',
          taskId: id,
        });
      }

      return reply.send({
        success: true,
        taskId: id,
        message: 'Task cancelled successfully',
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error cancelling task');
      return reply.status(500).send({
        error: 'Failed to cancel task',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Cancel all tasks for a session
   */
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/tasks/session/:sessionId/cancel', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const cancelledCount = await taskManager.cancelAllForSession(sessionId);

      return reply.send({
        success: true,
        sessionId,
        cancelledCount,
        message: `Cancelled ${cancelledCount} tasks`,
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error cancelling session tasks');
      return reply.status(500).send({
        error: 'Failed to cancel session tasks',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Get session state (workers and stats)
   */
  fastify.get<{
    Params: { sessionId: string };
  }>('/api/tasks/session/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const state = await taskManager.getSessionState(sessionId);

      if (!state) {
        return reply.status(404).send({
          error: 'Session not found',
          sessionId,
        });
      }

      return reply.send(state);
    } catch (error) {
      fastify.log.error({ err: error }, 'Error getting session state');
      return reply.status(500).send({
        error: 'Failed to get session state',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Get task statistics for a session
   */
  fastify.get<{
    Params: { sessionId: string };
  }>('/api/tasks/session/:sessionId/stats', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const state = await taskManager.getSessionState(sessionId);

      if (!state) {
        return reply.status(404).send({
          error: 'Session not found',
          sessionId,
        });
      }

      return reply.send(state.stats);
    } catch (error) {
      fastify.log.error({ err: error }, 'Error getting task stats');
      return reply.status(500).send({
        error: 'Failed to get task statistics',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Get all session states (for monitoring)
   */
  fastify.get('/api/tasks/sessions', async (_request, reply) => {
    try {
      const states = await taskManager.getAllSessionStates();
      return reply.send(states);
    } catch (error) {
      fastify.log.error({ err: error }, 'Error getting all session states');
      return reply.status(500).send({
        error: 'Failed to get session states',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Approve pending task (REQUIRE_APPROVAL policy)
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      modifiedArgs?: Record<string, unknown>;
    };
  }>('/api/tasks/:id/approve', async (request, reply) => {
    try {
      const { id } = request.params;
      const { modifiedArgs } = request.body;

      const approved = await taskManager.approveTask(id, modifiedArgs);

      if (!approved) {
        return reply.status(404).send({
          error: 'Task not found or not in pending_approval state',
          taskId: id,
        });
      }

      return reply.send({
        success: true,
        taskId: id,
        message: 'Task approved successfully',
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error approving task');
      return reply.status(500).send({
        error: 'Failed to approve task',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Deny pending task (REQUIRE_APPROVAL policy)
   */
  fastify.post<{
    Params: { id: string };
    Body: {
      reason?: string;
    };
  }>('/api/tasks/:id/deny', async (request, reply) => {
    try {
      const { id } = request.params;
      const { reason } = request.body;

      const denied = await taskManager.denyTask(id, reason);

      if (!denied) {
        return reply.status(404).send({
          error: 'Task not found or not in pending_approval state',
          taskId: id,
        });
      }

      return reply.send({
        success: true,
        taskId: id,
        message: 'Task denied successfully',
      });
    } catch (error) {
      fastify.log.error({ err: error }, 'Error denying task');
      return reply.status(500).send({
        error: 'Failed to deny task',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Server-Sent Events endpoint for real-time task updates
   * Clients can listen for updates on specific sessions or all sessions
   */
  fastify.get<{
    Querystring: {
      sessionId?: string;
    };
  }>('/api/tasks/stream', async (request, reply) => {
    const { sessionId } = request.query;

    // Set headers for SSE
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    // Send initial connection message
    reply.raw.write(`data: ${JSON.stringify({ type: 'connected', sessionId: sessionId || 'all' })}\n\n`);

    // Send stats every 2 seconds
    const interval = setInterval(async () => {
      try {
        if (sessionId) {
          // Send stats for specific session
          const state = await taskManager.getSessionState(sessionId);
          if (state) {
            reply.raw.write(
              `data: ${JSON.stringify({ type: 'stats', sessionId, data: state.stats })}\n\n`
            );
          }
        } else {
          // Send stats for all sessions
          const states = await taskManager.getAllSessionStates();
          reply.raw.write(
            `data: ${JSON.stringify({ type: 'all_stats', data: states })}\n\n`
          );
        }
      } catch (error) {
        fastify.log.error({ err: error }, 'Error in SSE stream');
      }
    }, 2000);

    // Clean up on connection close
    request.raw.on('close', () => {
      clearInterval(interval);
      reply.raw.end();
    });
  });

  /**
   * Manual task cleanup endpoint
   * POST /api/tasks/cleanup?dryRun=true&retentionDays=30
   */
  if (cleanupService) {
    fastify.post<{
      Querystring: {
        dryRun?: string;
        retentionDays?: string;
      };
    }>('/api/tasks/cleanup', async (request, reply) => {
      try {
        const dryRun = request.query.dryRun === 'true';
        const retentionDays = request.query.retentionDays
          ? parseInt(request.query.retentionDays, 10)
          : TASK_RETENTION_DAYS;

        if (isNaN(retentionDays) || retentionDays < 1) {
          return reply.status(400).send({
            error: 'Invalid retentionDays parameter',
            message: 'retentionDays must be a positive integer',
          });
        }

        const stats = await cleanupService.cleanup(retentionDays, dryRun);

        return reply.send({
          success: true,
          dryRun,
          stats,
          message: dryRun
            ? `Would delete ${stats.deletedCount} tasks older than ${retentionDays} days`
            : `Deleted ${stats.deletedCount} tasks older than ${retentionDays} days`,
        });
      } catch (error) {
        fastify.log.error({ err: error }, 'Error during task cleanup');
        return reply.status(500).send({
          error: 'Failed to cleanup tasks',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });
  }

  fastify.log.info('Task management routes registered');
}
