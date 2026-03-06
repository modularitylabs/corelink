import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { Account } from '../api/client';
import {
  getGmailStatus,
  getOutlookStatus,
  getTodoistStatus,
  getMicrosoftTodoStatus,
  startGmailOAuth,
  startOutlookOAuth,
  connectTodoist,
  startMicrosoftTodoOAuth,
} from '../api/client';
import { AccountCard } from '../components/AccountCard';

export function DashboardPage() {
  const [gmailAccounts, setGmailAccounts] = useState<Account[]>([]);
  const [outlookAccounts, setOutlookAccounts] = useState<Account[]>([]);
  const [todoistAccounts, setTodoistAccounts] = useState<Account[]>([]);
  const [msTodoAccounts, setMsTodoAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTodoistForm, setShowTodoistForm] = useState(false);
  const [todoistToken, setTodoistToken] = useState('');
  const [todoistConnecting, setTodoistConnecting] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const [gmailData, outlookData, todoistData, msTodoData] = await Promise.all([
        getGmailStatus(),
        getOutlookStatus(),
        getTodoistStatus(),
        getMicrosoftTodoStatus(),
      ]);

      setGmailAccounts(gmailData.accounts || []);
      setOutlookAccounts(outlookData.accounts || []);
      setTodoistAccounts(todoistData.accounts || []);
      setMsTodoAccounts(msTodoData.accounts || []);
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

  async function handleConnectTodoist() {
    if (!todoistToken.trim()) {
      toast.error('Please enter your Todoist API token');
      return;
    }
    setTodoistConnecting(true);
    try {
      await connectTodoist(todoistToken.trim());
      const statusData = await getTodoistStatus();
      setTodoistAccounts(statusData.accounts || []);
      setShowTodoistForm(false);
      setTodoistToken('');
      toast.success('Todoist account connected successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to connect Todoist');
    } finally {
      setTodoistConnecting(false);
    }
  }

  async function handleConnectMicrosoftTodo() {
    try {
      const data = await startMicrosoftTodoOAuth();
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=700');

        const initialCount = msTodoAccounts.length;
        const interval = setInterval(async () => {
          const statusData = await getMicrosoftTodoStatus();
          if (statusData.accounts && statusData.accounts.length > initialCount) {
            setMsTodoAccounts(statusData.accounts);
            clearInterval(interval);
            toast.success('Microsoft Todo account connected successfully');
          }
        }, 2000);

        setTimeout(() => clearInterval(interval), 120000);
      } else {
        toast.error('Failed to get authorization URL');
      }
    } catch (error) {
      toast.error('Failed to connect Microsoft Todo');
      console.error('Failed to start Microsoft Todo OAuth:', error);
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

        {/* Todoist Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center text-2xl">
                ✓
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Todoist</h3>
                <p className="text-xs text-gray-500">
                  {todoistAccounts.length > 0
                    ? `${todoistAccounts.length} account${todoistAccounts.length > 1 ? 's' : ''} connected`
                    : 'Not connected'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowTodoistForm(v => !v)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
            >
              {todoistAccounts.length > 0 ? 'Add Another Account' : 'Connect Todoist'}
            </button>
          </div>

          {showTodoistForm && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
              <p className="text-sm text-gray-600">
                Get your API token from{' '}
                <a
                  href="https://app.todoist.com/app/settings/integrations/developer"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-600 hover:underline"
                >
                  Todoist Settings → Integrations → Developer
                </a>
              </p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={todoistToken}
                  onChange={e => setTodoistToken(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConnectTodoist()}
                  placeholder="Paste your API token..."
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button
                  onClick={handleConnectTodoist}
                  disabled={todoistConnecting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                >
                  {todoistConnecting ? 'Connecting...' : 'Connect'}
                </button>
                <button
                  onClick={() => { setShowTodoistForm(false); setTodoistToken(''); }}
                  className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {todoistAccounts.length > 0 && (
            <div className="space-y-2">
              {todoistAccounts.map((account) => (
                <AccountCard key={account.id} account={account} onUpdate={checkStatus} />
              ))}
            </div>
          )}
        </div>

        {/* Microsoft Todo Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-2xl">
                📋
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Microsoft Todo</h3>
                <p className="text-xs text-gray-500">
                  {msTodoAccounts.length > 0
                    ? `${msTodoAccounts.length} account${msTodoAccounts.length > 1 ? 's' : ''} connected`
                    : 'Not connected'}
                </p>
              </div>
            </div>
            <button
              onClick={handleConnectMicrosoftTodo}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
            >
              {msTodoAccounts.length > 0 ? 'Add Another Account' : 'Connect Microsoft Todo'}
            </button>
          </div>

          {msTodoAccounts.length > 0 && (
            <div className="space-y-2">
              {msTodoAccounts.map((account) => (
                <AccountCard key={account.id} account={account} onUpdate={checkStatus} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
        <h3 className="font-semibold text-purple-900 mb-2">Getting Started</h3>
        <ol className="text-sm space-y-2 text-purple-800">
          <li>1. Connect your Gmail or Outlook account above</li>
          <li>2. Connect Todoist or Microsoft Todo for task management</li>
          <li>3. Configure access policies in the Policies tab</li>
          <li>4. Connect your AI agent via MCP protocol</li>
          <li>5. Monitor all activity in the Audit Logs tab</li>
        </ol>
        <div className="mt-4 pt-4 border-t border-purple-200">
          <p className="text-sm text-purple-700">
            <strong>Multi-Account Support:</strong> You can connect multiple accounts per provider.
            AI agents can access all connected accounts based on your policies!
          </p>
        </div>
      </div>
    </div>
  );
}
