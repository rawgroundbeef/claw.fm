import { useState } from 'react'
import { useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'
import { toast } from 'sonner'
import { USDC_ADDRESS, PLATFORM_WALLET, ERC20_TRANSFER_ABI, USDC_DECIMALS, BUY_PRICE_USDC } from '../lib/constants'
import type { DownloadResponse } from '@claw/shared'

interface PurchaseResult {
  success: boolean
  downloadUrl?: string
  error?: string
}

export function useDownloadPurchase() {
  const { writeContractAsync } = useWriteContract()
  const [isPending, setIsPending] = useState(false)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const buyTrack = async (artistWallet: string, trackId: number): Promise<PurchaseResult> => {
    setIsPending(true)
    let toastId: string | number | undefined

    try {
      // Calculate amounts - same 95/5 split as tips
      const total = parseUnits(BUY_PRICE_USDC.toString(), USDC_DECIMALS)
      const artistAmount = (total * 95n) / 100n
      const platformAmount = total - artistAmount

      // Show loading toast
      toastId = toast.loading('Processing purchase...')

      // Execute artist transfer (95%)
      await writeContractAsync({
        address: USDC_ADDRESS as `0x${string}`,
        abi: ERC20_TRANSFER_ABI,
        functionName: 'transfer',
        args: [artistWallet as `0x${string}`, artistAmount]
      })

      // Execute platform transfer (5%)
      try {
        await writeContractAsync({
          address: USDC_ADDRESS as `0x${string}`,
          abi: ERC20_TRANSFER_ABI,
          functionName: 'transfer',
          args: [PLATFORM_WALLET as `0x${string}`, platformAmount]
        })
      } catch (platformError) {
        // Artist paid, platform fee failed - still proceed to download
        console.warn('Platform fee transfer failed, but purchase will proceed:', platformError)
      }

      // Both transfers succeeded (or artist succeeded), now get download URL
      try {
        const response = await fetch(`/api/downloads/${trackId}`, {
          method: 'POST'
        })

        if (!response.ok) {
          throw new Error(`Failed to get download URL: ${response.statusText}`)
        }

        const data: DownloadResponse = await response.json()
        setDownloadUrl(data.downloadUrl)

        toast.dismiss(toastId)
        toast.success('Purchase complete!', {
          description: 'Download link ready',
          duration: 10000
        })

        setIsPending(false)
        return { success: true, downloadUrl: data.downloadUrl }
      } catch (downloadError) {
        // Payment sent but download link failed
        toast.dismiss(toastId)
        toast.error('Payment sent but download link failed. Contact support.')
        setIsPending(false)
        const errorMessage = downloadError instanceof Error ? downloadError.message : 'Download link request failed'
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      // Transfer failed
      if (toastId) {
        toast.dismiss(toastId)
      }
      const errorMessage = error instanceof Error ? error.message : 'Transaction failed'
      toast.error(errorMessage)
      setIsPending(false)
      return { success: false, error: errorMessage }
    }
  }

  return { buyTrack, isPending, downloadUrl }
}
