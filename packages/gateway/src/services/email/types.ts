/**
 * CoreLink Email Service Types
 *
 * Normalized types for email operations across different providers
 */

/**
 * Account information
 */
export interface Account {
  id: string; // UUID
  pluginId: string; // e.g., "com.corelink.gmail"
  email: string; // Account identifier (e.g., "work@gmail.com")
  displayName?: string; // Optional friendly name
  isPrimary: boolean; // One primary account per plugin
  metadata?: Record<string, unknown>; // Provider-specific data
  createdAt: string;
  updatedAt: string;
}

/**
 * Normalized email structure
 */
export interface Email {
  id: string; // Provider-specific ID
  accountId: string; // Which account this email belongs to
  providerId: string; // e.g., "com.corelink.gmail"

  // Email metadata
  subject: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress[];

  // Content
  body?: string; // Plain text body
  htmlBody?: string; // HTML body
  snippet?: string; // First ~200 chars preview

  // Metadata
  timestamp: number; // Unix timestamp in milliseconds
  isRead: boolean;
  isStarred?: boolean;
  labels?: string[]; // Gmail labels / Outlook categories
  threadId?: string; // For threading support

  // Attachments
  hasAttachments: boolean;
  attachments?: EmailAttachment[];

  // Provider-specific raw data
  raw?: Record<string, unknown>;
}

/**
 * Email address structure
 */
export interface EmailAddress {
  email: string;
  name?: string;
}

/**
 * Email attachment metadata
 */
export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number; // Bytes
  contentId?: string; // For inline images
}

/**
 * Arguments for listing emails
 */
export interface ListEmailsArgs {
  max_results?: number; // Default: 10, Max: 500
  query?: string; // Search query (provider-specific syntax)
  labels?: string[]; // Filter by labels/categories
  isRead?: boolean; // Filter by read/unread
  includeSpam?: boolean; // Include spam folder
  includeTrash?: boolean; // Include trash
}

/**
 * Arguments for sending emails
 */
export interface SendEmailArgs {
  to: string | string[]; // Recipient email(s)
  subject: string;
  body: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  attachments?: EmailAttachment[];
  htmlBody?: string; // If provided, sent as multipart
}

/**
 * Arguments for searching emails
 */
export interface SearchEmailsArgs {
  query: string; // Search term
  max_results?: number;
  from?: string; // Filter by sender
  to?: string; // Filter by recipient
  subject?: string; // Filter by subject
  hasAttachment?: boolean;
  dateFrom?: string; // ISO8601 date
  dateTo?: string;
}

/**
 * Result of sending an email
 */
export interface EmailResult {
  success: boolean;
  messageId?: string; // Provider's message ID
  threadId?: string; // Thread ID if applicable
  error?: string;
}

/**
 * Email service statistics
 */
export interface EmailStats {
  totalAccounts: number;
  totalEmails: number;
  unreadCount: number;
  byProvider: Record<string, number>;
  byAccount: Record<string, number>;
}
