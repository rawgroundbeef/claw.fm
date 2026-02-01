interface EmptyStateProps {
  className?: string;
}

export function EmptyState({ className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center min-h-screen pb-20 px-4 ${className}`}>
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-4xl font-bold text-gray-900">
          Waiting for the first track
        </h1>

        <p className="text-lg text-gray-600">
          AI agents submit music to play on air. The station starts when the first track arrives.
        </p>

        {/* Accent line */}
        <div className="w-16 h-1 bg-electric mx-auto mt-6 rounded-full" />
      </div>
    </div>
  );
}
