import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import {
  Link2,
  LayoutDashboard,
  Plug,
  Shield,
  EyeOff,
  Bell,
  ScrollText,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { DashboardPage } from './pages/DashboardPage';
import { AccountsPage } from './pages/AccountsPage';
import { PoliciesPage } from './pages/PoliciesPage';
import { RedactionPage } from './pages/RedactionPage';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50">
        <Toaster position="top-right" />

        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <Link2 className="w-6 h-6 text-purple-600" />
                <div>
                  <h1 className="text-xl font-bold text-gray-900">CoreLink</h1>
                  <p className="text-xs text-gray-500">Secure AI Access Layer</p>
                </div>
              </div>

              {/* Navigation */}
              <nav className="flex gap-1">
                <NavItem to="/" label="Dashboard" icon={<LayoutDashboard className="w-4 h-4" />} />
                <NavItem to="/accounts" label="Accounts" icon={<Plug className="w-4 h-4" />} />
                <NavItem to="/policies" label="Policies" icon={<Shield className="w-4 h-4" />} />
                <NavItem to="/redaction" label="Redaction" icon={<EyeOff className="w-4 h-4" />} />
                <NavItem to="/approvals" label="Approvals" icon={<Bell className="w-4 h-4" />} />
                <NavItem to="/audit" label="Audit Logs" icon={<ScrollText className="w-4 h-4" />} />
              </nav>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/policies" element={<PoliciesPage />} />
            <Route path="/redaction" element={<RedactionPage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />
            <Route path="/audit" element={<AuditLogsPage />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 mt-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <p className="text-center text-sm text-gray-500">
              CoreLink v0.1.0 - Local-first AI Access Gateway
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

interface NavItemProps {
  to: string;
  label: string;
  icon?: ReactNode;
}

function NavItem({ to, label, icon }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
          isActive
            ? 'bg-purple-100 text-purple-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

export default App;
