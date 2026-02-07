import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useWallet } from '../contexts/WalletContext'
import { isValidRecoveryCode } from '../lib/walletCrypto'

interface WalletLockModalProps {
  open: boolean
  onClose: () => void
}

type Tab = 'lock' | 'restore' | 'fund'

export function WalletLockModal({ open, onClose }: WalletLockModalProps) {
  const { address, formattedBalance, isLocked, lockWallet, restoreWallet, usdcBalance } = useWallet()
  const [activeTab, setActiveTab] = useState<Tab>(isLocked ? 'fund' : 'lock')
  const [copied, setCopied] = useState(false)

  // Lock tab state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLocking, setIsLocking] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [recoveryCodeCopied, setRecoveryCodeCopied] = useState(false)

  // Restore tab state
  const [restoreCode, setRestoreCode] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)
  const [showBalanceWarning, setShowBalanceWarning] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab(isLocked ? 'fund' : 'lock')
      setUsername('')
      setPassword('')
      setConfirmPassword('')
      setRecoveryCode(null)
      setRestoreCode('')
      setRestorePassword('')
      setShowBalanceWarning(false)
    }
  }, [open, isLocked])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleCopyAddress = useCallback(() => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied!')
    setTimeout(() => setCopied(false), 2000)
  }, [address])

  const handleLock = async () => {
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    setIsLocking(true)
    try {
      const code = await lockWallet(password, username.trim() || undefined)
      setRecoveryCode(code)
      toast.success('Wallet secured!')
    } catch (err) {
      toast.error('Failed to secure wallet')
    } finally {
      setIsLocking(false)
    }
  }

  const handleCopyRecoveryCode = useCallback(() => {
    if (!recoveryCode) return
    navigator.clipboard.writeText(recoveryCode)
    setRecoveryCodeCopied(true)
    toast.success('Recovery code copied!')
    setTimeout(() => setRecoveryCodeCopied(false), 2000)
  }, [recoveryCode])

  const handleDownloadRecoveryCode = useCallback(() => {
    if (!recoveryCode) return
    const blob = new Blob([recoveryCode], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `claw-wallet-${address.slice(0, 8)}.claw`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('Recovery file downloaded!')
  }, [recoveryCode, address])

  const handleRestore = async () => {
    if (!restoreCode.trim()) {
      toast.error('Please enter your recovery code')
      return
    }
    if (!isValidRecoveryCode(restoreCode.trim())) {
      toast.error('Invalid recovery code format')
      return
    }
    if (!restorePassword) {
      toast.error('Please enter your password')
      return
    }

    // Show balance warning if current wallet has funds
    if (usdcBalance > 0n && !showBalanceWarning) {
      setShowBalanceWarning(true)
      return
    }

    setIsRestoring(true)
    try {
      await restoreWallet(restoreCode.trim(), restorePassword)
      // Page will reload on success
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to restore wallet')
      setIsRestoring(false)
    }
  }

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        if (content) {
          setRestoreCode(content.trim())
        }
      }
      reader.readAsText(file)
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        if (content) {
          setRestoreCode(content.trim())
        }
      }
      reader.readAsText(file)
    }
  }, [])

  if (!open) return null

  const tabStyle = (tab: Tab) => ({
    flex: 1,
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500 as const,
    border: 'none',
    background: activeTab === tab ? 'var(--bg-hover)' : 'transparent',
    color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: 'pointer' as const,
    borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent',
    transition: 'all 0.15s ease',
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Dialog */}
      <div
        className="relative max-w-sm w-full mx-4"
        style={{
          background: 'var(--bg-elevated)',
          borderRadius: '16px',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 transition-colors z-10"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          <button style={tabStyle('lock')} onClick={() => setActiveTab('lock')}>
            {isLocked ? 'Locked' : 'Lock'}
          </button>
          <button style={tabStyle('restore')} onClick={() => setActiveTab('restore')}>
            Restore
          </button>
          <button style={tabStyle('fund')} onClick={() => setActiveTab('fund')}>
            Fund
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto' }}>
          {/* Lock Tab */}
          {activeTab === 'lock' && !recoveryCode && (
            <>
              {isLocked ? (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: 'rgba(74, 222, 128, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
                    Wallet Secured
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                    Your wallet is protected with a recovery code.
                  </p>
                </div>
              ) : (
                <>
                  {/* Warning */}
                  <div style={{
                    background: 'rgba(250, 204, 21, 0.1)',
                    border: '1px solid rgba(250, 204, 21, 0.3)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                  }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: 0 }}>
                      <strong style={{ color: '#facc15' }}>Important:</strong> Your private key is only stored in this browser. Secure it now to avoid losing access to your funds.
                    </p>
                  </div>

                  {/* Username field */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}>
                      Username (optional)
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--text-muted)',
                        fontSize: '14px',
                      }}>@</span>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                        placeholder="your_name"
                        maxLength={20}
                        style={{
                          width: '100%',
                          padding: '10px 12px 10px 28px',
                          fontSize: '14px',
                          borderRadius: '8px',
                          border: '1px solid var(--border)',
                          background: 'var(--bg-hover)',
                          color: 'var(--text-primary)',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  {/* Password fields */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}>
                      Password
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: '14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-hover)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{
                      display: 'block',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      marginBottom: '6px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                    }}>
                      Confirm Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter password"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: '14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-hover)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <button
                    onClick={handleLock}
                    disabled={isLocking || password.length < 8 || password !== confirmPassword}
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '14px',
                      fontWeight: 600,
                      borderRadius: '8px',
                      border: 'none',
                      background: 'var(--accent)',
                      color: 'white',
                      cursor: isLocking ? 'default' : 'pointer',
                      opacity: isLocking || password.length < 8 || password !== confirmPassword ? 0.5 : 1,
                    }}
                  >
                    {isLocking ? 'Securing...' : 'Secure My Wallet'}
                  </button>
                </>
              )}
            </>
          )}

          {/* Recovery Code Display */}
          {activeTab === 'lock' && recoveryCode && (
            <>
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: 'rgba(74, 222, 128, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h3 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                  Wallet Secured!
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Save your recovery code somewhere safe
                </p>
              </div>

              {/* Recovery code display */}
              <div style={{
                background: 'var(--bg-hover)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '12px',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                fontSize: '11px',
                color: 'var(--text-secondary)',
                maxHeight: '100px',
                overflowY: 'auto',
              }}>
                {recoveryCode}
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button
                  onClick={handleCopyRecoveryCode}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  {recoveryCodeCopied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={handleDownloadRecoveryCode}
                  style={{
                    flex: 1,
                    padding: '10px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  Download .claw
                </button>
              </div>

              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                I've Saved It
              </button>
            </>
          )}

          {/* Restore Tab */}
          {activeTab === 'restore' && (
            <>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px' }}>
                Restore your wallet using your recovery code and password.
              </p>

              {/* Recovery code textarea with drag-drop */}
              <div style={{ marginBottom: '12px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>
                  Recovery Code
                </label>
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  style={{ position: 'relative' }}
                >
                  <textarea
                    value={restoreCode}
                    onChange={(e) => setRestoreCode(e.target.value)}
                    placeholder="Paste your recovery code or drag a .claw file here"
                    style={{
                      width: '100%',
                      height: '80px',
                      padding: '10px 12px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-hover)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      resize: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".claw,.txt"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      bottom: '8px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    Browse
                  </button>
                </div>
              </div>

              {/* Password field */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--text-muted)',
                  marginBottom: '6px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}>
                  Password
                </label>
                <input
                  type="password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-hover)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Balance warning */}
              {showBalanceWarning && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '8px',
                  padding: '12px',
                  marginBottom: '16px',
                }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '12px', margin: 0 }}>
                    <strong style={{ color: '#ef4444' }}>Warning:</strong> Your current wallet has {formattedBalance} USDC. Restoring will replace it. Click Restore again to confirm.
                  </p>
                </div>
              )}

              <button
                onClick={handleRestore}
                disabled={isRestoring || !restoreCode.trim() || !restorePassword}
                style={{
                  width: '100%',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 600,
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'white',
                  cursor: isRestoring ? 'default' : 'pointer',
                  opacity: isRestoring || !restoreCode.trim() || !restorePassword ? 0.5 : 1,
                }}
              >
                {isRestoring ? 'Restoring...' : showBalanceWarning ? 'Confirm Restore' : 'Restore Wallet'}
              </button>
            </>
          )}

          {/* Fund Tab */}
          {activeTab === 'fund' && (
            <>
              <p
                className="text-sm mb-5"
                style={{ color: 'var(--text-secondary)' }}
              >
                Send USDC on Base network to the address below. Your balance updates automatically.
              </p>

              {/* Address */}
              <div className="mb-4">
                <label
                  className="block text-xs font-medium uppercase mb-1.5"
                  style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}
                >
                  Your address
                </label>
                <button
                  onClick={handleCopyAddress}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg transition-colors text-left"
                  style={{
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                >
                  {/* Base logo */}
                  <svg className="shrink-0" width="20" height="20" viewBox="0 0 111 111" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF" />
                    <path d="M55.3909 93.3068C76.2963 93.3068 93.2476 76.3555 93.2476 55.4501C93.2476 34.5447 76.2963 17.5934 55.3909 17.5934C35.5006 17.5934 19.198 33.0186 17.5934 52.4867H65.8386V58.4135H17.5934C19.198 77.8816 35.5006 93.3068 55.3909 93.3068Z" fill="white" />
                  </svg>
                  <span
                    className="text-sm font-mono truncate"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {address}
                  </span>
                  <span
                    className="shrink-0 text-xs font-medium"
                    style={{ color: 'var(--accent)' }}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </span>
                </button>
              </div>

              {/* Balance */}
              <div className="mb-5">
                <label
                  className="block text-xs font-medium uppercase mb-1.5"
                  style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}
                >
                  Current balance
                </label>
                <div
                  className="px-3 py-2.5 rounded-lg"
                  style={{
                    background: 'var(--bg-hover)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {formattedBalance} USDC
                  </span>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-2.5 mb-5">
                <div className="flex gap-2.5">
                  <span
                    className="shrink-0 w-5 h-5 rounded-full text-xs font-semibold flex items-center justify-center mt-0.5"
                    style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                  >
                    1
                  </span>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Copy the address above</p>
                </div>
                <div className="flex gap-2.5">
                  <span
                    className="shrink-0 w-5 h-5 rounded-full text-xs font-semibold flex items-center justify-center mt-0.5"
                    style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                  >
                    2
                  </span>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Send USDC on <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Base</span> from any wallet or exchange
                  </p>
                </div>
                <div className="flex gap-2.5">
                  <span
                    className="shrink-0 w-5 h-5 rounded-full text-xs font-semibold flex items-center justify-center mt-0.5"
                    style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}
                  >
                    3
                  </span>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Balance updates within seconds</p>
                </div>
              </div>

              <button
                onClick={handleCopyAddress}
                className="w-full py-2.5 text-sm font-medium rounded-lg transition-colors"
                style={{
                  background: 'var(--accent)',
                  color: 'white',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
              >
                {copied ? 'Copied!' : 'Copy Address'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
