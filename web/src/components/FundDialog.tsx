import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { useWallet } from '../contexts/WalletContext'

interface FundDialogProps {
  open: boolean
  onClose: () => void
}

export function FundDialog({ open, onClose }: FundDialogProps) {
  const { address, formattedBalance } = useWallet()
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied!')
    setTimeout(() => setCopied(false), 2000)
  }, [address])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Dialog */}
      <div
        className="relative max-w-sm w-full mx-4 p-6"
        style={{
          background: 'var(--bg-elevated)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 transition-colors"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2
          className="text-lg font-semibold mb-1"
          style={{ color: 'var(--text-primary)' }}
        >
          Your Wallet
        </h2>
        <p
          className="text-sm mb-5"
          style={{ color: 'var(--text-secondary)' }}
        >
          Send USDC on Base network to the address below. Your balance updates automatically.
        </p>

        {/* Address */}
        <div className="mb-4">
          <label
            className="block text-xs font-medium uppercase mb-1.5"
            style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}
          >
            Your address
          </label>
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg transition-colors text-left"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          >
            {/* Base logo */}
            <svg className="shrink-0" width="20" height="20" viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF" />
              <path d="M55.3909 93.3068C76.2963 93.3068 93.2476 76.3555 93.2476 55.4501C93.2476 34.5447 76.2963 17.5934 55.3909 17.5934C35.5006 17.5934 19.198 33.0186 17.5934 52.4867H65.8386V58.4135H17.5934C19.198 77.8816 35.5006 93.3068 55.3909 93.3068Z" fill="white" />
            </svg>
            <span
              className="text-sm font-mono truncate"
              style={{ color: 'var(--text-secondary)' }}
            >
              {address}
            </span>
            <span
              className="shrink-0 text-xs font-medium"
              style={{ color: 'var(--accent)' }}
            >
              {copied ? 'Copied' : 'Copy'}
            </span>
          </button>
        </div>

        {/* Balance */}
        <div className="mb-5">
          <label
            className="block text-xs font-medium uppercase mb-1.5"
            style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}
          >
            Current balance
          </label>
          <div
            className="px-3 py-2.5 rounded-lg"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--border)',
            }}
          >
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              {formattedBalance} USDC
            </span>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-2.5 mb-5">
          <div className="flex gap-2.5">
            <span
              className="shrink-0 w-5 h-5 rounded-full text-xs font-semibold flex items-center justify-center mt-0.5"
              style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
            >
              1
            </span>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Copy the address above</p>
          </div>
          <div className="flex gap-2.5">
            <span
              className="shrink-0 w-5 h-5 rounded-full text-xs font-semibold flex items-center justify-center mt-0.5"
              style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
            >
              2
            </span>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Send USDC on <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Base</span> from any wallet or exchange
            </p>
          </div>
          <div className="flex gap-2.5">
            <span
              className="shrink-0 w-5 h-5 rounded-full text-xs font-semibold flex items-center justify-center mt-0.5"
              style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
            >
              3
            </span>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Balance updates within seconds</p>
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="w-full py-2.5 text-sm font-medium rounded-lg transition-colors"
          style={{
            background: 'var(--accent)',
            color: 'white',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
        >
          {copied ? 'Copied!' : 'Copy Address'}
        </button>
      </div>
    </div>
  )
}
