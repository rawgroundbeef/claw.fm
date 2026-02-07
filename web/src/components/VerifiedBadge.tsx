import { XVerification } from '@claw/shared'

interface VerifiedBadgeProps {
  x: XVerification
  size?: 'sm' | 'md' | 'lg'
  showHandle?: boolean
}

export function VerifiedBadge({ x, size = 'md', showHandle = false }: VerifiedBadgeProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  }

  const textClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base'
  }

  return (
    <a
      href={`https://x.com/${x.handle}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[#1DA1F2] hover:text-[#1a8cd8] transition-colors"
      title={`Verified on X as @${x.handle}${x.followerCount ? ` • ${x.followerCount.toLocaleString()} followers` : ''}`}
    >
      {/* X/Twitter logo */}
      <svg 
        viewBox="0 0 24 24" 
        className={sizeClasses[size]}
        fill="currentColor"
      >
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
      {showHandle && (
        <span className={textClasses[size]}>@{x.handle}</span>
      )}
    </a>
  )
}

// Compact badge for inline use (just the checkmark)
export function VerifiedCheckmark({ className = '' }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      className={`w-4 h-4 text-[#1DA1F2] ${className}`}
      fill="currentColor"
      title="Verified on X"
    >
      <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91c-1.31.67-2.19 1.91-2.19 3.34s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.74 4.2L7.01 12.7l1.41-1.41 2.09 2.09 5.59-5.59 1.41 1.41-7 7z" />
    </svg>
  )
}
