import { useState } from 'react';
import type { ApprovalRequest } from '../api/client';
import { JSONEditor } from './JSONEditor';

export interface ApprovalModalProps {
  request: ApprovalRequest;
  onApprove: (id: string, approvedArgs?: Record<string, unknown>) => void;
  onDeny: (id: string) => void;
  onClose: () => void;
}

export function ApprovalModal({ request, onApprove, onDeny, onClose }: ApprovalModalProps) {
  const [editedArgs, setEditedArgs] = useState<Record<string, any>>(request.args);
  const hasChanges = JSON.stringify(editedArgs) !== JSON.stringify(request.args);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:w-full sm:max-w-2xl">
          <div className="bg-white px-6 py-5">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Review Approval Request</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Tool:</span>
                  <p className="text-gray-900">{request.tool}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Plugin:</span>
                  <p className="text-gray-900">{request.pluginId}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Agent:</span>
                  <p className="text-gray-900">{request.agentName}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Requested:</span>
                  <p className="text-gray-900">{new Date(request.requestedAt).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Arguments {hasChanges && <span className="text-yellow-600">(modified)</span>}
                  </label>
                  {hasChanges && (
                    <button
                      onClick={() => setEditedArgs(request.args)}
                      className="text-xs text-purple-600 hover:text-purple-700"
                    >
                      Reset changes
                    </button>
                  )}
                </div>
                <JSONEditor value={editedArgs} onChange={setEditedArgs} />
                <p className="mt-2 text-xs text-gray-500">
                  You can modify the arguments before approving if needed
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-6 py-3 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => onDeny(request.id)}
              className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 rounded-md hover:bg-red-50"
            >
              Deny
            </button>
            <button
              onClick={() => onApprove(request.id, hasChanges ? editedArgs : undefined)}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700"
            >
              {hasChanges ? 'Approve with Changes' : 'Approve'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
