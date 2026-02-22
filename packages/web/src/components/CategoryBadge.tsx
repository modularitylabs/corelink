import type { PolicyCategory } from '../api/client';

interface CategoryBadgeProps {
  category: PolicyCategory | string;
  className?: string;
}

const categoryIcons: Record<string, string> = {
  email: '📧',
  calendar: '📅',
  task: '✓',
  file: '📁',
  global: '🌐',
};

const badgeStyles: Record<string, string> = {
  email: 'bg-purple-100 text-purple-800 border-purple-200',
  calendar: 'bg-blue-100 text-blue-800 border-blue-200',
  task: 'bg-green-100 text-green-800 border-green-200',
  file: 'bg-orange-100 text-orange-800 border-orange-200',
  global: 'bg-gray-100 text-gray-800 border-gray-200',
};

export function CategoryBadge({ category, className = '' }: CategoryBadgeProps) {
  const icon = categoryIcons[category] || '📦';
  const style = badgeStyles[category] || 'bg-gray-100 text-gray-800 border-gray-200';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${style} ${className}`}
    >
      <span>{icon}</span>
      <span className="capitalize">{category}</span>
    </span>
  );
}
