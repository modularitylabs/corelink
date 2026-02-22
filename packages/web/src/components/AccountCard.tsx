import { useState } from 'react';
import type { Account } from '../api/client';
import { setPrimaryAccount, deleteAccount } from '../api/client';
import { ConfirmDialog } from './ConfirmDialog';

interface AccountCardProps {
  account: Account;
  onUpdate?: () => void;
}

const pluginIcons: Record<string, string> = {
  'com.corelink.gmail': '📧',
  'com.corelink.outlook': '📨',
};

const pluginColors: Record<string, string> = {
  'com.corelink.gmail': 'border-purple-200 bg-purple-50',
  'com.corelink.outlook': 'border-blue-200 bg-blue-50',
};

export function AccountCard({ account, onUpdate }: AccountCardProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const icon = pluginIcons[account.pluginId] || '📧';
  const colorClass = pluginColors[account.pluginId] || 'border-gray-200 bg-gray-50';

  const handleSetPrimary = async () => {
    if (account.isPrimary) return;

    setIsLoading(true);
    try {
      await setPrimaryAccount(account.id);
      onUpdate?.();
    } catch (error) {
      console.error('Failed to set primary account:', error);
      alert('Failed to set primary account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      await deleteAccount(account.id);
      onUpdate?.();
      setIsDeleteDialogOpen(false);
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Failed to delete account');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <div className={`border rounded-lg p-4 ${colorClass}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="text-3xl">{icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {account.displayName || account.email}
                </h3>
                {account.isPrimary && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                    Primary
                  </span>
                )}
              </div>
              {account.displayName && (
                <p className="text-xs text-gray-600 truncate">{account.email}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Connected {new Date(account.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-4">
            {!account.isPrimary && (
              <button
                onClick={handleSetPrimary}
                disabled={isLoading}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
              >
                Set Primary
              </button>
            )}
            <button
              onClick={() => setIsDeleteDialogOpen(true)}
              disabled={isLoading}
              className="text-xs text-red-600 hover:text-red-700 font-medium disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onCancel={() => setIsDeleteDialogOpen(false)}
        onConfirm={handleDelete}
        title="Remove Account"
        message={`Are you sure you want to remove ${account.email}? This will delete all associated credentials.`}
        confirmText="Remove"
        variant="danger"
      />
    </>
  );
}
