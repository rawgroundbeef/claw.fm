import { LikeButtonPill } from './LikeButton'
import { TipButtons } from './TipButtons'
import { BuyButton } from './BuyButton'

interface ActionBarProps {
  trackId: number
  trackTitle: string
  onTipSuccess?: () => void
}

// Vertical divider between action groups
function Divider() {
  return (
    <div
      style={{
        width: '1px',
        height: '24px',
        background: 'var(--border)',
        margin: '0 6px',
      }}
    />
  )
}

/**
 * Action bar with three distinct zones:
 * [Like (free)] | [Tips (USDC)] | [Buy (USDC)]
 */
export function ActionBar({ trackId, trackTitle, onTipSuccess }: ActionBarProps) {
  return (
    <div
      className="flex items-center justify-center flex-wrap"
      style={{ gap: '10px' }}
    >
      {/* Like button - leftmost, free action */}
      <LikeButtonPill trackId={trackId} />

      <Divider />

      {/* Tip buttons - middle group, USDC */}
      <TipButtons trackId={trackId} onTipSuccess={onTipSuccess} />

      <Divider />

      {/* Buy button - rightmost, USDC */}
      <BuyButton trackId={trackId} trackTitle={trackTitle} />
    </div>
  )
}
