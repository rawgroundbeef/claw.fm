import { useState } from 'react'
import { parseUnits } from 'viem'
import { useWallet } from '../contexts/WalletContext'
import { useUSDCTransfer } from '../hooks/useUSDCTransfer'
import { FundDialog } from './FundDialog'
import { TIP_AMOUNTS, USDC_DECIMALS } from '../lib/constants'

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
      <div className="flex items-center flex-wrap justify-center" style={{ gap: '8px' }}>
        {TIP_AMOUNTS.map((amount) => {
          const isActive = activeAmount === amount

          return (
            <button
              key={amount}
              onClick={() => handleTip(amount)}
              disabled={isButtonDisabled}
              className="flex items-center justify-center font-medium transition-colors"
              style={{
                padding: '10px 20px',
                fontSize: '14px',
                borderRadius: '24px',
                background: isButtonDisabled
                  ? 'var(--bg-hover)'
                  : 'var(--bg-hover)',
                color: isButtonDisabled
                  ? 'var(--text-muted)'
                  : 'var(--text-primary)',
                cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
                opacity: isButtonDisabled ? 0.5 : 1,
                gap: '8px',
              }}
              onMouseEnter={(e) => {
                if (!isButtonDisabled) {
                  e.currentTarget.style.background = 'var(--bg-hover-strong)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isButtonDisabled) {
                  e.currentTarget.style.background = 'var(--bg-hover)'
                }
              }}
            >
              {isActive ? (
                <>
                  <div
                    className="border-2 rounded-full animate-spin"
                    style={{
                      width: '16px',
                      height: '16px',
                      borderColor: 'var(--text-primary)',
                      borderTopColor: 'transparent',
                    }}
                  />
                  ${amount}
                </>
              ) : (
                <>
                  {/* Heart icon */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                  </svg>
                  ${amount}
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
