import { useState } from 'react'
import { parseUnits } from 'viem'
import { useWallet } from '../contexts/WalletContext'
import { useDownloadPurchase } from '../hooks/useDownloadPurchase'
import { FundDialog } from './FundDialog'
import { BUY_PRICE_USDC, USDC_DECIMALS } from '../lib/constants'

interface BuyButtonProps {
  trackId: number
  trackTitle: string
  disabled?: boolean
}

export function BuyButton({ trackId, trackTitle, disabled = false }: BuyButtonProps) {
  const { usdcBalance } = useWallet()
  const { buyTrack, isPending, downloadUrl } = useDownloadPurchase()
  const [showFundDialog, setShowFundDialog] = useState(false)

  const handleBuy = async () => {
    const amountBigInt = parseUnits(BUY_PRICE_USDC.toString(), USDC_DECIMALS)
    if (usdcBalance < amountBigInt) {
      setShowFundDialog(true)
      return
    }
    await buyTrack(trackId)
  }

  const isDisabled = isPending || disabled

  const fundDialog = <FundDialog open={showFundDialog} onClose={() => setShowFundDialog(false)} />

  if (downloadUrl) {
    return (
      <a
        href={downloadUrl}
        download={`${trackTitle}.mp3`}
        className="px-4 py-2 text-sm font-medium rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
      >
        Download Ready
      </a>
    )
  }

  return (
    <>
      <button
        onClick={handleBuy}
        disabled={isDisabled}
        className={`
          px-4 py-2 text-sm font-medium rounded-full transition-colors
          ${
            isDisabled
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-emerald-500 text-white hover:bg-emerald-600'
          }
        `}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Processing...
          </span>
        ) : (
          `Buy $${BUY_PRICE_USDC}`
        )}
      </button>
      {fundDialog}
    </>
  )
}
