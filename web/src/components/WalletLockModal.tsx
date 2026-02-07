import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { useWallet } from '../contexts/WalletContext'
import { isValidRecoveryCode } from '../lib/walletCrypto'
import { Dialog } from './ui/Dialog'
import { DialogTabs, DialogTabPanel } from './ui/DialogTabs'

interface WalletLockModalProps {
  open: boolean
  onClose: () => void
}

type Tab = 'wallet' | 'keepit' | 'restore'

const TABS = [
  { id: 'wallet', label: 'Wallet' },
  { id: 'keepit', label: 'Keep It' },
  { id: 'restore', label: 'Restore' },
]

export function WalletLockModal({ open, onClose }: WalletLockModalProps) {
  const { address, formattedBalance, lockWallet, restoreWallet, usdcBalance } = useWallet()
  const [activeTab, setActiveTab] = useState<Tab>('wallet')
  const [copied, setCopied] = useState(false)

  // Keep It tab state
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLocking, setIsLocking] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [recoveryCodeCopied, setRecoveryCodeCopied] = useState(false)

  // Restore tab state
  const [restoreCode, setRestoreCode] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [isRestoring, setIsRestoring] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab('wallet')
      setPassword('')
      setConfirmPassword('')
      setRecoveryCode(null)
      setRestoreCode('')
      setRestorePassword('')
    }
  }, [open])

  const handleCopyAddress = useCallback(() => {
    navigator.clipboard.writeText(address)
    setCopied(true)
    toast.success('Address copied!')
    setTimeout(() => setCopied(false), 2000)
  }, [address])

  const handleBackUp = async () => {
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
      const code = await lockWallet(password)
      setRecoveryCode(code)
      toast.success('Wallet backed up!')
    } catch (err) {
      toast.error('Failed to back up wallet')
    } finally {
      setIsLocking(false)
    }
  }

  const handleCopyRecoveryCode = useCallback(() => {
    if (!recoveryCode) return
    navigator.clipboard.writeText(recoveryCode)
    setRecoveryCodeCopied(true)
    toast.success('Recovery phrase copied!')
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
      toast.error('Please enter your recovery phrase')
      return
    }
    if (!isValidRecoveryCode(restoreCode.trim())) {
      toast.error('Invalid recovery phrase format')
      return
    }
    if (!restorePassword) {
      toast.error('Please enter your password')
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

  // Check if current wallet has balance for restore warning
  const hasBalance = usdcBalance > 0n

  return (
    <Dialog open={open} onClose={onClose} aria-label="Wallet settings">
      <DialogTabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(id) => setActiveTab(id as Tab)}
      />

      {/* Wallet Tab */}
      <DialogTabPanel id="wallet" activeTab={activeTab}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5 }}>
          We gave you a <strong style={{ color: 'var(--text-primary)' }}>burner wallet</strong> so you can start tipping right away. Fund it with USDC on Base to tip your favorite artists.
        </p>

        <div style={{ height: '1px', background: 'var(--dialog-border)', marginBottom: '16px' }} />

        {/* Address */}
        <div className="mb-4">
          <label
            className="block text-xs font-medium uppercase mb-1.5"
            style={{ letterSpacing: '0.08em', color: 'var(--text-muted)' }}
          >
            Your Address
          </label>
          <button
            onClick={handleCopyAddress}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg transition-colors text-left"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--dialog-border)',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover-strong)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
          >
            {/* USDC icon */}
            <svg className="shrink-0" width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="16" cy="16" r="16" fill="#2775CA"/>
              <path d="M20.5 18.5C20.5 16.25 19 15.5 16 15C13.75 14.625 13.25 14 13.25 13C13.25 12 14 11.375 15.5 11.375C16.875 11.375 17.625 11.875 17.875 12.875C17.9167 13.0417 18.0833 13.125 18.25 13.125H19.375C19.5833 13.125 19.75 12.9583 19.75 12.75V12.625C19.5 11.125 18.25 9.875 16.5 9.625V8.25C16.5 8.04167 16.3333 7.875 16.125 7.875H15C14.7917 7.875 14.625 8.04167 14.625 8.25V9.625C12.5 9.875 11.125 11.25 11.125 13.125C11.125 15.25 12.625 16.125 15.5 16.625C17.5 17.125 18.25 17.625 18.25 18.75C18.25 19.875 17.25 20.625 15.75 20.625C13.75 20.625 13 19.75 12.75 18.75C12.7083 18.5417 12.5 18.375 12.2917 18.375H11.125C10.9167 18.375 10.75 18.5417 10.75 18.75V18.875C11.0833 20.625 12.375 21.875 14.625 22.125V23.5C14.625 23.7083 14.7917 23.875 15 23.875H16.125C16.3333 23.875 16.5 23.7083 16.5 23.5V22.125C18.625 21.75 20.5 20.5 20.5 18.5Z" fill="white"/>
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
            Current Balance
          </label>
          <div
            className="px-3 py-2.5 rounded-lg"
            style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--dialog-border)',
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
      </DialogTabPanel>

      {/* Keep It Tab */}
      <DialogTabPanel id="keepit" activeTab={activeTab}>
        {!recoveryCode ? (
          <>
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5 }}>
              Your burner wallet lives in this browser. <strong style={{ color: 'var(--text-primary)' }}>Back it up</strong> to keep your balance and use it anywhere.
            </p>

            <div style={{ height: '1px', background: 'var(--dialog-border)', marginBottom: '16px' }} />

            {/* Feature rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>💰</span>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>Keep your balance</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Your USDC stays with you</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>❤️</span>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>Keep your history</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>All your tips and activity preserved</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>🔑</span>
                <div>
                  <div style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 500 }}>Use anywhere</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Restore on any device or browser</div>
                </div>
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
                  border: '1px solid var(--dialog-border)',
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
                  border: '1px solid var(--dialog-border)',
                  background: 'var(--bg-hover)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              onClick={handleBackUp}
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
                marginBottom: '8px',
              }}
            >
              {isLocking ? 'Backing up...' : 'Back Up Wallet'}
            </button>

            <p style={{ color: 'var(--text-muted)', fontSize: '11px', textAlign: 'center' }}>
              You'll be shown a recovery phrase. Write it down.
            </p>
          </>
        ) : (
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
                Wallet Backed Up!
              </h3>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                Save your recovery phrase somewhere safe
              </p>
            </div>

            {/* Recovery code display */}
            <div style={{
              background: 'var(--bg-hover)',
              border: '1px solid var(--dialog-border)',
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
                  border: '1px solid var(--dialog-border)',
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
                  border: '1px solid var(--dialog-border)',
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
      </DialogTabPanel>

      {/* Restore Tab */}
      <DialogTabPanel id="restore" activeTab={activeTab}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5 }}>
          Already backed up a wallet? <strong style={{ color: 'var(--text-primary)' }}>Paste your recovery phrase</strong> below to restore it.
        </p>

        <div style={{ height: '1px', background: 'var(--dialog-border)', marginBottom: '16px' }} />

        {/* Recovery phrase textarea with drag-drop */}
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
            Recovery Phrase
          </label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
            style={{ position: 'relative' }}
          >
            <textarea
              value={restoreCode}
              onChange={(e) => setRestoreCode(e.target.value)}
              placeholder="Paste your recovery phrase or drag a .claw file here"
              style={{
                width: '100%',
                height: '80px',
                padding: '10px 12px',
                fontSize: '12px',
                fontFamily: 'monospace',
                borderRadius: '8px',
                border: '1px solid var(--dialog-border)',
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
                border: '1px solid var(--dialog-border)',
                background: 'var(--dialog-bg)',
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
              border: '1px solid var(--dialog-border)',
              background: 'var(--bg-hover)',
              color: 'var(--text-primary)',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Warning box - always visible */}
        <div style={{
          background: 'var(--warning-bg)',
          border: '1px solid var(--warning-border)',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          display: 'flex',
          gap: '8px',
        }}>
          <span style={{ fontSize: '14px' }}>⚠️</span>
          <p style={{ color: 'var(--warning-text)', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
            This will replace your current burner wallet.{hasBalance && ` You have ${formattedBalance} USDC in it.`} Back it up first under the <strong>Keep It</strong> tab.
          </p>
        </div>

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
          {isRestoring ? 'Restoring...' : 'Restore Wallet'}
        </button>
      </DialogTabPanel>
    </Dialog>
  )
}
