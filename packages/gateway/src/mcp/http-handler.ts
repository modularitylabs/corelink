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
 * Session manager for HTTP transports
 * Maps session IDs to their corresponding transports
 */
export class MCPSessionManager {
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  /**
   * Handle an incoming MCP HTTP request
   */
  async handleRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    mcpServer: McpServer
  ): Promise<void> {
    const sessionId = request.headers['mcp-session-id'] as string | undefined;

    // Log request for debugging
    if (sessionId) {
      console.log(`[MCP HTTP] Request for session: ${sessionId}`);
    } else {
      console.log(`[MCP HTTP] New request (no session ID)`);
    }

    try {
      let transport: StreamableHTTPServerTransport;

      // Check if this is a request for an existing session
      if (sessionId && this.transports.has(sessionId)) {
        transport = this.transports.get(sessionId)!;
      }
      // New initialization request
      else if (!sessionId && this.isInitializeRequest(request.body)) {
        transport = this.createTransport(mcpServer);
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
      await transport.handleRequest(request.raw, reply.raw, request.body);
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
   * Create a new transport for a session
   */
  private createTransport(mcpServer: McpServer): StreamableHTTPServerTransport {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        console.log(`[MCP HTTP] Session initialized: ${sessionId}`);
        this.transports.set(sessionId, transport);
      },
    });

    // Set up cleanup when transport closes
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid && this.transports.has(sid)) {
        console.log(`[MCP HTTP] Transport closed for session ${sid}`);
        this.transports.delete(sid);
      }
    };

    // Connect transport to MCP server
    mcpServer.connect(transport).catch((error) => {
      console.error('[MCP HTTP] Failed to connect transport:', error);
    });

    return transport;
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
    return this.transports.size;
  }

  /**
   * Cleanup all transports (for server shutdown)
   */
  async cleanup(): Promise<void> {
    console.log(`[MCP HTTP] Cleaning up ${this.transports.size} active sessions`);

    const closePromises = Array.from(this.transports.values()).map(async (transport) => {
      try {
        await transport.close();
      } catch (error) {
        console.error('[MCP HTTP] Error closing transport:', error);
      }
    });

    await Promise.all(closePromises);
    this.transports.clear();
  }
}
