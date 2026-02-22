/**
 * CoreLink Policy and Redaction Pattern Seed Data
 *
 * Populates the database with default policies and redaction patterns
 * to provide a good starting experience for users.
 */

import { db } from './index.js';
import { policyRules, redactionPatterns } from './schema.js';

/**
 * Default policy rules
 */
const defaultPolicies = [
  // High priority: Block all send_email operations by default
  {
    id: 'pol-block-send-email',
    pluginId: null, // Global rule
    action: 'BLOCK',
    condition: JSON.stringify({
      '==': [{ var: 'tool' }, 'send_email'],
    }),
    description: 'Block all email sending operations for safety',
    priority: 200,
    enabled: true,
  },

  // Medium priority: Require approval for high-volume email reads
  {
    id: 'pol-approve-high-volume',
    pluginId: null,
    action: 'REQUIRE_APPROVAL',
    condition: JSON.stringify({
      and: [
        { '==': [{ var: 'tool' }, 'list_emails'] },
        { '>': [{ var: 'args.max_results' }, 100] },
      ],
    }),
    description: 'Require approval when requesting more than 100 emails',
    priority: 150,
    enabled: true,
  },

  // Medium priority: Redact email body content
  {
    id: 'pol-redact-email-body',
    pluginId: null,
    action: 'REDACT',
    condition: JSON.stringify({
      '==': [{ var: 'tool' }, 'read_email'],
    }),
    description: 'Redact sensitive information from email body content',
    priority: 100,
    enabled: true,
  },

  // Low priority: Allow list_emails with reasonable limits (≤10)
  {
    id: 'pol-allow-list-10',
    pluginId: null,
    action: 'ALLOW',
    condition: JSON.stringify({
      and: [
        { '==': [{ var: 'tool' }, 'list_emails'] },
        { '<=': [{ var: 'args.max_results' }, 10] },
      ],
    }),
    description: 'Allow listing up to 10 emails',
    priority: 50,
    enabled: true,
  },

  // Low priority: Allow list_emails with moderate limits (≤50)
  {
    id: 'pol-allow-list-50',
    pluginId: null,
    action: 'ALLOW',
    condition: JSON.stringify({
      and: [
        { '==': [{ var: 'tool' }, 'list_emails'] },
        { '<=': [{ var: 'args.max_results' }, 50] },
      ],
    }),
    description: 'Allow listing up to 50 emails',
    priority: 40,
    enabled: true,
  },

  // Low priority: Allow list_emails with high limits (≤100)
  {
    id: 'pol-allow-list-100',
    pluginId: null,
    action: 'ALLOW',
    condition: JSON.stringify({
      and: [
        { '==': [{ var: 'tool' }, 'list_emails'] },
        { '<=': [{ var: 'args.max_results' }, 100] },
      ],
    }),
    description: 'Allow listing up to 100 emails',
    priority: 30,
    enabled: true,
  },

  // Low priority: Allow search_emails
  {
    id: 'pol-allow-search',
    pluginId: null,
    action: 'ALLOW',
    condition: JSON.stringify({
      '==': [{ var: 'tool' }, 'search_emails'],
    }),
    description: 'Allow email search operations',
    priority: 20,
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
