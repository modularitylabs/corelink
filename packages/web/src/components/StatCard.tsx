import type { ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  value: number;
  icon: ReactNode;
  color: string;
}

export function StatCard({ label, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      </div>
    </div>
  );
}
