import { Loader2 } from 'lucide-react';

function InlineLoader({ label, size = 'sm' }) {
  const sizeClass = {
    xs: 'h-3.5 w-3.5',
    sm: 'h-4 w-4',
    md: 'h-5 w-5'
  }[size];

  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Loader2 className={`${sizeClass} animate-spin`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export default InlineLoader;
