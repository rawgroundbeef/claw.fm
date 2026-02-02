import { useState } from 'react'
import { useAccount, useBalance } from 'wagmi'
import { parseUnits } from 'viem'
import { useUSDCTransfer } from '../hooks/useUSDCTransfer'
import { TIP_AMOUNTS, USDC_ADDRESS, USDC_DECIMALS } from '../lib/constants'

interface TipButtonsProps {
  artistWallet: string
  trackId: number
  disabled?: boolean
  onTipSuccess?: () => void
}

export function TipButtons({ artistWallet, trackId, disabled = false, onTipSuccess }: TipButtonsProps) {
  const { address, isConnected } = useAccount()
  const { data: balance } = useBalance({
    address,
    token: USDC_ADDRESS as `0x${string}`,
  })
  const { sendTransfer, isPending } = useUSDCTransfer()
  const [activeAmount, setActiveAmount] = useState<number | null>(null)

  const handleTip = async (amount: number) => {
    setActiveAmount(amount)
    const result = await sendTransfer(artistWallet, amount)
    setActiveAmount(null)

    if (result.success && result.txHash) {
      // Fire and forget POST to /api/tip to update rotation weight
      try {
        await fetch('/api/tip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackId,
            amount,
            txHash: result.txHash,
          }),
        })
        onTipSuccess?.()
      } catch (error) {
        // Log but don't show error toast - tip was successful
        console.error('Failed to update tip weight:', error)
      }
    }
  }

  const isAmountDisabled = (amount: number) => {
    if (!isConnected || isPending || disabled) return true
    if (!balance) return true
    const amountBigInt = parseUnits(amount.toString(), USDC_DECIMALS)
    return balance.value < amountBigInt
  }

  return (
    <div className="flex items-center gap-2">
      {TIP_AMOUNTS.map((amount) => {
        const isActive = activeAmount === amount
        const isDisabled = isAmountDisabled(amount)

        return (
          <button
            key={amount}
            onClick={() => handleTip(amount)}
            disabled={isDisabled}
            className={`
              px-4 py-2 text-sm font-medium rounded-full transition-colors
              ${
                isDisabled
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
  )
}
