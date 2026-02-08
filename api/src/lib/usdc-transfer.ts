/**
 * USDC Transfer utility for Base mainnet
 * Sends USDC from platform wallet to recipient
 */

import { createWalletClient, createPublicClient, http, encodeFunctionData, type Hex } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// ERC20 transfer function ABI
const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  }
] as const

interface TransferResult {
  success: boolean
  txHash?: string
  error?: string
}

/**
 * Send USDC from platform wallet to recipient
 * @param privateKey Platform wallet private key (with 0x prefix)
 * @param to Recipient wallet address
 * @param amountMicro Amount in USDC micro-units (6 decimals) - e.g., 1000000 = $1
 */
export async function sendUsdc(
  privateKey: string,
  to: string,
  amountMicro: number
): Promise<TransferResult> {
  try {
    // Create account from private key
    const account = privateKeyToAccount(privateKey as Hex)

    // Create clients
    const publicClient = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org')
    })

    const walletClient = createWalletClient({
      account,
      chain: base,
      transport: http('https://mainnet.base.org')
    })

    // Encode transfer call
    const data = encodeFunctionData({
      abi: ERC20_TRANSFER_ABI,
      functionName: 'transfer',
      args: [to as Hex, BigInt(amountMicro)]
    })

    // Estimate gas
    const gasEstimate = await publicClient.estimateGas({
      account,
      to: USDC_ADDRESS,
      data
    })

    // Send transaction
    const txHash = await walletClient.sendTransaction({
      to: USDC_ADDRESS,
      data,
      gas: gasEstimate + BigInt(10000), // Add buffer
    })

    // Wait for confirmation (optional - can remove for faster response)
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      confirmations: 1
    })

    if (receipt.status === 'success') {
      return {
        success: true,
        txHash
      }
    } else {
      return {
        success: false,
        txHash,
        error: 'Transaction reverted'
      }
    }
  } catch (error) {
    console.error('USDC transfer error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check USDC balance of platform wallet
 */
export async function getUsdcBalance(address: string): Promise<number> {
  try {
    const publicClient = createPublicClient({
      chain: base,
      transport: http('https://mainnet.base.org')
    })

    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: [{
        name: 'balanceOf',
        type: 'function',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: '', type: 'uint256' }]
      }],
      functionName: 'balanceOf',
      args: [address as Hex]
    })

    return Number(balance)
  } catch (error) {
    console.error('Balance check error:', error)
    return 0
  }
}
