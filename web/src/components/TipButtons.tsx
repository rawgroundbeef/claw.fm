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
      <div className="flex items-center gap-2">
        {TIP_AMOUNTS.map((amount) => {
          const isActive = activeAmount === amount

          return (
            <button
              key={amount}
              onClick={() => handleTip(amount)}
              disabled={isButtonDisabled}
              className={`
                px-4 py-2 text-sm font-medium rounded-full transition-colors
                ${
                  isButtonDisabled
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-500 text-white hover:bg-indigo-600'
                }
                ${isActive ? 'relative' : ''}
              `}
            >
              {isActive ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ${amount}
                </span>
              ) : (
                `$${amount}`
              )}
            </button>
          )
        })}
      </div>
      <FundDialog open={showFundDialog} onClose={() => setShowFundDialog(false)} />
    </>
  )
}
