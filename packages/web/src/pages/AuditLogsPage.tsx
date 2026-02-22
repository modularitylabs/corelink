import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getAuditLogs,
  getAuditStats,
  type AuditLog,
  type AuditStats,
  type PolicyAction,
} from '../api/client';
import { PolicyBadge } from '../components/PolicyBadge';
import { CategoryBadge } from '../components/CategoryBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';

export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'denied' | 'error'>('all');
  const [actionFilter, setActionFilter] = useState<PolicyAction | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [pluginFilter, setPluginFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');

  useEffect(() => {
    loadData();
  }, [statusFilter, actionFilter, categoryFilter, pluginFilter, agentFilter]);

  async function loadData() {
    try {
      const filters: any = { limit: 100 };
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (actionFilter !== 'all') filters.action = actionFilter;
      if (categoryFilter) filters.category = categoryFilter;
      if (pluginFilter) filters.pluginId = pluginFilter;
      if (agentFilter) filters.agentName = agentFilter;

      const [logsData, statsData] = await Promise.all([
        getAuditLogs(filters),
        getAuditStats({}),
      ]);

      setLogs(logsData.logs);
      setStats(statsData);
    } catch (error) {
      toast.error('Failed to load audit logs');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  const statusColors = {
    success: 'bg-green-100 text-green-800',
    denied: 'bg-red-100 text-red-800',
    error: 'bg-orange-100 text-orange-800',
  };

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
        <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-500">
          Track all AI agent requests and policy decisions
        </p>
      </div>

      {/* Statistics Dashboard */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            label="Total Requests"
            value={stats.totalRequests}
            icon="📊"
            color="bg-purple-100 text-purple-800"
          />
          <StatCard
            label="Allowed"
            value={stats.allowedRequests}
            icon="✅"
            color="bg-green-100 text-green-800"
          />
          <StatCard
            label="Blocked"
            value={stats.blockedRequests}
            icon="🚫"
            color="bg-red-100 text-red-800"
          />
          <StatCard
            label="Redacted"
            value={stats.redactedRequests}
            icon="🔒"
            color="bg-yellow-100 text-yellow-800"
          />
          <StatCard
            label="Approvals"
            value={stats.approvalRequests}
            icon="⏳"
            color="bg-blue-100 text-blue-800"
          />
          <StatCard
            label="Errors"
            value={stats.erroredRequests}
            icon="⚠️"
            color="bg-orange-100 text-orange-800"
          />
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
            >
              <option value="">All Categories</option>
              <option value="email">📧 Email</option>
              <option value="calendar">📅 Calendar</option>
              <option value="task">✓ Task</option>
              <option value="file">📁 File</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success</option>
              <option value="denied">Denied</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value as any)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
            >
              <option value="all">All Actions</option>
              <option value="ALLOW">ALLOW</option>
              <option value="BLOCK">BLOCK</option>
              <option value="REDACT">REDACT</option>
              <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Plugin</label>
            <input
              type="text"
              value={pluginFilter}
              onChange={(e) => setPluginFilter(e.target.value)}
              placeholder="Filter by plugin ID"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
            <input
              type="text"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              placeholder="Filter by agent name"
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm"
            />
          </div>
        </div>

        {(statusFilter !== 'all' || actionFilter !== 'all' || categoryFilter || pluginFilter || agentFilter) && (
          <div className="mt-3">
            <button
              onClick={() => {
                setStatusFilter('all');
                setActionFilter('all');
                setCategoryFilter('');
                setPluginFilter('');
                setAgentFilter('');
              }}
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      {/* Logs Table */}
      <div className="bg-white shadow overflow-hidden sm:rounded-lg">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tool
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Agent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {log.category ? (
                      <CategoryBadge category={log.category} />
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {log.tool}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.agentName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <PolicyBadge action={log.policyDecision.action} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        statusColors[log.status]
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="text-purple-600 hover:text-purple-900 font-medium"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {logs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No audit logs found matching your filters.</p>
            </div>
          )}
        </div>
      </div>

      {selectedLog && (
        <LogDetailsModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: string;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`text-3xl p-2 rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );
}

interface LogDetailsModalProps {
  log: AuditLog;
  onClose: () => void;
}

function LogDetailsModal({ log, onClose }: LogDetailsModalProps) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="relative transform overflow-hidden rounded-lg bg-white text-left shadow-xl transition-all sm:w-full sm:max-w-3xl">
          <div className="bg-white px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Audit Log Details</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <span className="text-2xl">&times;</span>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Timestamp:</span>
                  <p className="text-gray-900">{new Date(log.timestamp).toLocaleString()}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Tool:</span>
                  <p className="text-gray-900">{log.tool}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Agent:</span>
                  <p className="text-gray-900">{log.agentName}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Plugin:</span>
                  <p className="text-gray-900">{log.pluginId}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Policy Action:</span>
                  <div className="mt-1">
                    <PolicyBadge action={log.policyDecision.action} />
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Status:</span>
                  <p className="text-gray-900">{log.status}</p>
                </div>
              </div>

              {log.policyDecision.ruleId && (
                <div>
                  <span className="font-medium text-gray-700">Policy Rule ID:</span>
                  <p className="text-gray-900 font-mono text-sm">{log.policyDecision.ruleId}</p>
                </div>
              )}

              {log.policyDecision.reason && (
                <div>
                  <span className="font-medium text-gray-700">Reason:</span>
                  <p className="text-gray-900">{log.policyDecision.reason}</p>
                </div>
              )}

              <div>
                <span className="font-medium text-gray-700">Arguments:</span>
                <div className="mt-2 bg-gray-50 rounded p-3 overflow-x-auto">
                  <pre className="text-xs font-mono text-gray-800">
                    {JSON.stringify(log.args, null, 2)}
                  </pre>
                </div>
              </div>

              {log.error && (
                <div>
                  <span className="font-medium text-red-700">Error:</span>
                  <div className="mt-2 bg-red-50 rounded p-3">
                    <p className="text-sm text-red-900">{log.error}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 px-6 py-3 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
