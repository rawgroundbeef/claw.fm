import { useCallback } from 'react'
import { getCoinbaseSmartWalletFundUrl } from '@coinbase/onchainkit/fund'
import { toast } from 'sonner'

/**
 * Opens the Coinbase Smart Wallet funding page in a popup.
 * Used for both the header "Fund" button and auto-prompt when balance is insufficient.
 */
export function useFundWallet() {
  const openFundingPopup = useCallback(() => {
    const url = getCoinbaseSmartWalletFundUrl()
    const width = 460
    const height = 750
    const left = (window.innerWidth - width) / 2 + window.screenX
    const top = (window.innerHeight - height) / 2 + window.screenY

    const popup = window.open(
      url,
      'CoinbaseFund',
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes`
    )

    if (!popup) {
      toast.error('Popup blocked. Please allow popups for this site.')
    }
  }, [])

  const promptFunding = useCallback(() => {
    toast('Insufficient USDC balance', {
      description: 'Fund your wallet to tip or buy tracks',
      action: {
        label: 'Fund Wallet',
        onClick: () => openFundingPopup(),
      },
      duration: 8000,
    })
  }, [openFundingPopup])

  return { openFundingPopup, promptFunding }
}
