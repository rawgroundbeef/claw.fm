import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { getOrCreatePrivateKey, createLocalAccount, getPublicClient, setPrivateKey } from '../lib/wallet'
import { createMultiPaymentFetch } from '../lib/x402fetch'
import { USDC_ADDRESS, ERC20_BALANCE_OF_ABI } from '../lib/constants'
import { encryptPrivateKey, decryptPrivateKey } from '../lib/walletCrypto'

const LOCKED_KEY = 'claw_locked'
const USERNAME_KEY = 'claw_username'
const NUDGES_KEY = 'claw_nudges'

function getNudges(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(NUDGES_KEY) || '{}')
  } catch {
    return {}
  }
}

export function markNudgeShown(nudgeId: string) {
  const nudges = getNudges()
  nudges[nudgeId] = true
  localStorage.setItem(NUDGES_KEY, JSON.stringify(nudges))
}

export function hasNudgeBeenShown(nudgeId: string): boolean {
  return !!getNudges()[nudgeId]
}

interface WalletContextValue {
  address: `0x${string}`
  usdcBalance: bigint
  formattedBalance: string
  refreshBalance: () => Promise<void>
  paymentFetch: typeof fetch
  isLocked: boolean
  username: string | null
  lockWallet: (password: string, username?: string) => Promise<string>
  restoreWallet: (recoveryCode: string, password: string) => Promise<void>
}

const WalletContext = createContext<WalletContextValue | null>(null)

const BALANCE_POLL_MS = 12_000

export function WalletProvider({ children }: { children: ReactNode }) {
  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n)
  const [isLocked, setIsLocked] = useState<boolean>(() => {
    return localStorage.getItem(LOCKED_KEY) === 'true'
  })
  const [username, setUsername] = useState<string | null>(() => {
    return localStorage.getItem(USERNAME_KEY)
  })

  // Stable refs created once on mount
  const stableRef = useRef<{
    address: `0x${string}`
    paymentFetch: typeof fetch
    publicClient: ReturnType<typeof getPublicClient>
    privateKey: `0x${string}`
  } | null>(null)

  if (!stableRef.current) {
    const pk = getOrCreatePrivateKey()
    const account = createLocalAccount(pk)
    stableRef.current = {
      address: account.address,
      paymentFetch: createMultiPaymentFetch(account),
      publicClient: getPublicClient(),
      privateKey: pk,
    }
  }

  const { address, paymentFetch, publicClient } = stableRef.current

  const refreshBalance = useCallback(async () => {
    try {
      const balance = await publicClient.readContract({
        address: USDC_ADDRESS as `0x${string}`,
        abi: ERC20_BALANCE_OF_ABI,
        functionName: 'balanceOf',
        args: [address],
      })
      setUsdcBalance(balance as bigint)
    } catch (err) {
      console.error('Failed to fetch USDC balance:', err)
    }
  }, [address, publicClient])

  // Track previous balance for nudge detection
  const prevBalanceRef = useRef<bigint>(0n)

  // Poll balance on mount and every 12s
  useEffect(() => {
    refreshBalance()
    const id = setInterval(refreshBalance, BALANCE_POLL_MS)
    return () => clearInterval(id)
  }, [refreshBalance])

  // First balance nudge: show when balance goes from 0 to non-zero
  useEffect(() => {
    if (
      !isLocked &&
      usdcBalance > 0n &&
      prevBalanceRef.current === 0n &&
      !getNudges()['first_balance']
    ) {
      markNudgeShown('first_balance')
      toast('You have funds! Secure your wallet to avoid losing access.', {
        action: {
          label: 'Secure Now',
          onClick: () => {
            // Dispatch custom event to open wallet modal
            window.dispatchEvent(new CustomEvent('open-wallet-modal'))
          },
        },
        duration: 8000,
      })
    }
    prevBalanceRef.current = usdcBalance
  }, [usdcBalance, isLocked])

  const formattedBalance = useMemo(
    () => (Number(usdcBalance) / 1e6).toFixed(2),
    [usdcBalance],
  )

  const lockWallet = useCallback(async (password: string, newUsername?: string): Promise<string> => {
    if (!stableRef.current) throw new Error('Wallet not initialized')

    // Encrypt the private key
    const recoveryCode = await encryptPrivateKey(stableRef.current.privateKey, password)

    // Mark as locked in localStorage
    localStorage.setItem(LOCKED_KEY, 'true')
    setIsLocked(true)

    // Save username if provided
    if (newUsername) {
      localStorage.setItem(USERNAME_KEY, newUsername)
      setUsername(newUsername)
    }

    return recoveryCode
  }, [])

  const restoreWallet = useCallback(async (recoveryCode: string, password: string): Promise<void> => {
    // Decrypt the private key
    const pk = await decryptPrivateKey(recoveryCode, password)

    // Validate it's a proper private key
    if (!pk.startsWith('0x') || pk.length !== 66) {
      throw new Error('Invalid private key in recovery code')
    }

    // Set the private key in cookie
    setPrivateKey(pk as `0x${string}`)

    // Mark as locked (since we're restoring a locked wallet)
    localStorage.setItem(LOCKED_KEY, 'true')
    setIsLocked(true)

    // Reload to reinitialize with new key
    window.location.reload()
  }, [])

  const value = useMemo<WalletContextValue>(
    () => ({
      address,
      usdcBalance,
      formattedBalance,
      refreshBalance,
      paymentFetch,
      isLocked,
      username,
      lockWallet,
      restoreWallet,
    }),
    [address, usdcBalance, formattedBalance, refreshBalance, paymentFetch, isLocked, username, lockWallet, restoreWallet],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
