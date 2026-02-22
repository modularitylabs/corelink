import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { Account } from '../api/client';
import {
  getAccounts,
  startGmailOAuth,
  startOutlookOAuth,
  getGmailStatus,
  getOutlookStatus,
} from '../api/client';
import { AccountCard } from '../components/AccountCard';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<'provider' | 'all'>('provider');

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    try {
      const data = await getAccounts();
      setAccounts(data);
    } catch (error) {
      toast.error('Failed to load accounts');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectGmail() {
    try {
      const data = await startGmailOAuth();
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=700');

        const initialCount = accounts.filter((a) => a.pluginId === 'com.corelink.gmail').length;
        const interval = setInterval(async () => {
          const statusData = await getGmailStatus();
          if (statusData.accounts && statusData.accounts.length > initialCount) {
            await loadAccounts();
            clearInterval(interval);
            toast.success('Gmail account connected successfully');
          }
        }, 2000);

        setTimeout(() => clearInterval(interval), 120000);
      }
    } catch (error) {
      toast.error('Failed to connect Gmail');
      console.error(error);
    }
  }

  async function handleConnectOutlook() {
    try {
      const data = await startOutlookOAuth();
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=700');

        const initialCount = accounts.filter((a) => a.pluginId === 'com.corelink.outlook').length;
        const interval = setInterval(async () => {
          const statusData = await getOutlookStatus();
          if (statusData.accounts && statusData.accounts.length > initialCount) {
            await loadAccounts();
            clearInterval(interval);
            toast.success('Outlook account connected successfully');
          }
        }, 2000);

        setTimeout(() => clearInterval(interval), 120000);
      }
    } catch (error) {
      toast.error('Failed to connect Outlook');
      console.error(error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const gmailAccounts = accounts.filter((a) => a.pluginId === 'com.corelink.gmail');
  const outlookAccounts = accounts.filter((a) => a.pluginId === 'com.corelink.outlook');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Management</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage all connected accounts across providers
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as 'provider' | 'all')}
            className="text-sm rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
          >
            <option value="provider">Group by Provider</option>
            <option value="all">Show All</option>
          </select>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-xl">
              📧
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{gmailAccounts.length}</p>
              <p className="text-sm text-gray-600">Gmail Accounts</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-xl">
              📨
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{outlookAccounts.length}</p>
              <p className="text-sm text-gray-600">Outlook Accounts</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-xl">
              ✓
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{accounts.length}</p>
              <p className="text-sm text-gray-600">Total Accounts</p>
            </div>
          </div>
        </div>
      </div>

      {groupBy === 'provider' ? (
        <div className="space-y-6">
          {/* Gmail Section */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-2xl">
                  📧
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Gmail</h3>
                  <p className="text-xs text-gray-500">
                    {gmailAccounts.length} account{gmailAccounts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={handleConnectGmail}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition"
              >
                Add Gmail Account
              </button>
            </div>

            {gmailAccounts.length > 0 ? (
              <div className="space-y-2">
                {gmailAccounts.map((account) => (
                  <AccountCard key={account.id} account={account} onUpdate={loadAccounts} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                No Gmail accounts connected yet
              </div>
            )}
          </div>

          {/* Outlook Section */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-2xl">
                  📨
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Outlook</h3>
                  <p className="text-xs text-gray-500">
                    {outlookAccounts.length} account{outlookAccounts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={handleConnectOutlook}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
              >
                Add Outlook Account
              </button>
            </div>

            {outlookAccounts.length > 0 ? (
              <div className="space-y-2">
                {outlookAccounts.map((account) => (
                  <AccountCard key={account.id} account={account} onUpdate={loadAccounts} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                No Outlook accounts connected yet
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          {accounts.length > 0 ? (
            <div className="space-y-2">
              {accounts.map((account) => (
                <AccountCard key={account.id} account={account} onUpdate={loadAccounts} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No accounts connected yet</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={handleConnectGmail}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition"
                >
                  Add Gmail Account
                </button>
                <button
                  onClick={handleConnectOutlook}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                >
                  Add Outlook Account
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Multi-Account Support</h3>
        <ul className="text-sm space-y-1 text-blue-800">
          <li>• Connect multiple accounts per provider (e.g., work@gmail.com + personal@gmail.com)</li>
          <li>• Primary account is used by default when no account is specified</li>
          <li>• Each account has independent credentials and policies</li>
          <li>• AI agents can access all connected accounts based on your policies</li>
        </ul>
      </div>
    </div>
  );
}
