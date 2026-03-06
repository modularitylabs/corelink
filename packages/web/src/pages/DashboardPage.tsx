import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Activity, CheckCircle, ShieldX, Clock } from 'lucide-react';
import { SiGmail, SiTodoist, SiGooglecalendar } from 'react-icons/si';
import { MdOutlineEmail, MdChecklist, MdCalendarMonth } from 'react-icons/md';
import {
  getAuditStats,
  getRecentActivity,
  getApprovalRequests,
  getAccounts,
  approveRequest,
  denyRequest,
  type AuditStats,
  type AuditLog,
  type ApprovalRequest,
  type Account,
} from '../api/client';
import { PolicyBadge } from '../components/PolicyBadge';
import { CategoryBadge } from '../components/CategoryBadge';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { StatCard } from '../components/StatCard';
import { ApprovalModal } from '../components/ApprovalModal';

// ===== Helper =====

function formatRelativeTime(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

// ===== Provider tile config =====

const PROVIDERS = [
  { id: 'com.corelink.gmail', label: 'Gmail', icon: <SiGmail size={24} style={{ color: '#EA4335' }} /> },
  { id: 'com.corelink.outlook', label: 'Outlook', icon: <MdOutlineEmail size={26} style={{ color: '#0078D4' }} /> },
  { id: 'com.corelink.todoist', label: 'Todoist', icon: <SiTodoist size={24} style={{ color: '#DB4035' }} /> },
  { id: 'com.corelink.microsoft-todo', label: 'MS Todo', icon: <MdChecklist size={26} style={{ color: '#0078D4' }} /> },
  { id: 'com.corelink.google-calendar', label: 'Google Calendar', icon: <SiGooglecalendar size={24} style={{ color: '#4285F4' }} /> },
  { id: 'com.corelink.outlook-calendar', label: 'Outlook Calendar', icon: <MdCalendarMonth size={26} style={{ color: '#0078D4' }} /> },
];

// ===== Main Page =====

export function DashboardPage() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  const [recentLogs, setRecentLogs] = useState<AuditLog[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function loadDashboard(silent = false) {
    try {
      const [statsData, approvalsData, logsData, accountsData] = await Promise.all([
        getAuditStats({}),
        getApprovalRequests(),
        getRecentActivity(8),
        getAccounts(),
      ]);
      setStats(statsData);
      setPendingApprovals(approvalsData.filter((r) => r.status === 'pending'));
      setRecentLogs(logsData);
      setAccounts(accountsData);
      setLastRefreshed(new Date());
    } catch (error) {
      if (!silent) toast.error('Failed to load dashboard');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(() => loadDashboard(true), 30_000);
    return () => clearInterval(interval);
  }, []);

  async function handleApprove(id: string, approvedArgs?: Record<string, unknown>) {
    setActionLoading(id);
    try {
      await approveRequest(id, approvedArgs);
      setPendingApprovals((prev) => prev.filter((r) => r.id !== id));
      setSelectedApproval(null);
      toast.success('Request approved');
    } catch (error) {
      toast.error('Failed to approve request');
      console.error(error);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeny(id: string) {
    setActionLoading(id);
    try {
      await denyRequest(id);
      setPendingApprovals((prev) => prev.filter((r) => r.id !== id));
      setSelectedApproval(null);
      toast.success('Request denied');
    } catch (error) {
      toast.error('Failed to deny request');
      console.error(error);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const visibleApprovals = pendingApprovals.slice(0, 5);
  const extraApprovals = pendingApprovals.length - visibleApprovals.length;
  const accountCountByPlugin = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.pluginId] = (acc[a.pluginId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            {lastRefreshed
              ? `Last updated ${formatRelativeTime(lastRefreshed.toISOString())}`
              : 'Loading...'}
          </p>
        </div>
        <button
          onClick={() => loadDashboard(false)}
          className="px-4 py-2 bg-white border border-gray-300 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 shadow-sm transition"
        >
          Refresh
        </button>
      </div>

      {/* Section A: Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Total Requests"
            value={stats.totalRequests}
            icon={<Activity className="w-6 h-6" />}
            color="bg-purple-100 text-purple-800"
          />
          <StatCard
            label="Allowed"
            value={stats.allowedRequests}
            icon={<CheckCircle className="w-6 h-6" />}
            color="bg-green-100 text-green-800"
          />
          <StatCard
            label="Blocked"
            value={stats.blockedRequests}
            icon={<ShieldX className="w-6 h-6" />}
            color="bg-red-100 text-red-800"
          />
          <StatCard
            label="Pending Approvals"
            value={pendingApprovals.length}
            icon={<Clock className="w-6 h-6" />}
            color="bg-amber-100 text-amber-800"
          />
        </div>
      )}

      {/* Section B: Pending Approvals */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Pending Approvals</h2>
          {pendingApprovals.length > 0 && (
            <Link
              to="/approvals"
              className="text-sm text-purple-600 hover:text-purple-700 font-medium"
            >
              View all →
            </Link>
          )}
        </div>

        {pendingApprovals.length === 0 ? (
          <div className="bg-green-50 border border-green-200 rounded-lg px-5 py-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <p className="text-sm font-medium text-green-800">
              No pending approvals — all clear
            </p>
          </div>
        ) : (
          <div className="border border-amber-200 rounded-lg overflow-hidden bg-white">
            <div className="divide-y divide-gray-100">
              {visibleApprovals.map((req) => (
                <div key={req.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{req.tool}</span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {req.pluginId}
                      </span>
                      <span className="text-xs text-gray-500">by {req.agentName}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatRelativeTime(req.requestedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setSelectedApproval(req)}
                      className="px-3 py-1.5 text-xs font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded hover:bg-purple-100 transition"
                    >
                      Review
                    </button>
                    <button
                      onClick={() => handleApprove(req.id)}
                      disabled={actionLoading === req.id}
                      className="px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 disabled:opacity-50 transition"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleDeny(req.id)}
                      disabled={actionLoading === req.id}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50 transition"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {extraApprovals > 0 && (
              <div className="px-5 py-3 bg-amber-50 border-t border-amber-200">
                <Link
                  to="/approvals"
                  className="text-sm text-amber-700 font-medium hover:text-amber-800"
                >
                  +{extraApprovals} more pending — view all →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section C: Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <Link
            to="/audit"
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            View all →
          </Link>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          {recentLogs.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm">No activity yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tool
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Decision
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {recentLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {formatRelativeTime(log.timestamp)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {log.tool}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.category ? (
                          <CategoryBadge category={log.category} />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <PolicyBadge action={log.policyDecision.action} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Section D: Connected Accounts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Connected Accounts</h2>
          <Link
            to="/accounts"
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Manage →
          </Link>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {PROVIDERS.map((provider) => {
            const count = accountCountByPlugin[provider.id] ?? 0;
            return (
              <div
                key={provider.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 flex flex-col items-center gap-1 text-center"
              >
                <div className="text-gray-600">{provider.icon}</div>
                <span className="text-lg font-bold text-gray-900">{count}</span>
                <span className="text-xs text-gray-500 leading-tight">{provider.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ApprovalModal */}
      {selectedApproval && (
        <ApprovalModal
          request={selectedApproval}
          onApprove={handleApprove}
          onDeny={handleDeny}
          onClose={() => setSelectedApproval(null)}
        />
      )}
    </div>
  );
}
