import type { Account } from '../api/client';

interface AccountSelectorProps {
  accounts: Account[];
  selectedAccountId: string | null;
  onSelect: (accountId: string | null) => void;
  label?: string;
  includeAllOption?: boolean;
}

const pluginIcons: Record<string, string> = {
  'com.corelink.gmail': '📧',
  'com.corelink.outlook': '📨',
};

export function AccountSelector({
  accounts,
  selectedAccountId,
  onSelect,
  label = 'Account',
  includeAllOption = true,
}: AccountSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-sm font-medium text-gray-700">{label}</label>}
      <select
        value={selectedAccountId || ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
      >
        {includeAllOption && <option value="">All Accounts</option>}
        {accounts.map((account) => {
          const icon = pluginIcons[account.pluginId] || '📧';
          const displayText = account.displayName
            ? `${icon} ${account.displayName} (${account.email})`
            : `${icon} ${account.email}`;
          const primaryTag = account.isPrimary ? ' [Primary]' : '';

          return (
            <option key={account.id} value={account.id}>
              {displayText}{primaryTag}
            </option>
          );
        })}
      </select>
    </div>
  );
}
