import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { Account } from '../api/client';
import {
  getAccounts,
  startGmailOAuth,
  startOutlookOAuth,
  connectTodoist,
  startMicrosoftTodoOAuth,
  getGmailStatus,
  getOutlookStatus,
  getMicrosoftTodoStatus,
  startGoogleCalendarOAuth,
  getGoogleCalendarStatus,
  startOutlookCalendarOAuth,
  getOutlookCalendarStatus,
} from '../api/client';
import { AccountCard } from '../components/AccountCard';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState<'provider' | 'all'>('provider');
  const [showTodoistForm, setShowTodoistForm] = useState(false);
  const [todoistToken, setTodoistToken] = useState('');
  const [todoistConnecting, setTodoistConnecting] = useState(false);

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

  async function handleConnectTodoist() {
    if (!todoistToken.trim()) {
      toast.error('Please enter your Todoist API token');
      return;
    }
    setTodoistConnecting(true);
    try {
      await connectTodoist(todoistToken.trim());
      await loadAccounts();
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

        const initialCount = accounts.filter((a) => a.pluginId === 'com.corelink.microsoft-todo').length;
        const interval = setInterval(async () => {
          const statusData = await getMicrosoftTodoStatus();
          if (statusData.accounts && statusData.accounts.length > initialCount) {
            await loadAccounts();
            clearInterval(interval);
            toast.success('Microsoft Todo account connected successfully');
          }
        }, 2000);

        setTimeout(() => clearInterval(interval), 120000);
      }
    } catch (error) {
      toast.error('Failed to connect Microsoft Todo');
      console.error(error);
    }
  }

  async function handleConnectGoogleCalendar() {
    try {
      const data = await startGoogleCalendarOAuth();
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=700');

        const initialCount = accounts.filter((a) => a.pluginId === 'com.corelink.google-calendar').length;
        const interval = setInterval(async () => {
          const statusData = await getGoogleCalendarStatus();
          if (statusData.accounts && statusData.accounts.length > initialCount) {
            await loadAccounts();
            clearInterval(interval);
            toast.success('Google Calendar account connected successfully');
          }
        }, 2000);

        setTimeout(() => clearInterval(interval), 120000);
      }
    } catch (error) {
      toast.error('Failed to connect Google Calendar');
      console.error(error);
    }
  }

  async function handleConnectOutlookCalendar() {
    try {
      const data = await startOutlookCalendarOAuth();
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=700');

        const initialCount = accounts.filter((a) => a.pluginId === 'com.corelink.outlook-calendar').length;
        const interval = setInterval(async () => {
          const statusData = await getOutlookCalendarStatus();
          if (statusData.accounts && statusData.accounts.length > initialCount) {
            await loadAccounts();
            clearInterval(interval);
            toast.success('Outlook Calendar account connected successfully');
          }
        }, 2000);

        setTimeout(() => clearInterval(interval), 120000);
      }
    } catch (error) {
      toast.error('Failed to connect Outlook Calendar');
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
  const todoistAccounts = accounts.filter((a) => a.pluginId === 'com.corelink.todoist');
  const msTodoAccounts = accounts.filter((a) => a.pluginId === 'com.corelink.microsoft-todo');
  const googleCalendarAccounts = accounts.filter((a) => a.pluginId === 'com.corelink.google-calendar');
  const outlookCalendarAccounts = accounts.filter((a) => a.pluginId === 'com.corelink.outlook-calendar');

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center text-xl">
              📧
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{gmailAccounts.length}</p>
              <p className="text-sm text-gray-600">Gmail</p>
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
              <p className="text-sm text-gray-600">Outlook</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center text-xl">
              ✓
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{todoistAccounts.length}</p>
              <p className="text-sm text-gray-600">Todoist</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-xl">
              📋
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{msTodoAccounts.length}</p>
              <p className="text-sm text-gray-600">MS Todo</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-xl">
              📅
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{googleCalendarAccounts.length}</p>
              <p className="text-sm text-gray-600">G Calendar</p>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center text-xl">
              🗓️
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{outlookCalendarAccounts.length}</p>
              <p className="text-sm text-gray-600">OL Calendar</p>
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

          {/* Todoist Section */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center text-2xl">
                  ✓
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Todoist</h3>
                  <p className="text-xs text-gray-500">
                    {todoistAccounts.length} account{todoistAccounts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTodoistForm(v => !v)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition"
              >
                Add Todoist Account
              </button>
            </div>

            {showTodoistForm && (
              <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50 mb-4">
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

            {todoistAccounts.length > 0 ? (
              <div className="space-y-2">
                {todoistAccounts.map((account) => (
                  <AccountCard key={account.id} account={account} onUpdate={loadAccounts} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                No Todoist accounts connected yet
              </div>
            )}
          </div>

          {/* Microsoft Todo Section */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center text-2xl">
                  📋
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Microsoft Todo</h3>
                  <p className="text-xs text-gray-500">
                    {msTodoAccounts.length} account{msTodoAccounts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={handleConnectMicrosoftTodo}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
              >
                Add Microsoft Todo Account
              </button>
            </div>

            {msTodoAccounts.length > 0 ? (
              <div className="space-y-2">
                {msTodoAccounts.map((account) => (
                  <AccountCard key={account.id} account={account} onUpdate={loadAccounts} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                No Microsoft Todo accounts connected yet
              </div>
            )}
          </div>

          {/* Google Calendar Section */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center text-2xl">
                  📅
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Google Calendar</h3>
                  <p className="text-xs text-gray-500">
                    {googleCalendarAccounts.length} account{googleCalendarAccounts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={handleConnectGoogleCalendar}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition"
              >
                Add Google Calendar Account
              </button>
            </div>

            {googleCalendarAccounts.length > 0 ? (
              <div className="space-y-2">
                {googleCalendarAccounts.map((account) => (
                  <AccountCard key={account.id} account={account} onUpdate={loadAccounts} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                No Google Calendar accounts connected yet
              </div>
            )}
          </div>

          {/* Outlook Calendar Section */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center text-2xl">
                  🗓️
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Outlook Calendar</h3>
                  <p className="text-xs text-gray-500">
                    {outlookCalendarAccounts.length} account{outlookCalendarAccounts.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={handleConnectOutlookCalendar}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-medium rounded-lg transition"
              >
                Add Outlook Calendar Account
              </button>
            </div>

            {outlookCalendarAccounts.length > 0 ? (
              <div className="space-y-2">
                {outlookCalendarAccounts.map((account) => (
                  <AccountCard key={account.id} account={account} onUpdate={loadAccounts} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                No Outlook Calendar accounts connected yet
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
