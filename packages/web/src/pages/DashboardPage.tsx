import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { Account } from '../api/client';
import {
  getGmailStatus,
  getOutlookStatus,
  startGmailOAuth,
  startOutlookOAuth,
} from '../api/client';
import { AccountCard } from '../components/AccountCard';

export function DashboardPage() {
  const [gmailAccounts, setGmailAccounts] = useState<Account[]>([]);
  const [outlookAccounts, setOutlookAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const [gmailData, outlookData] = await Promise.all([
        getGmailStatus(),
        getOutlookStatus(),
      ]);

      setGmailAccounts(gmailData.accounts || []);
      setOutlookAccounts(outlookData.accounts || []);
    } catch (error) {
      toast.error('Failed to check connection status');
      console.error('Failed to check connection status:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectGmail() {
    try {
      const data = await startGmailOAuth();

      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=700');

        const initialCount = gmailAccounts.length;
        const interval = setInterval(async () => {
          const statusData = await getGmailStatus();
          if (statusData.accounts && statusData.accounts.length > initialCount) {
            setGmailAccounts(statusData.accounts);
            clearInterval(interval);
            toast.success('Gmail account connected successfully');
          }
        }, 2000);

        setTimeout(() => clearInterval(interval), 120000);
      } else {
        toast.error('Failed to get authorization URL');
      }
    } catch (error) {
      toast.error('Failed to connect Gmail');
      console.error('Failed to start Gmail OAuth:', error);
    }
  }

  async function handleConnectOutlook() {
    try {
      const data = await startOutlookOAuth();

      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=700');

        const initialCount = outlookAccounts.length;
        const interval = setInterval(async () => {
          const statusData = await getOutlookStatus();
          if (statusData.accounts && statusData.accounts.length > initialCount) {
            setOutlookAccounts(statusData.accounts);
            clearInterval(interval);
            toast.success('Outlook account connected successfully');
          }
        }, 2000);

        setTimeout(() => clearInterval(interval), 120000);
      } else {
        toast.error('Failed to get authorization URL');
      }
    } catch (error) {
      toast.error('Failed to connect Outlook');
      console.error('Failed to start Outlook OAuth:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your connected services and view system status
        </p>
      </div>

      <div className="space-y-6">
        {/* Gmail Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-2xl">
                📧
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Gmail</h3>
                <p className="text-xs text-gray-500">
                  {gmailAccounts.length > 0
                    ? `${gmailAccounts.length} account${gmailAccounts.length > 1 ? 's' : ''} connected`
                    : 'Not connected'}
                </p>
              </div>
            </div>
            <button
              onClick={handleConnectGmail}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
            >
              {gmailAccounts.length > 0 ? 'Add Another Account' : 'Connect Gmail'}
            </button>
          </div>

          {gmailAccounts.length > 0 && (
            <div className="space-y-2">
              {gmailAccounts.map((account) => (
                <AccountCard key={account.id} account={account} onUpdate={checkStatus} />
              ))}
            </div>
          )}
        </div>

        {/* Outlook Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-2xl">
                📨
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Outlook</h3>
                <p className="text-xs text-gray-500">
                  {outlookAccounts.length > 0
                    ? `${outlookAccounts.length} account${outlookAccounts.length > 1 ? 's' : ''} connected`
                    : 'Not connected'}
                </p>
              </div>
            </div>
            <button
              onClick={handleConnectOutlook}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
            >
              {outlookAccounts.length > 0 ? 'Add Another Account' : 'Connect Outlook'}
            </button>
          </div>

          {outlookAccounts.length > 0 && (
            <div className="space-y-2">
              {outlookAccounts.map((account) => (
                <AccountCard key={account.id} account={account} onUpdate={checkStatus} />
              ))}
            </div>
          )}
        </div>

        {/* Todoist Card (Coming Soon) */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 opacity-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center text-2xl">
                ✓
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Todoist</h3>
                <p className="text-sm text-gray-500">Coming soon</p>
              </div>
            </div>
            <button
              disabled
              className="px-6 py-2 bg-gray-300 text-gray-500 font-medium rounded-lg cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <h3 className="font-semibold text-purple-900 mb-2">Getting Started</h3>
        <ol className="text-sm space-y-2 text-purple-800">
          <li>1. Connect your Gmail or Outlook account above</li>
          <li>2. Configure access policies in the Policies tab</li>
          <li>3. Connect your AI agent via MCP protocol</li>
          <li>4. Monitor all activity in the Audit Logs tab</li>
        </ol>
        <div className="mt-4 pt-4 border-t border-purple-200">
          <p className="text-sm text-purple-700">
            <strong>Multi-Account Support:</strong> You can connect multiple Gmail or Outlook
            accounts (e.g., work@gmail.com + personal@gmail.com). AI agents can access all
            connected accounts based on your policies!
          </p>
        </div>
      </div>
    </div>
  );
}
