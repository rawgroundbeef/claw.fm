import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import { getOrCreatePrivateKey, createLocalAccount, getPublicClient } from '../lib/wallet'
import { createPaymentFetch } from '../lib/x402fetch'
import { USDC_ADDRESS, ERC20_BALANCE_OF_ABI } from '../lib/constants'

interface WalletContextValue {
  address: `0x${string}`
  usdcBalance: bigint
  formattedBalance: string
  refreshBalance: () => Promise<void>
  paymentFetch: typeof fetch
}

const WalletContext = createContext<WalletContextValue | null>(null)

const BALANCE_POLL_MS = 12_000

export function WalletProvider({ children }: { children: ReactNode }) {
  const [usdcBalance, setUsdcBalance] = useState<bigint>(0n)

  // Stable refs created once on mount
  const stableRef = useRef<{
    address: `0x${string}`
    paymentFetch: typeof fetch
    publicClient: ReturnType<typeof getPublicClient>
  } | null>(null)

  if (!stableRef.current) {
    const pk = getOrCreatePrivateKey()
    const account = createLocalAccount(pk)
    stableRef.current = {
      address: account.address,
      paymentFetch: createPaymentFetch(account),
      publicClient: getPublicClient(),
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

  // Poll balance on mount and every 12s
  useEffect(() => {
    refreshBalance()
    const id = setInterval(refreshBalance, BALANCE_POLL_MS)
    return () => clearInterval(id)
  }, [refreshBalance])

  const formattedBalance = useMemo(
    () => (Number(usdcBalance) / 1e6).toFixed(2),
    [usdcBalance],
  )

  const value = useMemo<WalletContextValue>(
    () => ({ address, usdcBalance, formattedBalance, refreshBalance, paymentFetch }),
    [address, usdcBalance, formattedBalance, refreshBalance, paymentFetch],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
