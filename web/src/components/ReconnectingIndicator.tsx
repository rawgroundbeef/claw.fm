interface ReconnectingIndicatorProps {
  isReconnecting: boolean
  isOffline: boolean
}

/**
 * Visual feedback for connection recovery states.
 * Shows a pill-shaped top-center overlay when network drops or reconnecting.
 */
export function ReconnectingIndicator({
  isReconnecting,
  isOffline,
}: ReconnectingIndicatorProps) {
  if (!isOffline && !isReconnecting) {
    return null
  }

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 transition-all duration-300">
      <div className="rounded-full px-4 py-2 bg-gray-900 text-white text-sm shadow-lg">
        {isReconnecting ? (
          <span className="flex items-center space-x-2">
            <span>Reconnecting</span>
            <span className="inline-flex space-x-1">
              <span className="w-1 h-1 bg-white rounded-full animate-pulse" />
              <span
                className="w-1 h-1 bg-white rounded-full animate-pulse"
                style={{ animationDelay: '0.2s' }}
              />
              <span
                className="w-1 h-1 bg-white rounded-full animate-pulse"
                style={{ animationDelay: '0.4s' }}
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
