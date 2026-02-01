import type { Context } from 'hono'

export interface PaymentRequirements {
  scheme: 'exact'
  network: string
  asset: string
  maxAmountRequired: string
  resource: string
  description: string
  payTo?: string
}

export interface PaymentVerificationResult {
  valid: boolean
  walletAddress?: string
  error?: Response
}

/**
 * Verify x402 payment header and extract wallet address
 * This is called manually in the submit route after validation passes
 */
export async function verifyPayment(c: Context): Promise<PaymentVerificationResult> {
  // Check for payment header (support both X-PAYMENT and PAYMENT-SIGNATURE)
  const paymentHeader = c.req.header('X-PAYMENT') || c.req.header('PAYMENT-SIGNATURE')

  // Payment requirements for track submission
  const paymentRequirements: PaymentRequirements = {
    scheme: 'exact',
    network: 'eip155:8453', // Base mainnet
    asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
    maxAmountRequired: '10000', // 0.01 USDC (6 decimals)
    resource: '/api/submit',
    description: 'Track submission fee',
    payTo: c.env.PLATFORM_WALLET as string,
  }

  // If no payment header present, return 402 Payment Required
  if (!paymentHeader) {
    // Encode payment requirements as base64 for X-PAYMENT-REQUIRED header
    const requirementsBase64 = btoa(JSON.stringify(paymentRequirements))

    const errorResponse = c.json(
      {
        error: 'PAYMENT_REQUIRED',
        message: 'Payment of 0.01 USDC required to submit track',
        paymentRequirements,
      },
      402,
      {
        'X-PAYMENT-REQUIRED': requirementsBase64,
      }
    )

    return {
      valid: false,
      error: errorResponse,
    }
  }

  // Verify payment with facilitator
  try {
    const facilitatorUrl = 'https://x402.org/facilitator/verify'

    const verifyPayload = {
      payment: paymentHeader,
      requirements: paymentRequirements,
    }

    const response = await fetch(facilitatorUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(verifyPayload),
    })

    if (!response.ok) {
      const errorResponse = c.json(
        {
          error: 'PAYMENT_INVALID',
          message: 'Payment verification failed',
        },
        402
      )

      return {
        valid: false,
        error: errorResponse,
      }
    }

    const verifyResult = await response.json<{ valid: boolean; walletAddress?: string }>()

    if (!verifyResult.valid || !verifyResult.walletAddress) {
      const errorResponse = c.json(
        {
          error: 'PAYMENT_INVALID',
          message: 'Payment signature is invalid',
        },
        402
      )

      return {
        valid: false,
        error: errorResponse,
      }
    }

    // Payment verified successfully
    return {
      valid: true,
      walletAddress: verifyResult.walletAddress,
    }
  } catch (error) {
    const errorResponse = c.json(
      {
        error: 'PAYMENT_VERIFICATION_ERROR',
        message: `Payment verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      500
    )

    return {
      valid: false,
      error: errorResponse,
    }
  }
}
