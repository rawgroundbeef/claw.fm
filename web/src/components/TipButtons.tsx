import { useState } from 'react'
import { parseUnits } from 'viem'
import { useWallet } from '../contexts/WalletContext'
import { useUSDCTransfer } from '../hooks/useUSDCTransfer'
import { FundDialog } from './FundDialog'
import { TIP_AMOUNTS, USDC_DECIMALS } from '../lib/constants'

// Dollar sign icon (Lucide-style)
function DollarIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

interface TipButtonsProps {
  trackId: number
  disabled?: boolean
  onTipSuccess?: () => void
}

export function TipButtons({ trackId, disabled = false, onTipSuccess }: TipButtonsProps) {
  const { usdcBalance } = useWallet()
  const { sendTip, isPending } = useUSDCTransfer()
  const [activeAmount, setActiveAmount] = useState<number | null>(null)
  const [showFundDialog, setShowFundDialog] = useState(false)

  const handleTip = async (amount: number) => {
    const amountBigInt = parseUnits(amount.toString(), USDC_DECIMALS)
    if (usdcBalance < amountBigInt) {
      setShowFundDialog(true)
      return
    }

    setActiveAmount(amount)
    const result = await sendTip(trackId, amount)
    setActiveAmount(null)

    if (result.success) {
      onTipSuccess?.()
    }
  }

  const isButtonDisabled = isPending || disabled

  return (
    <>
      <div className="flex items-center" style={{ gap: '8px' }}>
        {TIP_AMOUNTS.map((amount) => {
          const isActive = activeAmount === amount

          return (
            <button
              key={amount}
              onClick={() => handleTip(amount)}
              disabled={isButtonDisabled}
              className="flex items-center justify-center transition-all"
              style={{
                padding: '8px 14px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                borderRadius: '20px',
                background: 'transparent',
                border: '1px solid var(--border)',
                color: isButtonDisabled ? 'var(--text-muted)' : 'var(--text-secondary)',
                cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
                opacity: isButtonDisabled ? 0.5 : 1,
                gap: '5px',
              }}
              onMouseEnter={(e) => {
                if (!isButtonDisabled) {
                  e.currentTarget.style.borderColor = 'var(--accent)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                  e.currentTarget.style.background = 'var(--accent-dim)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isButtonDisabled) {
                  e.currentTarget.style.borderColor = 'var(--border)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {isActive ? (
                <>
                  <div
                    className="border-2 rounded-full animate-spin"
                    style={{
                      width: '14px',
                      height: '14px',
                      borderColor: 'var(--text-primary)',
                      borderTopColor: 'transparent',
                    }}
                  />
                  {amount}
                </>
              ) : (
                <>
                  <span style={{ color: 'var(--text-tertiary)' }}>
                    <DollarIcon size={14} />
                  </span>
                  {amount}
                </>
              )}
            </button>
          )
        })}
      </div>
      <FundDialog open={showFundDialog} onClose={() => setShowFundDialog(false)} />
    </>
  )
}
