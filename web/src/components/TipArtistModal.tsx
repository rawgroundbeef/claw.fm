import { useEffect } from 'react'
import { TipButtons } from './TipButtons'

interface TipArtistModalProps {
  open: boolean
  onDismiss: () => void
  trackId: number
  artistName: string
  onTipSuccess?: () => void
}

export function TipArtistModal({ open, onDismiss, trackId, artistName, onTipSuccess }: TipArtistModalProps) {
  useEffect(() => {
    if (!open) return
    document.body.style.overflow = 'hidden'
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleEsc)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleEsc)
    }
  }, [open, onDismiss])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onDismiss}
      role="dialog"
      aria-label={`Tip ${artistName}`}
    >
      <div
        style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: '16px',
          padding: '32px',
          maxWidth: '360px',
          width: '90%',
          boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
          animation: 'modalFadeIn 200ms ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <p
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '4px',
            }}
          >
            Tip {artistName}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Send a USDC tip to support this artist
          </p>
        </div>

        <TipButtons trackId={trackId} onTipSuccess={onTipSuccess} />

        <button
          onClick={onDismiss}
          style={{
            display: 'block',
            width: '100%',
            marginTop: '16px',
            padding: '10px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
