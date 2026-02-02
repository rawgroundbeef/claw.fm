import { useState } from 'react'
import { useWriteContract } from 'wagmi'
import { parseUnits } from 'viem'
import { toast } from 'sonner'
import { USDC_ADDRESS, PLATFORM_WALLET, ERC20_TRANSFER_ABI, USDC_DECIMALS } from '../lib/constants'

interface TransferResult {
  success: boolean
  txHash?: string
  error?: string
}

export function useUSDCTransfer() {
  const { writeContractAsync } = useWriteContract()
  const [isPending, setIsPending] = useState(false)

  const sendTransfer = async (artistWallet: string, usdcAmount: number): Promise<TransferResult> => {
    setIsPending(true)
    let toastId: string | number | undefined

    try {
      // Calculate amounts - artist gets 95%, platform gets remainder
      const total = parseUnits(usdcAmount.toString(), USDC_DECIMALS)
      const artistAmount = (total * 95n) / 100n
      const platformAmount = total - artistAmount

      // Show loading toast
      toastId = toast.loading('Sending tip...')

      // Execute artist transfer (95%)
      const artistTxHash = await writeContractAsync({
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

        // Both transfers succeeded
        toast.dismiss(toastId)
        toast.success('Tip sent!')
        setIsPending(false)
        return { success: true, txHash: artistTxHash }
      } catch (platformError) {
        // Artist transfer succeeded, platform transfer failed
        toast.dismiss(toastId)
        toast.success('Tip sent to artist. Platform fee pending.')
        setIsPending(false)
        return { success: true, txHash: artistTxHash }
      }
    } catch (error) {
      // Artist transfer failed (or error before transfers)
      if (toastId) {
        toast.dismiss(toastId)
      }
      const errorMessage = error instanceof Error ? error.message : 'Transaction failed'
      toast.error(errorMessage)
      setIsPending(false)
      return { success: false, error: errorMessage }
    }
  }

  return { sendTransfer, isPending }
}
