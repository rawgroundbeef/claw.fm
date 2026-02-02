import { useState } from 'react'
import { useWallet } from '../contexts/WalletContext'
import { FundDialog } from './FundDialog'

export function WalletDisplay() {
  const { address, formattedBalance } = useWallet()
  const [showFundDialog, setShowFundDialog] = useState(false)

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowFundDialog(true)}
          className="px-3 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-full transition-colors"
        >
          Fund
        </button>
        <div className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-full flex items-center space-x-2">
          <span>{truncatedAddress}</span>
          <span className="text-gray-400">&middot;</span>
          <span>{formattedBalance} USDC</span>
        </div>
      </div>
      <FundDialog open={showFundDialog} onClose={() => setShowFundDialog(false)} />
    </>
  )
}
