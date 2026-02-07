import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '../contexts/WalletContext'
import { WalletLockModal } from './WalletLockModal'

export function WalletButton() {
  const { formattedBalance, isLocked } = useWallet()
  const [showModal, setShowModal] = useState(false)

  // Listen for custom event to open wallet modal (from nudge toasts)
  const handleOpenModal = useCallback(() => {
    setShowModal(true)
  }, [])

  useEffect(() => {
    window.addEventListener('open-wallet-modal', handleOpenModal)
    return () => window.removeEventListener('open-wallet-modal', handleOpenModal)
  }, [handleOpenModal])

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
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
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
      >
        {/* Status dot */}
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: isLocked ? '#4ade80' : '#facc15',
            flexShrink: 0,
          }}
          title={isLocked ? 'Wallet secured' : 'Wallet not secured'}
        />
        {formattedBalance} USDC
      </button>
      <WalletLockModal open={showModal} onClose={() => setShowModal(false)} />
    </>
  )
}
