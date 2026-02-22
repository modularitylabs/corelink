import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getRedactionPatterns,
  createRedactionPattern,
  updateRedactionPattern,
  deleteRedactionPattern,
  type RedactionPattern,
} from '../api/client';
import { StatusToggle } from '../components/StatusToggle';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function RedactionPage() {
  const [patterns, setPatterns] = useState<RedactionPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPattern, setEditingPattern] = useState<RedactionPattern | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadPatterns();
  }, []);

  async function loadPatterns() {
    try {
      const data = await getRedactionPatterns();
      setPatterns(data);
    } catch (error) {
      toast.error('Failed to load redaction patterns');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(pattern: RedactionPattern) {
    try {
      await updateRedactionPattern(pattern.id, { enabled: !pattern.enabled });
      setPatterns((prev) =>
        prev.map((p) => (p.id === pattern.id ? { ...p, enabled: !p.enabled } : p))
      );
      toast.success(`Pattern ${!pattern.enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      toast.error('Failed to update pattern');
      console.error(error);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteRedactionPattern(id);
      setPatterns((prev) => prev.filter((p) => p.id !== id));
      toast.success('Pattern deleted');
      setDeleteConfirm(null);
    } catch (error) {
      toast.error('Failed to delete pattern');
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
          <h1 className="text-2xl font-bold text-gray-900">Redaction Patterns</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure patterns to redact sensitive data from AI responses
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
        >
          <span className="mr-2">+</span>
          New Pattern
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
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Pattern
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Replacement
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {patterns.map((pattern) => (
              <tr key={pattern.id} className={!pattern.enabled ? 'opacity-50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusToggle enabled={pattern.enabled} onChange={() => handleToggle(pattern)} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{pattern.name}</div>
                  {pattern.description && (
                    <div className="text-xs text-gray-500">{pattern.description}</div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <code className="text-xs bg-gray-100 px-2 py-1 rounded">{pattern.pattern}</code>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <code className="text-xs bg-yellow-100 px-2 py-1 rounded">
                    {pattern.replacement}
                  </code>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => setEditingPattern(pattern)}
                    className="text-purple-600 hover:text-purple-900 mr-4"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(pattern.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {patterns.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No redaction patterns configured yet.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-purple-600 hover:text-purple-700 font-medium"
            >
              Create your first pattern
            </button>
          </div>
        )}
      </div>

      {(showCreateModal || editingPattern) && (
        <PatternFormModal
          pattern={editingPattern}
          onClose={() => {
            setShowCreateModal(false);
            setEditingPattern(null);
          }}
          onSave={(pattern) => {
            if (editingPattern) {
              setPatterns((prev) => prev.map((p) => (p.id === pattern.id ? pattern : p)));
            } else {
              setPatterns((prev) => [...prev, pattern]);
            }
            setShowCreateModal(false);
            setEditingPattern(null);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete Redaction Pattern"
        message="Are you sure you want to delete this redaction pattern? This action cannot be undone."
        confirmText="Delete"
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}

interface PatternFormModalProps {
  pattern: RedactionPattern | null;
  onClose: () => void;
  onSave: (pattern: RedactionPattern) => void;
}

function PatternFormModal({ pattern, onClose, onSave }: PatternFormModalProps) {
  const [name, setName] = useState(pattern?.name || '');
  const [regex, setRegex] = useState(pattern?.pattern || '');
  const [replacement, setReplacement] = useState(pattern?.replacement || '[REDACTED]');
  const [description, setDescription] = useState(pattern?.description || '');
  const [enabled, setEnabled] = useState(pattern?.enabled !== undefined ? pattern.enabled : true);
  const [saving, setSaving] = useState(false);
  const [regexError, setRegexError] = useState<string | null>(null);

  function validateRegex(value: string) {
    try {
      new RegExp(value);
      setRegexError(null);
      return true;
    } catch (e) {
      setRegexError(e instanceof Error ? e.message : 'Invalid regex');
      return false;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateRegex(regex)) return;

    setSaving(true);

    try {
      if (pattern) {
        await updateRedactionPattern(pattern.id, {
          name,
          pattern: regex,
          replacement,
          description,
          enabled,
        });
        toast.success('Pattern updated');
        onSave({ ...pattern, name, pattern: regex, replacement, description, enabled });
      } else {
        const newPattern = await createRedactionPattern({
          name,
          pattern: regex,
          replacement,
          description,
          enabled,
        });
        toast.success('Pattern created');
        onSave(newPattern);
      }
    } catch (error) {
      toast.error(pattern ? 'Failed to update pattern' : 'Failed to create pattern');
      console.error(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:w-full sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-6 py-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {pattern ? 'Edit Redaction Pattern' : 'Create New Redaction Pattern'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                    placeholder="e.g., Email Address"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Regular Expression
                  </label>
                  <input
                    type="text"
                    value={regex}
                    onChange={(e) => {
                      setRegex(e.target.value);
                      validateRegex(e.target.value);
                    }}
                    className={`mt-1 block w-full rounded-md shadow-sm font-mono text-sm ${
                      regexError
                        ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                        : 'border-gray-300 focus:border-purple-500 focus:ring-purple-500'
                    }`}
                    placeholder="[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"
                    required
                  />
                  {regexError && <p className="mt-1 text-sm text-red-600">{regexError}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Replacement Text
                  </label>
                  <input
                    type="text"
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                    placeholder="[REDACTED]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Description (optional)
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500"
                    placeholder="e.g., Redact email addresses for privacy"
                  />
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
                disabled={saving || !!regexError}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : pattern ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
