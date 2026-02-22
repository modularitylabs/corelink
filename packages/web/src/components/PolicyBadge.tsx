import type { PolicyAction } from '../api/client';

interface PolicyBadgeProps {
  action: PolicyAction;
  className?: string;
}

const badgeStyles: Record<PolicyAction, string> = {
  ALLOW: 'bg-green-100 text-green-800 border-green-200',
  BLOCK: 'bg-red-100 text-red-800 border-red-200',
  REDACT: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  REQUIRE_APPROVAL: 'bg-blue-100 text-blue-800 border-blue-200',
};

export function PolicyBadge({ action, className = '' }: PolicyBadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
        badgeStyles[action]
      } ${className}`}
    >
      {action}
    </span>
  );
}
