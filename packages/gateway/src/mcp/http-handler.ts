/**
 * MCP HTTP Transport Handler for Fastify
 *
 * Provides Streamable HTTP transport for MCP over Fastify
 */

import { randomUUID } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * Factory function to create a new MCP server instance
 */
type McpServerFactory = () => McpServer;

/**
 * Session data including transport and server instance
 */
interface SessionData {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

/**
 * Session manager for HTTP transports
 * Maps session IDs to their corresponding transports and servers
 */
export class MCPSessionManager {
  private sessions: Map<string, SessionData> = new Map();
  private serverFactory: McpServerFactory;

  constructor(serverFactory: McpServerFactory) {
    this.serverFactory = serverFactory;
  }

  /**
   * Handle an incoming MCP HTTP request
   */
  async handleRequest(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;

    // Log request for debugging
    if (sessionId) {
      console.log(`[MCP HTTP] Request for session: ${sessionId}`);
    } else {
      console.log(`[MCP HTTP] New request (no session ID)`);
    }

    try {
      let sessionData: SessionData;

      // Check if this is a request for an existing session
      if (sessionId && this.sessions.has(sessionId)) {
        sessionData = this.sessions.get(sessionId)!;
      }
      // New initialization request
      else if (!sessionId && this.isInitializeRequest(request.body)) {
        sessionData = await this.createSession();
      }
      // Invalid request
      else {
        reply.code(400).send({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: No valid session ID provided or not an initialization request',
          },
          id: null,
        });
        return;
      }

      // Convert Fastify request/reply to Node.js IncomingMessage/ServerResponse
      // Fastify exposes these via request.raw and reply.raw
      await sessionData.transport.handleRequest(request.raw, reply.raw, request.body);
    } catch (error) {
      console.error('[MCP HTTP] Error handling request:', error);
      if (!reply.sent) {
        reply.code(500).send({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  }

  /**
   * Create a new session with its own MCP server and transport
   */
  private async createSession(): Promise<SessionData> {
    // Create a new MCP server instance for this session
    const server = this.serverFactory();

    // Create transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        console.log(`[MCP HTTP] Session initialized: ${sessionId}`);
        const sessionData: SessionData = { transport, server };
        this.sessions.set(sessionId, sessionData);
      },
    });

    // Set up cleanup when transport closes
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && this.sessions.has(sid)) {
        console.log(`[MCP HTTP] Transport closed for session ${sid}`);
        this.sessions.delete(sid);
      }
    };

    // Connect transport to MCP server
    await server.connect(transport);

    return { transport, server };
  }

  /**
   * Check if request body is an initialization request
   */
  private isInitializeRequest(body: unknown): boolean {
    if (typeof body !== 'object' || body === null) {
      return false;
    }

    const req = body as { method?: string };
    return req.method === 'initialize';
  }

  /**
   * Get active session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Cleanup all sessions (for server shutdown)
   */
  async cleanup(): Promise<void> {
    console.log(`[MCP HTTP] Cleaning up ${this.sessions.size} active sessions`);

    const closePromises = Array.from(this.sessions.values()).map(async ({ transport, server }) => {
      try {
        await server.close();
        await transport.close();
      } catch (error) {
        console.error('[MCP HTTP] Error closing session:', error);
      }
    });

    await Promise.all(closePromises);
    this.sessions.clear();
  }
}
