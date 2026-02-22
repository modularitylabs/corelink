/**
 * CoreLink Policy and Redaction Pattern Seed Data
 *
 * Populates the database with default policies and redaction patterns
 * to provide a good starting experience for users.
 */

import { db } from './index.js';
import { policyRules, redactionPatterns } from './schema.js';

/**
 * Default policy rules - organized by category
 */
const defaultPolicies = [
  // ===================
  // EMAIL CATEGORY POLICIES
  // ===================

  // High priority: Block all send_email operations by default
  {
    id: 'pol-email-block-send',
    category: 'email', // Email category-specific
    pluginId: null,
    action: 'BLOCK',
    condition: JSON.stringify({
      '==': [{ var: 'tool' }, 'send_email'],
    }),
    description: 'Email: Block all email sending operations for safety',
    priority: 200,
    enabled: true,
  },

  // Medium priority: Require approval for high-volume email reads
  {
    id: 'pol-email-approve-high-volume',
    category: 'email',
    pluginId: null,
    action: 'REQUIRE_APPROVAL',
    condition: JSON.stringify({
      '>': [{ var: 'args.max_results' }, 100],
    }),
    description: 'Email: Require approval when requesting more than 100 emails',
    priority: 150,
    enabled: true,
  },

  // Medium priority: Redact email body content
  {
    id: 'pol-email-redact-body',
    category: 'email',
    pluginId: null,
    action: 'REDACT',
    condition: JSON.stringify({
      '==': [{ var: 'tool' }, 'read_email'],
    }),
    description: 'Email: Redact sensitive information from email body content',
    priority: 100,
    enabled: true,
  },

  // Low priority: Allow listing up to 50 emails (reasonable default)
  {
    id: 'pol-email-allow-list-50',
    category: 'email',
    pluginId: null,
    action: 'ALLOW',
    condition: JSON.stringify({
      '<=': [{ var: 'args.max_results' }, 50],
    }),
    description: 'Email: Allow listing up to 50 emails',
    priority: 50,
    enabled: true,
  },

  // Low priority: Allow email search operations
  {
    id: 'pol-email-allow-search',
    category: 'email',
    pluginId: null,
    action: 'ALLOW',
    condition: JSON.stringify({
      '==': [{ var: 'tool' }, 'search_emails'],
    }),
    description: 'Email: Allow email search operations',
    priority: 40,
    enabled: true,
  },

  // ===================
  // GLOBAL POLICIES (apply to all categories)
  // ===================

  // Block any tool with "delete" in the name (safety measure)
  {
    id: 'pol-global-block-delete',
    category: null, // Global - applies to all categories
    pluginId: null,
    action: 'BLOCK',
    condition: JSON.stringify({
      in: ['delete', { var: 'tool' }],
    }),
    description: 'Global: Block all deletion operations for safety',
    priority: 300,
    enabled: true,
  },
];

/**
 * Default redaction patterns
 */
const defaultRedactionPatterns = [
  // Email addresses
  {
    id: 'red-email',
    name: 'Email Addresses',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    replacement: '[EMAIL_REDACTED]',
    description: 'Redact email addresses from content',
    enabled: false, // Disabled by default - can be enabled by user
  },

  // Phone numbers (US format)
  {
    id: 'red-phone-us',
    name: 'US Phone Numbers',
    pattern: '\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b',
    replacement: '[PHONE_REDACTED]',
    description: 'Redact US phone numbers (XXX-XXX-XXXX format)',
    enabled: false,
  },

  // Social Security Numbers
  {
    id: 'red-ssn',
    name: 'Social Security Numbers',
    pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
    replacement: '[SSN_REDACTED]',
    description: 'Redact US Social Security Numbers (XXX-XX-XXXX)',
    enabled: false,
  },

  // Credit card numbers (basic pattern)
  {
    id: 'red-credit-card',
    name: 'Credit Card Numbers',
    pattern: '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b',
    replacement: '[CARD_REDACTED]',
    description: 'Redact credit card numbers',
    enabled: false,
  },

  // API keys (common patterns)
  {
    id: 'red-api-key',
    name: 'API Keys',
    pattern: '\\b[a-zA-Z0-9]{32,}\\b',
    replacement: '[API_KEY_REDACTED]',
    description: 'Redact potential API keys (32+ alphanumeric chars)',
    enabled: false,
  },

  // Bearer tokens
  {
    id: 'red-bearer-token',
    name: 'Bearer Tokens',
    pattern: 'Bearer\\s+[a-zA-Z0-9._-]+',
    replacement: 'Bearer [TOKEN_REDACTED]',
    description: 'Redact Bearer authentication tokens',
    enabled: false,
  },

  // IPv4 addresses
  {
    id: 'red-ipv4',
    name: 'IPv4 Addresses',
    pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b',
    replacement: '[IP_REDACTED]',
    description: 'Redact IPv4 addresses',
    enabled: false,
  },
];

/**
 * Seed the database with default policies and redaction patterns
 */
export async function seedPolicies(): Promise<void> {
  console.log('[CoreLink] Seeding default policies and redaction patterns...');

  try {
    // Insert default policies
    for (const policy of defaultPolicies) {
      try {
        await db.insert(policyRules).values(policy).onConflictDoNothing();
        console.log(`  ✓ Created policy: ${policy.id}`);
      } catch (error) {
        // Policy might already exist - skip
        console.log(`  - Policy ${policy.id} already exists, skipping`);
      }
    }

    // Insert default redaction patterns
    for (const pattern of defaultRedactionPatterns) {
      try {
        await db.insert(redactionPatterns).values(pattern).onConflictDoNothing();
        console.log(`  ✓ Created redaction pattern: ${pattern.id}`);
      } catch (error) {
        // Pattern might already exist - skip
        console.log(`  - Redaction pattern ${pattern.id} already exists, skipping`);
      }
    }

    console.log('[CoreLink] Seed data created successfully!');
  } catch (error) {
    console.error('[CoreLink] Error seeding database:', error);
    throw error;
  }
}

/**
 * CLI entry point for running seed script directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  seedPolicies()
    .then(() => {
      console.log('✅ Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}
