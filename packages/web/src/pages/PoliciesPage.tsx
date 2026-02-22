import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  type Policy,
  type PolicyAction,
} from '../api/client';
import { PolicyBadge } from '../components/PolicyBadge';
import { StatusToggle } from '../components/StatusToggle';
import { JSONEditor } from '../components/JSONEditor';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadPolicies();
  }, []);

  async function loadPolicies() {
    try {
      const data = await getPolicies();
      setPolicies(data.sort((a, b) => b.priority - a.priority));
    } catch (error) {
      toast.error('Failed to load policies');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(policy: Policy) {
    try {
      await updatePolicy(policy.id, { enabled: !policy.enabled });
      setPolicies((prev) =>
        prev.map((p) => (p.id === policy.id ? { ...p, enabled: !p.enabled } : p))
      );
      toast.success(`Policy ${!policy.enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error('Failed to update policy');
      console.error(error);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePolicy(id);
      setPolicies((prev) => prev.filter((p) => p.id !== id));
      toast.success('Policy deleted');
      setDeleteConfirm(null);
    } catch (error) {
      toast.error('Failed to delete policy');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policy Rules</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure access control policies for AI agent actions
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          <span className="mr-2">+</span>
          New Policy
        </button>
      </div>

      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Action
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Priority
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Plugin
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {policies.map((policy) => (
              <tr key={policy.id} className={!policy.enabled ? 'opacity-50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusToggle enabled={policy.enabled} onChange={() => handleToggle(policy)} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <PolicyBadge action={policy.action} />
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{policy.description || 'No description'}</div>
                  <div className="text-xs text-gray-500 font-mono mt-1">
                    {JSON.stringify(policy.condition).substring(0, 60)}...
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {policy.priority}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {policy.pluginId || 'All'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => setEditingPolicy(policy)}
                    className="text-purple-600 hover:text-purple-900 mr-4"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(policy.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {policies.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No policies configured yet.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-purple-600 hover:text-purple-700 font-medium"
            >
              Create your first policy
            </button>
          </div>
        )}
      </div>

      {(showCreateModal || editingPolicy) && (
        <PolicyFormModal
          policy={editingPolicy}
          onClose={() => {
            setShowCreateModal(false);
            setEditingPolicy(null);
          }}
          onSave={(policy) => {
            if (editingPolicy) {
              setPolicies((prev) => prev.map((p) => (p.id === policy.id ? policy : p)));
            } else {
              setPolicies((prev) => [policy, ...prev].sort((a, b) => b.priority - a.priority));
            }
            setShowCreateModal(false);
            setEditingPolicy(null);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete Policy"
        message="Are you sure you want to delete this policy? This action cannot be undone."
        confirmText="Delete"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

interface PolicyFormModalProps {
  policy: Policy | null;
  onClose: () => void;
  onSave: (policy: Policy) => void;
}

function PolicyFormModal({ policy, onClose, onSave }: PolicyFormModalProps) {
  const [action, setAction] = useState<PolicyAction>(policy?.action || 'ALLOW');
  const [condition, setCondition] = useState<Record<string, any>>(policy?.condition || { '==': [{ var: 'tool' }, 'example'] });
  const [description, setDescription] = useState(policy?.description || '');
  const [priority, setPriority] = useState(policy?.priority || 100);
  const [pluginId, setPluginId] = useState(policy?.pluginId || '');
  const [enabled, setEnabled] = useState(policy?.enabled !== undefined ? policy.enabled : true);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      if (policy) {
        await updatePolicy(policy.id, {
          action,
          condition,
          description,
          priority,
          pluginId: pluginId || null,
          enabled,
        });
        toast.success('Policy updated');
        onSave({ ...policy, action, condition, description, priority, pluginId, enabled });
      } else {
        const newPolicy = await createPolicy({
          action,
          condition,
          description,
          priority,
          pluginId: pluginId || null,
          enabled,
        });
        toast.success('Policy created');
        onSave(newPolicy);
      }
    } catch (error) {
      toast.error(policy ? 'Failed to update policy' : 'Failed to create policy');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:w-full sm:max-w-2xl">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {policy ? 'Edit Policy' : 'Create New Policy'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Action</label>
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value as PolicyAction)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                    required
                  >
                    <option value="ALLOW">ALLOW</option>
                    <option value="BLOCK">BLOCK</option>
                    <option value="REDACT">REDACT</option>
                    <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                    placeholder="e.g., Allow listing up to 10 emails"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Priority</label>
                    <input
                      type="number"
                      value={priority}
                      onChange={(e) => setPriority(parseInt(e.target.value, 10))}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                      min="0"
                      max="999"
                      required
                    />
                    <p className="mt-1 text-xs text-gray-500">Higher = evaluated first</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Plugin ID (optional)
                    </label>
                    <input
                      type="text"
                      value={pluginId}
                      onChange={(e) => setPluginId(e.target.value)}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                      placeholder="com.corelink.gmail"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Condition (JSON Logic)
                  </label>
                  <JSONEditor
                    value={condition}
                    onChange={setCondition}
                    placeholder='{"==": [{"var": "tool"}, "list_emails"]}'
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    See{' '}
                    <a
                      href="https://jsonlogic.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-600 hover:text-purple-700"
                    >
                      jsonlogic.com
                    </a>{' '}
                    for syntax
                  </p>
                </div>

                <div className="flex items-center">
                  <StatusToggle enabled={enabled} onChange={setEnabled} />
                  <label className="ml-3 text-sm text-gray-700">
                    {enabled ? 'Enabled' : 'Disabled'}
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : policy ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
