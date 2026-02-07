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
        className="flex items-center justify-center font-medium transition-colors"
        style={{
          padding: '10px 20px',
          fontSize: '14px',
          borderRadius: '24px',
          background: 'var(--accent)',
          color: 'white',
          gap: '8px',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        Download
      </a>
    )
  }

  return (
    <>
      <button
        onClick={handleBuy}
        disabled={isDisabled}
        className="flex items-center justify-center transition-all"
        style={{
          padding: '8px 18px',
          fontSize: '14px',
          fontWeight: 600,
          borderRadius: '20px',
          border: 'none',
          background: isDisabled ? 'var(--bg-hover)' : 'var(--accent)',
          color: isDisabled ? 'var(--text-muted)' : 'white',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          gap: '6px',
        }}
        onMouseEnter={(e) => {
          if (!isDisabled) {
            e.currentTarget.style.background = 'var(--accent-hover)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isDisabled) {
            e.currentTarget.style.background = 'var(--accent)'
            e.currentTarget.style.transform = 'translateY(0)'
          }
        }}
      >
        {isPending ? (
          <>
            <div
              className="border-2 border-white rounded-full animate-spin"
              style={{ width: '16px', height: '16px', borderTopColor: 'transparent' }}
            />
            Processing...
          </>
        ) : (
          <>
            {/* Download icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            ${BUY_PRICE_USDC}
          </>
        )}
      </button>
      {fundDialog}
    </>
  )
}
