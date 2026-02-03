import { useState } from 'react'
import { toast } from 'sonner'
import { useWallet } from '../contexts/WalletContext'
import { API_URL } from '../lib/constants'

interface TransferResult {
  success: boolean
  error?: string
}

export function useUSDCTransfer() {
  const { paymentFetch, refreshBalance } = useWallet()
  const [isPending, setIsPending] = useState(false)

  const sendTip = async (trackId: number, amount: number): Promise<TransferResult> => {
    setIsPending(true)
    const toastId = toast.loading('Sending tip...')

    try {
      const res = await paymentFetch(`${API_URL}/api/tip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId, amount }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(data.error || `Tip failed (${res.status})`)
      }

      toast.dismiss(toastId)
      toast.success('Tip sent!')
      await refreshBalance()
      setIsPending(false)
      return { success: true }
    } catch (error) {
      toast.dismiss(toastId)
      const errorMessage = error instanceof Error ? error.message : 'Transaction failed'
      toast.error(errorMessage)
      setIsPending(false)
      return { success: false, error: errorMessage }
    }
  }

  return { sendTip, isPending }
}
