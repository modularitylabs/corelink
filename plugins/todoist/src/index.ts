/**
 * Todoist Plugin for CoreLink
 *
 * Schema definitions for Todoist task operations.
 * Execution is handled by the gateway via TodoistProvider.
 */

import {
  ActionResult,
  ConfigField,
  ExecutionContext,
  ICoreLinkPlugin,
  PluginError,
  STANDARD_TOOLS,
  ToolDefinition,
} from '@corelink/core';

export class TodoistPlugin implements ICoreLinkPlugin {
  readonly id = 'com.corelink.todoist';
  readonly name = 'Todoist';
  readonly version = '0.1.0';
  readonly category = 'task' as const;
  readonly description = 'Access Todoist tasks with granular control';

  /**
   * OAuth2 configuration schema
   */
  getConfigSchema(): Record<string, ConfigField> {
    return {
      clientId: {
        type: 'text',
        label: 'Todoist Client ID',
        description: 'OAuth 2.0 Client ID from Todoist App Console',
        required: true,
      },
    };
  }

  /**
   * Standard task tools
   */
  getStandardTools(): ToolDefinition[] {
    return [
      {
        name: STANDARD_TOOLS.TASK_LIST,
        description: 'List tasks from Todoist',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'Filter by project ID (optional)',
            },
            filter: {
              type: 'string',
              description: 'Todoist filter expression (optional)',
            },
            max_results: {
              type: 'number',
              description: 'Maximum number of tasks to return',
              default: 20,
            },
          },
        },
      },
      {
        name: STANDARD_TOOLS.TASK_CREATE,
        description: 'Create a new task in Todoist',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Task title',
            },
            description: {
              type: 'string',
              description: 'Task description (optional)',
            },
            due_date: {
              type: 'string',
              description: 'Due date in ISO8601 format (optional)',
            },
            priority: {
              type: 'number',
              description: 'Priority: 1 (normal), 2 (medium), 3 (high), 4 (urgent)',
            },
            project_id: {
              type: 'string',
              description: 'Project ID to add task to (optional)',
            },
          },
          required: ['title'],
        },
      },
      {
        name: STANDARD_TOOLS.TASK_UPDATE,
        description: 'Update an existing Todoist task',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'Task ID to update',
            },
            title: {
              type: 'string',
              description: 'New task title (optional)',
            },
            description: {
              type: 'string',
              description: 'New task description (optional)',
            },
            due_date: {
              type: 'string',
              description: 'New due date in ISO8601 format (optional)',
            },
            priority: {
              type: 'number',
              description: 'New priority: 1-4 (optional)',
            },
          },
          required: ['task_id'],
        },
      },
      {
        name: STANDARD_TOOLS.TASK_COMPLETE,
        description: 'Mark a Todoist task as completed',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'Task ID to mark as completed',
            },
          },
          required: ['task_id'],
        },
      },
    ];
  }

  /**
   * Execute a tool - not used directly (gateway handles execution via TodoistProvider)
   */
  async execute(
    _toolName: string,
    _args: Record<string, unknown>,
    _context: ExecutionContext
  ): Promise<ActionResult> {
    throw new PluginError(
      'TodoistPlugin.execute() should not be called directly. Use the gateway TaskService.'
    );
  }
}

export default TodoistPlugin;
