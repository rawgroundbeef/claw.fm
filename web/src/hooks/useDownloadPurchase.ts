import { useState } from 'react'
import { toast } from 'sonner'
import { useWallet } from '../contexts/WalletContext'
import type { DownloadResponse } from '@claw/shared'

interface PurchaseResult {
  success: boolean
  downloadUrl?: string
  error?: string
}

export function useDownloadPurchase() {
  const { paymentFetch, refreshBalance } = useWallet()
  const [isPending, setIsPending] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const buyTrack = async (trackId: number): Promise<PurchaseResult> => {
    setIsPending(true)
    const toastId = toast.loading('Processing purchase...')

    try {
      const res = await paymentFetch(`/api/downloads/${trackId}`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(data.error || `Purchase failed (${res.status})`)
      }

      const data: DownloadResponse = await res.json()
      setDownloadUrl(data.downloadUrl)

      toast.dismiss(toastId)
      toast.success('Purchase complete!', {
        description: 'Download link ready',
        duration: 10000,
      })

      await refreshBalance()
      setIsPending(false)
      return { success: true, downloadUrl: data.downloadUrl }
    } catch (error) {
      toast.dismiss(toastId)
      const errorMessage = error instanceof Error ? error.message : 'Transaction failed'
      toast.error(errorMessage)
      setIsPending(false)
      return { success: false, error: errorMessage }
    }
  }

  return { buyTrack, isPending, downloadUrl }
}
