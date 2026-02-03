interface ReconnectingIndicatorProps {
  isReconnecting: boolean
  isOffline: boolean
}

export function ReconnectingIndicator({
  isReconnecting,
  isOffline,
}: ReconnectingIndicatorProps) {
  if (!isOffline && !isReconnecting) {
    return null
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300">
      <div
        className="rounded-full px-4 py-2 text-sm shadow-lg"
        style={{
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border)',
        }}
      >
        {isReconnecting ? (
          <span className="flex items-center space-x-2">
            <span>Reconnecting</span>
            <span className="inline-flex space-x-1">
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: 'var(--accent)', animation: 'pulse 1.5s ease-in-out infinite' }}
              />
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: 'var(--accent)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.2s' }}
              />
              <span
                className="w-1 h-1 rounded-full"
                style={{ background: 'var(--accent)', animation: 'pulse 1.5s ease-in-out infinite', animationDelay: '0.4s' }}
              />
            </span>
          </span>
        ) : (
          <span>Connection lost</span>
        )}
      </div>
    </div>
  )
}
