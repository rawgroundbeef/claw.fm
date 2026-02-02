import { useAccount, useBalance } from 'wagmi'
import { parseUnits } from 'viem'
import { useDownloadPurchase } from '../hooks/useDownloadPurchase'
import { useFundWallet } from '../hooks/useFundWallet'
import { BUY_PRICE_USDC, USDC_ADDRESS, USDC_DECIMALS } from '../lib/constants'

interface BuyButtonProps {
  artistWallet: string
  trackId: number
  trackTitle: string
  disabled?: boolean
}

export function BuyButton({ artistWallet, trackId, trackTitle, disabled = false }: BuyButtonProps) {
  const { address, isConnected } = useAccount()
  const { data: balance } = useBalance({
    address,
    token: USDC_ADDRESS as `0x${string}`,
  })
  const { buyTrack, isPending, downloadUrl } = useDownloadPurchase()
  const { promptFunding } = useFundWallet()

  const hasInsufficientBalance = () => {
    if (!balance) return true
    const amountBigInt = parseUnits(BUY_PRICE_USDC.toString(), USDC_DECIMALS)
    return balance.value < amountBigInt
  }

  const handleBuy = async () => {
    // Auto-prompt funding when balance is insufficient
    if (!isConnected || hasInsufficientBalance()) {
      promptFunding()
      return
    }
    await buyTrack(artistWallet, trackId)
  }

  const isDisabled = () => {
    if (isPending || disabled) return true
    return false
  }

  // Download ready state
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

  // Buy button
  return (
    <button
      onClick={handleBuy}
      disabled={isDisabled()}
      className={`
        px-4 py-2 text-sm font-medium rounded-full transition-colors
        ${
          isDisabled()
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
  )
}
