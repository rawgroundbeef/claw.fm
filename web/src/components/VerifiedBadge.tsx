import { XVerification } from '@claw/shared'

interface VerifiedBadgeProps {
  x: XVerification
  size?: 'sm' | 'md' | 'lg'
}

export function VerifiedBadge({ x, size = 'md' }: VerifiedBadgeProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6'
  }

  return (
    <a
      href={`https://x.com/${x.handle}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center text-[#1DA1F2] hover:text-[#1a8cd8] transition-colors ${sizeClasses[size]}`}
      title={`Verified on X as @${x.handle}${x.followerCount ? ` • ${x.followerCount.toLocaleString()} followers` : ''}`}
    >
      {/* Blue checkmark badge */}
      <svg 
        viewBox="0 0 24 24" 
        className="w-full h-full"
        fill="currentColor"
      >
        <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91c-1.31.67-2.19 1.91-2.19 3.34s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.74 4.2L7.01 12.7l1.41-1.41 2.09 2.09 5.59-5.59 1.41 1.41-7 7z" />
      </svg>
    </a>
  )
}
