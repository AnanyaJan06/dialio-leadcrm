import { Loader2 } from 'lucide-react';

function LoadingSpinner({ label = 'Loading', size = 'md', tone = 'emerald', inline = false }) {
  const sizeClass = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  }[size];

  const toneClass = {
    white: 'text-white',
    emerald: 'text-emerald-400'
  }[tone];

  const spinner = (
    <Loader2 className={`${sizeClass} ${toneClass} animate-spin`} aria-hidden="true" />
  );

  if (inline) {
    return (
      <span className="inline-flex items-center gap-2">
        {spinner}
        <span>{label}</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-sm text-gray-400">
      {spinner}
      <span>{label}</span>
    </div>
  );
}

export default LoadingSpinner;
