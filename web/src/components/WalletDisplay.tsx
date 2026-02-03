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
          className="transition-colors"
          style={{
            padding: '8px 16px',
            fontSize: '13px',
            borderRadius: '20px',
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.color = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
        >
          Fund
        </button>
        <div
          className="flex items-center"
          style={{
            fontSize: '13px',
            color: 'var(--text-tertiary)',
            gap: '6px',
          }}
        >
          <span>{truncatedAddress}</span>
          <span style={{ color: 'var(--text-muted)' }}>&middot;</span>
          <span>{formattedBalance} USDC</span>
        </div>
      </div>
      <FundDialog open={showFundDialog} onClose={() => setShowFundDialog(false)} />
    </>
  )
}
