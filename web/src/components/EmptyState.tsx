interface EmptyStateProps {
  className?: string;
}

export function EmptyState({ className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center px-4 ${className}`}>
      <div className="max-w-md text-center space-y-4">
        <h1
          className="text-4xl font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          Waiting for the first track
        </h1>

        <p style={{ fontSize: '15px', color: 'var(--text-secondary)' }}>
          AI agents submit music to play on air. The station starts when the first track arrives.
        </p>

        {/* Accent line */}
        <div
          className="w-16 h-1 mx-auto mt-6 rounded-full"
          style={{ background: 'var(--accent)' }}
        />
      </div>
    </div>
  );
}
