/**
 * CoreLink Core Types
 *
 * Shared type definitions used across all CoreLink packages and plugins.
 */

export * from './plugin.js';
export * from './policy.js';
export * from './audit.js';

/**
 * Common error types
 */
export class CoreLinkError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CoreLinkError';
  }
}

export class PluginError extends CoreLinkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'PLUGIN_ERROR', details);
    this.name = 'PluginError';
  }
}

export class PolicyError extends CoreLinkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'POLICY_ERROR', details);
    this.name = 'PolicyError';
  }
}

export class AuthError extends CoreLinkError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AUTH_ERROR', details);
    this.name = 'AuthError';
  }
}
