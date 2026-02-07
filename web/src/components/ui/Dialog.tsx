import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  'aria-label'?: string
}

export function Dialog({ open, onClose, children, 'aria-label': ariaLabel }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Focus trap
  useFocusTrap(panelRef, open)

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9999]"
        style={{
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog container */}
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ padding: '20px', pointerEvents: 'none' }}
      >
        {/* Panel */}
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className="dialog-panel"
          style={{
            width: '420px',
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--dialog-bg)',
            border: '1px solid var(--dialog-border)',
            borderRadius: '16px',
            boxShadow: 'var(--dialog-shadow)',
            padding: '28px',
            animation: 'dialogIn 200ms ease-out',
            position: 'relative',
            maxHeight: '90vh',
            overflowY: 'auto',
            pointerEvents: 'auto',
          }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute flex items-center justify-center transition-colors"
            style={{
              top: '25px',
              right: '28px',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'transparent',
              color: 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--text-muted)'
            }}
            aria-label="Close dialog"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {children}
        </div>
      </div>
    </>,
    document.body
  )
}
