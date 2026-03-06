import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle } from 'lucide-react';
import {
  getApprovalRequests,
  approveRequest,
  denyRequest,
  type ApprovalRequest,
} from '../api/client';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ApprovalModal } from '../components/ApprovalModal';

export function ApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    loadRequests();
    // Poll for new requests every 5 seconds
    const interval = setInterval(loadRequests, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadRequests() {
    try {
      const data = await getApprovalRequests();
      setRequests(data.filter((r) => r.status === 'pending'));
    } catch (error) {
      console.error('Failed to load approval requests:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string, approvedArgs?: Record<string, unknown>) {
    try {
      await approveRequest(id, approvedArgs);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setSelectedRequest(null);
      toast.success('Request approved');
    } catch (error) {
      toast.error('Failed to approve request');
      console.error(error);
    }
  }

  async function handleDeny(id: string) {
    try {
      await denyRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
      setSelectedRequest(null);
      toast.success('Request denied');
    } catch (error) {
      toast.error('Failed to deny request');
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Approval Requests</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review and approve AI agent requests that require manual approval
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="flex justify-center mb-4">
            <CheckCircle className="w-16 h-16 text-green-500" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No pending requests</h3>
          <p className="text-gray-500">
            All approval requests have been processed. New requests will appear here automatically.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {requests.map((request) => (
            <div
              key={request.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 hover:border-purple-300 transition-colors"
            >
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{request.tool}</h3>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {request.pluginId}
                      </span>
                    </div>

                    <div className="space-y-2 text-sm text-gray-600 mb-4">
                      <div>
                        <span className="font-medium">Agent:</span> {request.agentName}
                      </div>
                      <div>
                        <span className="font-medium">Requested:</span>{' '}
                        {new Date(request.requestedAt).toLocaleString()}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-700 mb-2">Arguments:</div>
                      <div className="bg-gray-50 rounded p-3 overflow-x-auto">
                        <pre className="text-xs font-mono text-gray-800">
                          {JSON.stringify(request.args, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => setSelectedRequest(request)}
                    className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-medium text-sm"
                  >
                    Review & Approve
                  </button>
                  <button
                    onClick={() => handleDeny(request.id)}
                    className="px-4 py-2 bg-white text-red-600 border border-red-300 rounded-md hover:bg-red-50 font-medium text-sm"
                  >
                    Deny
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedRequest && (
        <ApprovalModal
          request={selectedRequest}
          onApprove={handleApprove}
          onDeny={handleDeny}
          onClose={() => setSelectedRequest(null)}
        />
      )}
    </div>
  );
}

