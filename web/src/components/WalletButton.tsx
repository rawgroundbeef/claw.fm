import { useState } from 'react'
import { useWallet } from '../contexts/WalletContext'
import { FundDialog } from './FundDialog'

export function WalletButton() {
  const { formattedBalance } = useWallet()
  const [showFundDialog, setShowFundDialog] = useState(false)

  return (
    <>
      <button
        onClick={() => setShowFundDialog(true)}
        className="transition-colors"
        style={{
          padding: '8px 16px',
          fontSize: '13px',
          fontWeight: 500,
          borderRadius: '20px',
          background: 'var(--bg-hover)',
          border: 'none',
          color: 'var(--text-primary)',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      >
        {formattedBalance} USDC
      </button>
      <FundDialog open={showFundDialog} onClose={() => setShowFundDialog(false)} />
    </>
  )
}
