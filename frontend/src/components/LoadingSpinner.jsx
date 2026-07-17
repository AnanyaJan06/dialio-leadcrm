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
    <svg
      className={`${sizeClass} ${toneClass} animate-spin`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-20" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-90"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
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
