import { useState } from 'react';

interface JSONEditorProps {
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  placeholder?: string;
  className?: string;
}

export function JSONEditor({ value, onChange, placeholder, className = '' }: JSONEditorProps) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleChange = (newText: string) => {
    setText(newText);
    try {
      const parsed = JSON.parse(newText);
      setError(null);
      onChange(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid JSON');
    }
  };

  return (
    <div className={className}>
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        className={`font-mono text-sm w-full rounded-md border ${
          error ? 'border-red-300 focus:border-red-500 focus:ring-red-500' : 'border-gray-300 focus:border-purple-500 focus:ring-purple-500'
        } shadow-sm p-3`}
        rows={8}
      />
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
