import { useEffect, useState } from 'react';

const API_URL = 'http://localhost:3000';

function App() {
  const [gmailConnected, setGmailConnected] = useState(false);
  const [outlookConnected, setOutlookConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    try {
      const [gmailResponse, outlookResponse] = await Promise.all([
        fetch(`${API_URL}/oauth/gmail/status`),
        fetch(`${API_URL}/oauth/outlook/status`),
      ]);

      const gmailData = await gmailResponse.json();
      const outlookData = await outlookResponse.json();

      setGmailConnected(gmailData.connected);
      setOutlookConnected(outlookData.connected);
    } catch (error) {
      console.error('Failed to check connection status:', error);
    } finally {
      setLoading(false);
    }
  }

  async function connectGmail() {
    console.log('Connect Gmail button clicked!');
    try {
      console.log('Fetching auth URL from:', `${API_URL}/oauth/gmail/start`);
      const response = await fetch(`${API_URL}/oauth/gmail/start`);
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (data.authUrl) {
        console.log('Opening auth URL:', data.authUrl);
        // Open OAuth flow in new window
        window.open(data.authUrl, '_blank', 'width=600,height=700');

        // Poll for connection status
        const interval = setInterval(async () => {
          const statusResponse = await fetch(`${API_URL}/oauth/gmail/status`);
          const statusData = await statusResponse.json();

          if (statusData.connected) {
            setGmailConnected(true);
            clearInterval(interval);
          }
        }, 2000);

        // Clear interval after 2 minutes
        setTimeout(() => clearInterval(interval), 120000);
      } else {
        console.error('No authUrl in response:', data);
        alert('Failed to get authorization URL');
      }
    } catch (error) {
      console.error('Failed to start Gmail OAuth:', error);
      alert('Failed to connect Gmail. Make sure the gateway server is running.');
    }
  }

  async function disconnectGmail() {
    if (!confirm('Are you sure you want to disconnect Gmail?')) return;

    try {
      await fetch(`${API_URL}/oauth/gmail`, { method: 'DELETE' });
      setGmailConnected(false);
    } catch (error) {
      console.error('Failed to disconnect Gmail:', error);
    }
  }

  async function connectOutlook() {
    console.log('Connect Outlook button clicked!');
    try {
      console.log('Fetching auth URL from:', `${API_URL}/oauth/outlook/start`);
      const response = await fetch(`${API_URL}/oauth/outlook/start`);
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (data.authUrl) {
        console.log('Opening auth URL:', data.authUrl);
        window.open(data.authUrl, '_blank', 'width=600,height=700');

        const interval = setInterval(async () => {
          const statusResponse = await fetch(`${API_URL}/oauth/outlook/status`);
          const statusData = await statusResponse.json();

          if (statusData.connected) {
            setOutlookConnected(true);
            clearInterval(interval);
          }
        }, 2000);

        setTimeout(() => clearInterval(interval), 120000);
      } else {
        console.error('No authUrl in response:', data);
        alert('Failed to get authorization URL');
      }
    } catch (error) {
      console.error('Failed to start Outlook OAuth:', error);
      alert('Failed to connect Outlook. Make sure the gateway server is running.');
    }
  }

  async function disconnectOutlook() {
    if (!confirm('Are you sure you want to disconnect Outlook?')) return;

    try {
      await fetch(`${API_URL}/oauth/outlook`, { method: 'DELETE' });
      setOutlookConnected(false);
    } catch (error) {
      console.error('Failed to disconnect Outlook:', error);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-indigo-600">
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-5xl font-bold text-white mb-4">🔗 CoreLink</h1>
            <p className="text-purple-100 text-lg">
              The Secure AI Access Layer for Your Workspace
            </p>
          </div>

          {/* Main Card */}
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">Connected Services</h2>

            {/* Gmail Card */}
            <div className="border border-gray-200 rounded-lg p-6 mb-4">
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
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Active
                    </span>
                    <button
                      onClick={disconnectGmail}
                      className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connectGmail}
                    className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition shadow-sm"
                  >
                    Connect Gmail
                  </button>
                )}
              </div>
            </div>

            {/* Outlook Card */}
            <div className="border border-gray-200 rounded-lg p-6 mb-4">
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
                      <svg
                        className="w-5 h-5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Active
                    </span>
                    <button
                      onClick={disconnectOutlook}
                      className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={connectOutlook}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition shadow-sm"
                  >
                    Connect Outlook
                  </button>
                )}
              </div>
            </div>

            {/* Todoist Card (Coming Soon) */}
            <div className="border border-gray-200 rounded-lg p-6 opacity-50">
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
          <div className="mt-8 bg-white/10 backdrop-blur-sm rounded-lg p-6 text-white">
            <h3 className="font-semibold mb-2">Getting Started</h3>
            <ol className="text-sm space-y-2 text-purple-100">
              <li>1. Connect your Gmail or Outlook account above</li>
              <li>2. Configure access policies (coming soon)</li>
              <li>3. Connect your AI agent via MCP protocol</li>
              <li>4. Monitor all activity in the audit log (coming soon)</li>
            </ol>
            <div className="mt-4 pt-4 border-t border-white/20">
              <p className="text-sm text-purple-200">
                <strong>Service Abstraction:</strong> Both Gmail and Outlook implement the same standard email tools. AI agents can switch between providers seamlessly!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
