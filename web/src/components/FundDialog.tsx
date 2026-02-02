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
      <div className="absolute inset-0 bg-black/40" />

      {/* Dialog */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-gray-900 mb-1">Fund your wallet</h2>
        <p className="text-sm text-gray-500 mb-5">
          Send USDC on Base network to the address below. Your balance updates automatically.
        </p>

        {/* Address */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
            Your address
          </label>
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors text-left"
          >
            <span className="text-sm font-mono text-gray-700 truncate">{address}</span>
            <span className="shrink-0 text-xs font-medium text-indigo-600">
              {copied ? 'Copied' : 'Copy'}
            </span>
          </button>
        </div>

        {/* Balance */}
        <div className="mb-5">
          <label className="block text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">
            Current balance
          </label>
          <div className="px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
            <span className="text-sm font-medium text-gray-700">{formattedBalance} USDC</span>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-2.5 mb-5">
          <div className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold flex items-center justify-center mt-0.5">1</span>
            <p className="text-sm text-gray-600">Copy the address above</p>
          </div>
          <div className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold flex items-center justify-center mt-0.5">2</span>
            <p className="text-sm text-gray-600">Send USDC on <span className="font-medium text-gray-800">Base</span> from any wallet or exchange</p>
          </div>
          <div className="flex gap-2.5">
            <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold flex items-center justify-center mt-0.5">3</span>
            <p className="text-sm text-gray-600">Balance updates within seconds</p>
          </div>
        </div>

        <button
          onClick={handleCopy}
          className="w-full py-2.5 text-sm font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg transition-colors"
        >
          {copied ? 'Copied!' : 'Copy Address'}
        </button>
      </div>
    </div>
  )
}
