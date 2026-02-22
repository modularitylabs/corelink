import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getGmailStatus,
  getOutlookStatus,
  startGmailOAuth,
  startOutlookOAuth,
  disconnectGmail,
  disconnectOutlook,
} from '../api/client';

export function DashboardPage() {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
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

      setGmailConnected(gmailData.connected);
      setOutlookConnected(outlookData.connected);
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

        const interval = setInterval(async () => {
          const statusData = await getGmailStatus();
          if (statusData.connected) {
            setGmailConnected(true);
            clearInterval(interval);
            toast.success('Gmail connected successfully');
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

  async function handleDisconnectGmail() {
    try {
      await disconnectGmail();
      setGmailConnected(false);
      toast.success('Gmail disconnected');
    } catch (error) {
      toast.error('Failed to disconnect Gmail');
      console.error('Failed to disconnect Gmail:', error);
    }
  }

  async function handleConnectOutlook() {
    try {
      const data = await startOutlookOAuth();

      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=700');

        const interval = setInterval(async () => {
          const statusData = await getOutlookStatus();
          if (statusData.connected) {
            setOutlookConnected(true);
            clearInterval(interval);
            toast.success('Outlook connected successfully');
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

  async function handleDisconnectOutlook() {
    try {
      await disconnectOutlook();
      setOutlookConnected(false);
      toast.success('Outlook disconnected');
    } catch (error) {
      toast.error('Failed to disconnect Outlook');
      console.error('Failed to disconnect Outlook:', error);
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

      <div className="space-y-4">
        {/* Gmail Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center text-2xl">
                📧
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Gmail</h3>
                <p className="text-sm text-gray-500">
                  {gmailConnected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>

            {gmailConnected ? (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Active
                </span>
                <button
                  onClick={handleDisconnectGmail}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectGmail}
                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition shadow-sm"
              >
                Connect Gmail
              </button>
            )}
          </div>
        </div>

        {/* Outlook Card */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl">
                📨
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Outlook</h3>
                <p className="text-sm text-gray-500">
                  {outlookConnected ? 'Connected' : 'Not connected'}
                </p>
              </div>
            </div>

            {outlookConnected ? (
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-2 text-green-600 text-sm font-medium">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Active
                </span>
                <button
                  onClick={handleDisconnectOutlook}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={handleConnectOutlook}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition shadow-sm"
              >
                Connect Outlook
              </button>
            )}
          </div>
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
            <strong>Service Abstraction:</strong> Both Gmail and Outlook implement the same
            standard email tools. AI agents can switch between providers seamlessly!
          </p>
        </div>
      </div>
    </div>
  );
}
